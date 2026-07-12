"""Tests for the CV builder SSO bridge (Parvagas as OIDC provider for the
self-hosted Reactive Resume instance).

Load-bearing guarantees: handoff and authorization codes are single-use and
TTL-bound; client_id/redirect_uri/client_secret are validated on every hop;
issued tokens are signed with RESUME_BUILDER_SECRET, NOT the app's own
JWT_SECRET, so a token minted for/leaked from the CV builder can never be
replayed against Parvagas's own API.
"""
import asyncio
from datetime import datetime, timedelta

import pytest
from fastapi import HTTPException
from jose import jwt
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.api.v1 import resume_sso
from app.core.config import get_settings
from app.db.base import Base
from app.models import OAuthAuthorizationCode, SSOHandoffCode, User, UserRole

settings = get_settings()

_create_handoff = resume_sso.create_handoff_code.__wrapped__
_authorize = resume_sso.authorize
_token = resume_sso.token
_userinfo = resume_sso.userinfo


@pytest.fixture()
def db():
    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()


@pytest.fixture(autouse=True)
def _sso_config(monkeypatch):
    monkeypatch.setattr(resume_sso.settings, "RESUME_SSO_CLIENT_ID", "reactive-resume")
    monkeypatch.setattr(resume_sso.settings, "RESUME_SSO_REDIRECT_URI", "https://cv.parvagas.pt/api/auth/callback")
    monkeypatch.setattr(resume_sso.settings, "RESUME_BUILDER_SECRET", "test-shared-secret-not-jwt-secret")
    monkeypatch.setattr(resume_sso.settings, "JWT_SECRET", "totally-different-app-secret")
    monkeypatch.setattr(resume_sso.settings, "BACKEND_URL", "https://api.parvagas.pt")


