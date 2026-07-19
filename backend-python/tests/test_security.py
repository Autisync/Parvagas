"""Tests for password hashing and JWT helpers."""
import base64
import hashlib
import hmac
import json
import time
from datetime import timedelta

from app.core.config import get_settings
from app.core.security import (
    hash_password,
    verify_password,
    create_access_token,
    decode_token,
    create_verification_token,
    hash_token,
)


def test_password_hash_roundtrip():
    hashed = hash_password("s3cret-pass")
    assert hashed != "s3cret-pass"
    assert verify_password("s3cret-pass", hashed) is True
    assert verify_password("wrong", hashed) is False


def test_access_token_roundtrip():
    token = create_access_token({"sub": "user-1", "role": "admin"})
    claims = decode_token(token)
    assert claims is not None
    assert claims["sub"] == "user-1"
    assert claims["role"] == "admin"


def test_expired_token_returns_none():
    token = create_access_token({"sub": "u"}, expires_delta=timedelta(seconds=-1))
    assert decode_token(token) is None


def test_tampered_token_returns_none():
    token = create_access_token({"sub": "u"})
    assert decode_token(token + "tamper") is None


def test_verification_token_is_unique_and_hashable():
    a = create_verification_token()
    b = create_verification_token()
    assert a != b
    assert hash_token(a) == hash_token(a)
    assert hash_token(a) != hash_token(b)


def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _make_hs256_jwt(payload: dict, secret: str) -> str:
    """Hand-build an HS256 JWT via stdlib hmac/hashlib only — no jose, no
    PyJWT. HS256 is a plain RFC 7519/RFC 7515 standard with no library-
    specific quirks, so a token built this way is exactly what python-jose
    (the library this migration replaced) would also have produced. Proves
    decode_token() (now PyJWT-backed) is interoperable with tokens minted
    by any standards-compliant HS256 implementation, old or new."""
    header = {"alg": "HS256", "typ": "JWT"}
    signing_input = f"{_b64url(json.dumps(header).encode())}.{_b64url(json.dumps(payload).encode())}"
    signature = hmac.new(secret.encode(), signing_input.encode(), hashlib.sha256).digest()
    return f"{signing_input}.{_b64url(signature)}"


def test_decode_token_accepts_a_token_from_a_different_hs256_implementation():
    """Regression guard for the python-jose -> PyJWT migration: HS256 is
    implementation-independent, so a token minted by any compliant library
    (jose, PyJWT, or this hand-rolled stdlib version) must decode the same
    way. If this ever fails, decode_token() has drifted from the standard."""
    settings = get_settings()
    payload = {"sub": "cross-lib-user", "role": "candidate", "exp": int(time.time()) + 3600}
    token = _make_hs256_jwt(payload, settings.JWT_SECRET)

    claims = decode_token(token)

    assert claims is not None
    assert claims["sub"] == "cross-lib-user"
    assert claims["role"] == "candidate"


def test_decode_token_rejects_a_token_signed_with_the_wrong_secret():
    payload = {"sub": "u", "exp": int(time.time()) + 3600}
    token = _make_hs256_jwt(payload, "a-completely-different-secret")
    assert decode_token(token) is None
