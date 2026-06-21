"""Tests for password hashing and JWT helpers."""
from datetime import timedelta

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
