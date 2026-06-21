"""Observability and rate-limiting wiring (Sentry + slowapi)."""
from __future__ import annotations

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


def init_sentry() -> bool:
    """Initialise Sentry if a DSN is configured. Returns True when enabled."""
    if not settings.SENTRY_DSN:
        return False
    try:
        import sentry_sdk
        from sentry_sdk.integrations.fastapi import FastApiIntegration
        from sentry_sdk.integrations.starlette import StarletteIntegration

        sentry_sdk.init(
            dsn=settings.SENTRY_DSN,
            environment=settings.APP_ENV,
            traces_sample_rate=settings.SENTRY_TRACES_SAMPLE_RATE,
            integrations=[StarletteIntegration(), FastApiIntegration()],
        )
        logger.info("Sentry initialised (env=%s)", settings.APP_ENV)
        return True
    except Exception as exc:  # pragma: no cover - defensive
        logger.warning("Sentry initialisation failed: %s", exc)
        return False