def _make_user(db, email="candidate@example.com") -> User:
    user = User(
        email=email, full_name="Test Candidate", password_hash="x",
        role=UserRole.candidate, email_verified=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


class _FakeRequest:
    def __init__(self, json_body=None, headers=None):
        self.headers = headers or {"content-type": "application/json"}
        self._json_body = json_body or {}

    async def json(self):
        return self._json_body


async def _mint_handoff(db, user):
    result = await _create_handoff(request=None, db=db, current_user=user)
    return result["code"]


async def _authorize_with_handoff(db, handoff_code, **overrides):
    kwargs = dict(
        request=None,
        client_id="reactive-resume",
        redirect_uri="https://cv.parvagas.pt/api/auth/callback",
        response_type="code",
        scope="openid profile email",
        state="xyz",
        nonce=None,
        handoff=handoff_code,
        db=db,
    )
    kwargs.update(overrides)
    return await _authorize(**kwargs)


def _extract_code_from_redirect(response) -> str:
    location = response.headers["location"]
    query = location.split("?", 1)[1]
    params = dict(p.split("=", 1) for p in query.split("&"))
    return params["code"]


async def _exchange_code(db, code, **overrides):
    body = {
        "grant_type": "authorization_code",
        "code": code,
        "redirect_uri": "https://cv.parvagas.pt/api/auth/callback",
        "client_id": "reactive-resume",
        "client_secret": "test-shared-secret-not-jwt-secret",
    }
    body.update(overrides)
    return await _token(request=_FakeRequest(json_body=body), db=db)


async def _full_handshake(db, user):
    """Run handoff -> authorize -> token, returning the issued token pair."""
    handoff = await _mint_handoff(db, user)
    redirect = await _authorize_with_handoff(db, handoff)
    code = _extract_code_from_redirect(redirect)
    return await _exchange_code(db, code)


# ------------------------------- handoff --------------------------------- #

def test_handoff_mints_code_for_authenticated_user(db):
    user = _make_user(db)
    code = asyncio.run(_mint_handoff(db, user))
    assert code
    row = db.query(SSOHandoffCode).filter(SSOHandoffCode.code == code).first()
    assert row is not None
    assert row.user_id == user.id
    assert row.consumed_at is None


# ------------------------------ authorize --------------------------------- #

def test_authorize_redirects_with_code_on_valid_handoff(db):
    user = _make_user(db)

    async def _scenario():
        handoff = await _mint_handoff(db, user)
        return await _authorize_with_handoff(db, handoff)

    response = asyncio.run(_scenario())
    assert response.status_code == 302
    assert "code=" in response.headers["location"]
    assert "state=xyz" in response.headers["location"]


def test_authorize_rejects_unknown_client_id(db):
    user = _make_user(db)

    async def _scenario():
        handoff = await _mint_handoff(db, user)
        return await _authorize_with_handoff(db, handoff, client_id="some-other-app")

    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(_scenario())
    assert exc_info.value.status_code == 400


def test_authorize_rejects_wrong_redirect_uri(db):
    user = _make_user(db)

    async def _scenario():
        handoff = await _mint_handoff(db, user)
        return await _authorize_with_handoff(db, handoff, redirect_uri="https://evil.example.com/callback")

    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(_scenario())
    assert exc_info.value.status_code == 400


def test_authorize_rejects_expired_handoff(db):
    user = _make_user(db)
    handoff_code = "expired-code"
    db.add(SSOHandoffCode(
        code=handoff_code, user_id=user.id,
        expires_at=datetime.utcnow() - timedelta(seconds=5),
    ))
    db.commit()

    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(_authorize_with_handoff(db, handoff_code))
    assert exc_info.value.status_code == 400


def test_authorize_handoff_is_single_use(db):
    user = _make_user(db)

    async def _scenario():
        handoff = await _mint_handoff(db, user)
        await _authorize_with_handoff(db, handoff)  # first use succeeds
        await _authorize_with_handoff(db, handoff)  # second use must fail

    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(_scenario())
    assert exc_info.value.status_code == 400


# -------------------------------- token ------------------------------------ #

def test_token_exchange_issues_tokens_signed_with_resume_builder_secret(db):
    user = _make_user(db)
    result = asyncio.run(_full_handshake(db, user))

    assert result["token_type"] == "Bearer"
    assert result["id_token"]
    assert result["access_token"]

    claims = jwt.decode(
        result["id_token"], "test-shared-secret-not-jwt-secret",
        algorithms=["HS256"], audience="reactive-resume",
    )
    assert claims["sub"] == str(user.id)
    assert claims["email"] == user.email
    assert claims["iss"] == "https://api.parvagas.pt"

    # Must NOT be verifiable with the app's own JWT_SECRET — separate trust boundary.
    with pytest.raises(Exception):
        jwt.decode(result["id_token"], "totally-different-app-secret", algorithms=["HS256"])


def test_token_rejects_wrong_client_secret(db):
    user = _make_user(db)

    async def _scenario():
        handoff = await _mint_handoff(db, user)
        redirect = await _authorize_with_handoff(db, handoff)
        code = _extract_code_from_redirect(redirect)
        return await _exchange_code(db, code, client_secret="wrong-secret")

    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(_scenario())
    assert exc_info.value.status_code == 401


def test_token_rejects_unsupported_grant_type(db):
    user = _make_user(db)

    async def _scenario():
        handoff = await _mint_handoff(db, user)
        redirect = await _authorize_with_handoff(db, handoff)
        code = _extract_code_from_redirect(redirect)
        return await _exchange_code(db, code, grant_type="client_credentials")

    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(_scenario())
    assert exc_info.value.status_code == 400


def test_token_rejects_expired_authorization_code(db):
    user = _make_user(db)
    db.add(OAuthAuthorizationCode(
        code="expired-auth-code", user_id=user.id, client_id="reactive-resume",
        redirect_uri="https://cv.parvagas.pt/api/auth/callback", scope="openid profile email",
        expires_at=datetime.utcnow() - timedelta(seconds=5),
    ))
    db.commit()

    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(_exchange_code(db, "expired-auth-code"))
    assert exc_info.value.status_code == 400


def test_authorization_code_is_single_use(db):
    user = _make_user(db)

    async def _scenario():
        handoff = await _mint_handoff(db, user)
        redirect = await _authorize_with_handoff(db, handoff)
        code = _extract_code_from_redirect(redirect)
        await _exchange_code(db, code)  # first exchange succeeds
        await _exchange_code(db, code)  # second exchange must fail

    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(_scenario())
    assert exc_info.value.status_code == 400


# ------------------------------- userinfo ----------------------------------- #

def test_userinfo_returns_user_for_valid_access_token(db):
    user = _make_user(db)

    async def _scenario():
        tokens = await _full_handshake(db, user)
        return await _userinfo(
            request=_FakeRequest(headers={"authorization": f"Bearer {tokens['access_token']}"}),
            db=db,
        )

    result = asyncio.run(_scenario())
    assert result["sub"] == str(user.id)
    assert result["email"] == user.email


def test_userinfo_rejects_token_signed_with_wrong_secret(db):
    user = _make_user(db)
    bad_token = jwt.encode(
        {"sub": str(user.id), "aud": "reactive-resume", "exp": 9999999999},
        "some-other-secret", algorithm="HS256",
    )
    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(_userinfo(request=_FakeRequest(headers={"authorization": f"Bearer {bad_token}"}), db=db))
    assert exc_info.value.status_code == 401


def test_userinfo_rejects_missing_bearer_header(db):
    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(_userinfo(request=_FakeRequest(headers={}), db=db))
    assert exc_info.value.status_code == 401


# --------------------------- discovery document ----------------------------- #

def test_openid_configuration_advertises_correct_urls():
    config = asyncio.run(resume_sso.openid_configuration())
    assert config["issuer"] == "https://api.parvagas.pt"
    assert config["authorization_endpoint"] == "https://api.parvagas.pt/api/v1/oauth/authorize"
    assert config["token_endpoint"] == "https://api.parvagas.pt/api/v1/oauth/token"
    assert config["userinfo_endpoint"] == "https://api.parvagas.pt/api/v1/oauth/userinfo"
    assert "jwks_uri" not in config
