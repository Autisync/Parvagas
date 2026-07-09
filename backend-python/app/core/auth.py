"""Authentication helpers used by middleware and route dependencies."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
import time

import requests
from jose import JWTError, jwk, jwt
from jose.utils import base64url_decode

from app.core.config import get_settings
from app.core.security import decode_token


settings = get_settings()

_JWKS_CACHE: dict[str, Any] = {"expires_at": 0.0, "jwks": None}
_JWKS_TTL_SECONDS = 300


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
    """Validate Auth0 JWT using JWKS signature and standard claims checks."""
    domain = (settings.AUTH0_DOMAIN or "").strip()
    if not domain:
        raise ValueError("AUTH0_DOMAIN is not configured")

    jwks = _get_auth0_jwks(domain)
    unverified_header = jwt.get_unverified_header(token)
    kid = unverified_header.get("kid")
    if not kid:
        raise ValueError("Missing key ID in token header")

    rsa_key = None
    for key in jwks.get("keys", []):
        if key.get("kid") == kid:
            rsa_key = {
                "kty": key.get("kty"),
                "kid": key.get("kid"),
                "use": key.get("use"),
                "n": key.get("n"),
                "e": key.get("e"),
            }
            break

    if not rsa_key:
        raise ValueError("Unable to find matching Auth0 signing key")

    message, encoded_signature = token.rsplit(".", 1)
    decoded_signature = base64url_decode(encoded_signature.encode("utf-8"))

    if not jwk.construct(rsa_key).verify(message.encode("utf-8"), decoded_signature):
        raise ValueError("Invalid Auth0 token signature")

    claims = jwt.get_unverified_claims(token)
    _validate_auth0_claims(claims, domain)
    return claims


def _validate_auth0_claims(claims: dict[str, Any], domain: str) -> None:
    """Validate issuer, audience, and expiration claims for Auth0 tokens."""
    now_ts = int(datetime.now(tz=timezone.utc).timestamp())

    exp = claims.get("exp")
    if not isinstance(exp, (int, float)) or now_ts >= int(exp):
        raise JWTError("Token expired")

    issuer = settings.AUTH0_ISSUER.strip() or f"https://{domain.rstrip('/')}/"
    token_iss = claims.get("iss")
    if token_iss != issuer:
        raise JWTError("Invalid token issuer")

    expected_aud = settings.AUTH0_AUDIENCE.strip()
    if expected_aud:
        token_aud = claims.get("aud")
        if isinstance(token_aud, list):
            if expected_aud not in token_aud:
                raise JWTError("Invalid token audience")
        elif token_aud != expected_aud:
            raise JWTError("Invalid token audience")


def _get_auth0_jwks(domain: str) -> dict[str, Any]:
    """Get Auth0 JWKS with short in-memory cache."""
    now = time.time()
    cached = _JWKS_CACHE.get("jwks")
    if cached and now < float(_JWKS_CACHE.get("expires_at", 0.0)):
        return cached

    url = f"https://{domain.rstrip('/')}/.well-known/jwks.json"
    response = requests.get(url, timeout=5)
    response.raise_for_status()
    jwks = response.json()

    _JWKS_CACHE["jwks"] = jwks
    _JWKS_CACHE["expires_at"] = now + _JWKS_TTL_SECONDS
    return jwks
