"""Tests for the real refresh-token flow (RefreshToken table existed since
migration 20260602_0005 but was never read/written anywhere before this).
"""
import asyncio
from datetime import datetime, timedelta
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core.security import hash_password, hash_token
from app.db.base import Base
from app.models import RefreshToken, User, UserRole
from app.services.auth_service import AuthService
from app.api.v1.auth import refresh_token_endpoint


@pytest.fixture()
def db():
    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()


def _make_user(db, **overrides) -> User:
    defaults = dict(
        email="candidate@example.com",
        full_name="Ana Sousa",
        password_hash=hash_password("x"),
        role=UserRole.candidate,
        email_verified=True,
    )
    defaults.update(overrides)
    user = User(**defaults)
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def _fake_request() -> SimpleNamespace:
    return SimpleNamespace(client=SimpleNamespace(host="9.9.9.9"), headers={})


def test_issue_refresh_token_persists_only_the_hash(db):
    user = _make_user(db)
    raw = AuthService.issue_refresh_token(db, user)

    row = db.query(RefreshToken).filter(RefreshToken.user_id == user.id).first()
    assert row is not None
    assert row.token_hash == hash_token(raw)
    assert row.token_hash != raw
    assert row.revoked is False


def test_rotate_refresh_token_returns_new_token_and_revokes_old(db):
    user = _make_user(db)
    raw = AuthService.issue_refresh_token(db, user)

    result = AuthService.rotate_refresh_token(db, raw)
    assert result is not None
    rotated_user, new_raw = result
    assert rotated_user.id == user.id
    assert new_raw != raw

    old_row = db.query(RefreshToken).filter(RefreshToken.token_hash == hash_token(raw)).first()
    assert old_row.revoked is True

    new_row = db.query(RefreshToken).filter(RefreshToken.token_hash == hash_token(new_raw)).first()
    assert new_row is not None
    assert new_row.revoked is False


def test_rotate_refresh_token_rejects_already_revoked_token(db):
    user = _make_user(db)
    raw = AuthService.issue_refresh_token(db, user)
    AuthService.rotate_refresh_token(db, raw)  # first use revokes it

    assert AuthService.rotate_refresh_token(db, raw) is None


def test_rotate_refresh_token_rejects_expired_token(db):
    user = _make_user(db)
    db.add(RefreshToken(user_id=user.id, token_hash=hash_token("expired-raw"), expires_at=datetime.utcnow() - timedelta(days=1)))
    db.commit()

    assert AuthService.rotate_refresh_token(db, "expired-raw") is None


def test_rotate_refresh_token_rejects_unknown_token(db):
    assert AuthService.rotate_refresh_token(db, "never-issued") is None


def test_rotate_refresh_token_rejects_suspended_user(db):
    user = _make_user(db, suspended=True)
    raw = AuthService.issue_refresh_token(db, user)
    assert AuthService.rotate_refresh_token(db, raw) is None


def test_revoke_all_refresh_tokens(db):
    user = _make_user(db)
    raw1 = AuthService.issue_refresh_token(db, user)
    raw2 = AuthService.issue_refresh_token(db, user)

    AuthService.revoke_all_refresh_tokens(db, user)

    rows = db.query(RefreshToken).filter(RefreshToken.user_id == user.id).all()
    assert all(r.revoked for r in rows)
    assert AuthService.rotate_refresh_token(db, raw1) is None
    assert AuthService.rotate_refresh_token(db, raw2) is None


def test_refresh_endpoint_issues_new_access_token(db):
    user = _make_user(db)
    raw = AuthService.issue_refresh_token(db, user)

    result = asyncio.run(refresh_token_endpoint(request=_fake_request(), payload={"refreshToken": raw}, db=db))

    assert result["access_token"]
    assert result["refresh_token"] and result["refresh_token"] != raw
    assert result["user"].id == user.id


def test_refresh_endpoint_rejects_invalid_token(db):
    with pytest.raises(HTTPException) as exc:
        asyncio.run(refresh_token_endpoint(request=_fake_request(), payload={"refreshToken": "bogus"}, db=db))
    assert exc.value.status_code == 401


def test_refresh_endpoint_requires_token_in_body(db):
    with pytest.raises(HTTPException) as exc:
        asyncio.run(refresh_token_endpoint(request=_fake_request(), payload={}, db=db))
    assert exc.value.status_code == 400
