"""Authentication helpers used by middleware and route dependencies."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

import jwt
from jwt import PyJWTError

from app.core.config import get_settings
from app.core.security import decode_token


settings = get_settings()

_JWKS_TTL_SECONDS = 300
# PyJWKClient's own cache (cache_jwk_set=True by default) replaces the old
# hand-rolled _JWKS_CACHE dict — its `lifespan` matches the previous TTL.
# One client per Auth0 domain (in practice there's only ever one).
_JWKS_CLIENTS: dict[str, "jwt.PyJWKClient"] = {}


def extract_bearer_token(authorization: str | None) -> str | None:
    """Extract bearer token from an Authorization header."""
    if not authorization:
        return None

    parts = authorization.strip().split(" ", 1)
    if len(parts) != 2:
        return None

    scheme, token = parts[0].lower(), parts[1].strip()
    if scheme != "bearer" or not token:
        return None

    return token


def validate_token(token: str) -> tuple[dict[str, Any] | None, str | None]:
    """Validate token using local JWT or Auth0, returning claims and error."""
    provider = (settings.AUTH_PROVIDER or "local").strip().lower()

    if provider == "auth0":
        try:
            claims = _validate_auth0_token(token)
            return claims, None
        except Exception as exc:
            return None, str(exc)

    claims = decode_token(token)
    if not claims:
        return None, "Invalid or expired token"

    return claims, None


def verify_token(token: str) -> dict[str, Any]:
    """Verify a JWT token and return claims, raising an exception if invalid.
    
    Args:
        token: JWT token string
        
    Returns:
        Token claims dictionary
        
    Raises:
        ValueError: If token is invalid or expired
    """
    claims, error = validate_token(token)
    if error or not claims:
        raise ValueError(f"Token validation failed: {error or 'Unknown error'}")
    return claims


def _validate_auth0_token(token: str) -> dict[str, Any]:
    """Validate Auth0 JWT using JWKS signature and standard claims checks.

    Signature verification is delegated to PyJWT (RS256, via the matching
    JWKS key); claim checks (exp/iss/aud) stay in _validate_auth0_claims
    unchanged from before, so the custom messages and the conditional
    audience check (only enforced when AUTH0_AUDIENCE is configured) are
    preserved exactly — claim-verification options below are all disabled
    so jwt.decode() here does signature verification ONLY."""
    domain = (settings.AUTH0_DOMAIN or "").strip()
    if not domain:
        raise ValueError("AUTH0_DOMAIN is not configured")

    jwks_client = _get_jwks_client(domain)
    try:
        signing_key = jwks_client.get_signing_key_from_jwt(token)
    except PyJWTError as exc:
        raise ValueError("Unable to find matching Auth0 signing key") from exc

    try:
        claims = jwt.decode(
            token,
            signing_key.key,
            algorithms=["RS256"],
            options={
                "verify_exp": False,
                "verify_iat": False,
                "verify_nbf": False,
                "verify_aud": False,
                "verify_iss": False,
            },
        )
    except PyJWTError as exc:
        raise ValueError("Invalid Auth0 token signature") from exc

    _validate_auth0_claims(claims, domain)
    return claims


def _validate_auth0_claims(claims: dict[str, Any], domain: str) -> None:
    """Validate issuer, audience, and expiration claims for Auth0 tokens."""
    now_ts = int(datetime.now(tz=timezone.utc).timestamp())

    exp = claims.get("exp")
    if not isinstance(exp, (int, float)) or now_ts >= int(exp):
        raise PyJWTError("Token expired")

    issuer = settings.AUTH0_ISSUER.strip() or f"https://{domain.rstrip('/')}/"
    token_iss = claims.get("iss")
    if token_iss != issuer:
        raise PyJWTError("Invalid token issuer")

    expected_aud = settings.AUTH0_AUDIENCE.strip()
    if expected_aud:
        token_aud = claims.get("aud")
        if isinstance(token_aud, list):
            if expected_aud not in token_aud:
                raise PyJWTError("Invalid token audience")
        elif token_aud != expected_aud:
            raise PyJWTError("Invalid token audience")


def _get_jwks_client(domain: str) -> "jwt.PyJWKClient":
    """PyJWKClient fetches + caches the JWKS itself (cache_jwk_set=True,
    lifespan=_JWKS_TTL_SECONDS matches the old manual TTL) — one client per
    domain, built lazily and reused across requests."""
    client = _JWKS_CLIENTS.get(domain)
    if client is None:
        url = f"https://{domain.rstrip('/')}/.well-known/jwks.json"
        client = jwt.PyJWKClient(url, cache_jwk_set=True, lifespan=_JWKS_TTL_SECONDS, timeout=5)
        _JWKS_CLIENTS[domain] = client
    return client
