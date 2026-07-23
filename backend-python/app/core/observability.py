"""Observability and rate-limiting wiring (Sentry + slowapi)."""
from __future__ import annotations

from starlette.requests import Request

from slowapi import Limiter
from slowapi.util import get_remote_address

from app.core.config import get_settings
from app.core.logging import get_logger

logger = get_logger(__name__)
settings = get_settings()

# Shared limiter instance. Endpoints opt in with @limiter.limit("5/minute").
# Default limits apply to every route unless overridden.
# headers_enabled stays False: when True, slowapi requires every decorated
# endpoint to expose a `response: Response` parameter to inject X-RateLimit-*
# headers, otherwise it raises on success. The 429 response (incl. Retry-After)
# is emitted regardless via _rate_limit_exceeded_handler.
limiter = Limiter(
    key_func=get_remote_address,
    default_limits=["240/minute"],
    storage_uri=settings.REDIS_URL,
    headers_enabled=False,
)


def rate_limit_key_by_user(request: Request) -> str:
    """Rate-limit key for endpoints where the cost is per-account (LLM
    calls), not per-network — IP-based limiting (the Limiter default, right
    for anti-brute-force on auth endpoints) means unrelated candidates
    sharing one public IP under carrier-grade NAT (common on Angolan mobile
    networks) throttle each other on unrelated AI-tool usage.

    slowapi's key_func is only ever called with the raw Request (see
    Limiter.__evaluate_limits in slowapi/extension.py — it inspects the
    key_func's signature for a `request` parameter and calls it with at
    most that one arg; it never has access to FastAPI-resolved dependencies
    like `current_user`, since the rate-limit check runs inside the
    decorator wrapping the endpoint, before request kwargs are meaningfully
    inspectable as anything but the exact params slowapi looks for).

    request.state.auth_claims is set by attach_auth_context, a real ASGI
    `@app.middleware("http")` in main.py that runs before routing/dependency
    resolution on every request — so it's always populated (or None) by the
    time this key_func runs, with no need to re-decode the JWT here.
    Falls back to IP for unauthenticated requests (@limiter.limit still
    applies to e.g. guest endpoints, which have no user to key on).
    """
    claims = getattr(request.state, "auth_claims", None)
    if claims:
        user_id = claims.get("sub") or claims.get("user_id")
        if user_id:
            return f"user:{user_id}"
    return get_remote_address(request)


def rate_limit_key_by_api_key(request: Request) -> str:
    """Rate-limit key for the company-api applications feed (W5.4) — keyed
    per API key, not per network, so one integration's polling can't
    throttle another company sharing the same egress IP. Unlike
    rate_limit_key_by_user, there's no middleware-populated request.state
    to read here (API keys aren't JWTs), so this reads the X-API-Key
    header directly — same slowapi constraint documented on
    rate_limit_key_by_user: key_func only ever receives the raw Request.
    Keys by a hash prefix, never the raw secret, since rate-limit storage
    keys can end up in Redis/logs."""
    from app.core.api_key_auth import API_KEY_HEADER, hash_api_key

    raw_key = request.headers.get(API_KEY_HEADER)
    if raw_key:
        return f"apikey:{hash_api_key(raw_key)[:16]}"
    return get_remote_address(request)


def init_sentry() -> bool:
    """Initialise Sentry if a DSN is configured. Returns True when enabled."""
    # Defensive: a Portainer/.env paste mistake can leave a trailing newline or
    # glue the next variable onto the DSN (we observed
    # '…/4511615953862736APP_ENV=production'). Strip whitespace, keep only the
    # first token, and ignore anything that isn't a real http(s) DSN so a
    # malformed value just disables Sentry instead of spamming warnings.
    dsn = (settings.SENTRY_DSN or "").strip().split()[0] if (settings.SENTRY_DSN or "").strip() else ""
    if not dsn.startswith(("http://", "https://")):
        if dsn:
            logger.warning("SENTRY_DSN is malformed (not an http(s) URL); Sentry disabled.")
        return False
    try:
        import sentry_sdk
        from sentry_sdk.integrations.fastapi import FastApiIntegration
        from sentry_sdk.integrations.starlette import StarletteIntegration

        sentry_sdk.init(
            dsn=dsn,
            environment=settings.APP_ENV,
            traces_sample_rate=settings.SENTRY_TRACES_SAMPLE_RATE,
            integrations=[StarletteIntegration(), FastApiIntegration()],
        )
        logger.info("Sentry initialised (env=%s)", settings.APP_ENV)
        return True
    except Exception as exc:  # pragma: no cover - defensive
        logger.warning("Sentry initialisation failed: %s", exc)
        return False
