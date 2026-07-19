"""Tests for the Auth0/JWKS RS256 validation path in app/core/auth.py.

No existing coverage of this path predates the python-jose -> PyJWT
migration (grep confirms it), so these are new: a locally-generated RSA
keypair stands in for Auth0's signing key, and `_get_jwks_client` is
monkeypatched to a stub that resolves the kid to our test public key
directly — no real network call to any *.auth0.com JWKS endpoint.
"""
import json
import time

import jwt
import pytest
from jwt.algorithms import RSAAlgorithm
from cryptography.hazmat.primitives.asymmetric import rsa

from app.core.config import get_settings
import app.core.auth as auth_module

_KID = "test-kid-1"
_DOMAIN = "test-tenant.auth0.com"
_ISSUER = f"https://{_DOMAIN}/"
_AUDIENCE = "https://api.parvagas.test"


@pytest.fixture()
def rsa_keypair():
    private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    return private_key, private_key.public_key()


@pytest.fixture(autouse=True)
def _auth0_settings(monkeypatch):
    """auth.py reads a module-level `settings` object captured once at
    import time (`settings = get_settings()`), not a live call per-request
    — so swapping env vars alone doesn't reach it. Reassigning
    auth_module.settings directly is the only way to exercise the Auth0
    path, but it's global state: it MUST be restored on teardown, or every
    test that runs afterward in the same process silently inherits
    AUTH_PROVIDER=auth0 (this bit us once already — caught by the full
    suite, not this file in isolation)."""
    original_settings = auth_module.settings
    monkeypatch.setenv("AUTH_PROVIDER", "auth0")
    monkeypatch.setenv("AUTH0_DOMAIN", _DOMAIN)
    monkeypatch.setenv("AUTH0_AUDIENCE", _AUDIENCE)
    monkeypatch.setenv("AUTH0_ISSUER", _ISSUER)
    get_settings.cache_clear()
    auth_module.settings = get_settings()
    yield
    auth_module.settings = original_settings
    get_settings.cache_clear()


@pytest.fixture(autouse=True)
def _stub_jwks_client(monkeypatch, rsa_keypair):
    """Replace _get_jwks_client with one whose get_signing_key_from_jwt
    resolves our test kid to our test public key — no HTTP call, and no
    dependency on PyJWKClient's internals beyond the .key attribute this
    codebase actually reads."""
    _, public_key = rsa_keypair

    class _FakeSigningKey:
        def __init__(self, key):
            self.key = key

    class _FakeJwksClient:
        def get_signing_key_from_jwt(self, token):
            header = jwt.get_unverified_header(token)
            if header.get("kid") != _KID:
                raise jwt.PyJWTError("no matching key")
            return _FakeSigningKey(public_key)

    monkeypatch.setattr(auth_module, "_get_jwks_client", lambda domain: _FakeJwksClient())


def _make_token(private_key, *, kid=_KID, iss=_ISSUER, aud=_AUDIENCE, exp_delta=3600, extra=None):
    payload = {"sub": "auth0|abc123", "iss": iss, "aud": aud, "exp": int(time.time()) + exp_delta}
    if extra:
        payload.update(extra)
    return jwt.encode(payload, private_key, algorithm="RS256", headers={"kid": kid})


def test_valid_auth0_token_returns_claims(rsa_keypair):
    private_key, _ = rsa_keypair
    token = _make_token(private_key)

    claims, error = auth_module.validate_token(token)

    assert error is None
    assert claims["sub"] == "auth0|abc123"
    assert claims["aud"] == _AUDIENCE


def test_tampered_auth0_token_rejected(rsa_keypair):
    private_key, _ = rsa_keypair
    token = _make_token(private_key)

    claims, error = auth_module.validate_token(token + "x")

    assert claims is None
    assert error is not None


def test_token_signed_by_a_different_key_rejected(rsa_keypair):
    """Simulates a forged token — signed by an attacker-controlled key, not
    Auth0's — with a kid that happens to collide. Must fail signature
    verification, not silently pass."""
    forged_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    token = _make_token(forged_key)  # signed with the WRONG private key, real kid

    claims, error = auth_module.validate_token(token)

    assert claims is None
    assert error is not None


def test_expired_auth0_token_rejected(rsa_keypair):
    private_key, _ = rsa_keypair
    token = _make_token(private_key, exp_delta=-10)

    claims, error = auth_module.validate_token(token)

    assert claims is None
    assert "expired" in error.lower() or "expired" in str(error).lower()


def test_wrong_issuer_rejected(rsa_keypair):
    private_key, _ = rsa_keypair
    token = _make_token(private_key, iss="https://not-our-tenant.auth0.com/")

    claims, error = auth_module.validate_token(token)

    assert claims is None
    assert "issuer" in error.lower()


def test_wrong_audience_rejected(rsa_keypair):
    private_key, _ = rsa_keypair
    token = _make_token(private_key, aud="some-other-api")

    claims, error = auth_module.validate_token(token)

    assert claims is None
    assert "audience" in error.lower()


def test_audience_as_list_containing_expected_value_accepted(rsa_keypair):
    """Auth0 sends `aud` as an array when a token covers multiple APIs —
    _validate_auth0_claims must accept the expected audience being one
    entry among several, not require an exact string match."""
    private_key, _ = rsa_keypair
    token = _make_token(private_key, aud=[_AUDIENCE, "some-other-api"])

    claims, error = auth_module.validate_token(token)

    assert error is None
    assert claims["aud"] == [_AUDIENCE, "some-other-api"]


def test_audience_check_skipped_when_no_audience_configured(rsa_keypair, monkeypatch):
    monkeypatch.setenv("AUTH0_AUDIENCE", "")
    get_settings.cache_clear()
    auth_module.settings = get_settings()

    private_key, _ = rsa_keypair
    token = _make_token(private_key, aud="anything-goes")

    claims, error = auth_module.validate_token(token)

    assert error is None
    assert claims["aud"] == "anything-goes"


def test_unknown_kid_rejected(rsa_keypair):
    private_key, _ = rsa_keypair
    token = _make_token(private_key, kid="not-in-jwks")

    claims, error = auth_module.validate_token(token)

    assert claims is None
    assert error is not None
