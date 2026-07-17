"""Tests for admin force-logout — instant session revocation for a session
that's still access-token-valid (suspending only blocks NEW activity;
get_current_user already re-checks `suspended` every request but had no
way to invalidate a not-yet-expired token early before this).
"""
import asyncio
import time
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.api.deps import get_current_user
from app.core.security import create_access_token, hash_password
from app.db.base import Base
from app.models import User, UserRole
from app.services.auth_service import AuthService
from app.api.v1.admin import admin_force_logout_user


@pytest.fixture()
def db():
    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()


def _make_user(db, role=UserRole.candidate, **overrides) -> User:
    defaults = dict(
        email="candidate@example.com",
        full_name="Ana Sousa",
        password_hash=hash_password("x"),
        role=role,
        email_verified=True,
    )
    defaults.update(overrides)
    user = User(**defaults)
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def _make_super_admin(db) -> User:
    return _make_user(
        db, role=UserRole.admin, email="admin@parvagas.pt", admin_level="super-admin",
    )


def _fake_request(claims: dict) -> SimpleNamespace:
    return SimpleNamespace(state=SimpleNamespace(auth_claims=claims, auth_error=None))


def test_valid_token_passes_when_never_force_logged_out(db):
    user = _make_user(db)
    token = AuthService.create_access_token(user)
    from app.core.security import decode_token
    claims = decode_token(token)

    resolved = get_current_user(request=_fake_request(claims), db=db)
    assert resolved.id == user.id


def test_token_issued_before_force_logout_is_rejected(db):
    user = _make_user(db)
    token = AuthService.create_access_token(user)
    from app.core.security import decode_token
    claims = decode_token(token)

    time.sleep(1.1)  # ensure force-logout's timestamp is strictly after the token's iat (1s JWT resolution)
    user.tokens_revoked_at = __import__("datetime").datetime.utcnow()
    db.commit()

    with pytest.raises(HTTPException) as exc:
        get_current_user(request=_fake_request(claims), db=db)
    assert exc.value.status_code == 401


def test_token_issued_after_force_logout_is_accepted(db):
    user = _make_user(db)
    user.tokens_revoked_at = __import__("datetime").datetime.utcnow()
    db.commit()

    time.sleep(1.1)
    token = AuthService.create_access_token(user)
    from app.core.security import decode_token
    claims = decode_token(token)

    resolved = get_current_user(request=_fake_request(claims), db=db)
    assert resolved.id == user.id


def test_admin_force_logout_sets_revocation_timestamp(db):
    admin = _make_super_admin(db)
    target = _make_user(db)
    AuthService.issue_refresh_token(db, target)

    result = asyncio.run(admin_force_logout_user(target.id, db=db, current_user=admin))

    db.refresh(target)
    assert target.tokens_revoked_at is not None
    assert result["user"]["_id"] == target.id


def test_admin_force_logout_revokes_refresh_tokens(db):
    admin = _make_super_admin(db)
    target = _make_user(db)
    raw = AuthService.issue_refresh_token(db, target)

    asyncio.run(admin_force_logout_user(target.id, db=db, current_user=admin))

    assert AuthService.rotate_refresh_token(db, raw) is None


def test_admin_force_logout_requires_super_admin(db):
    moderator = _make_user(db, role=UserRole.admin, email="mod@parvagas.pt", admin_level="moderator")
    target = _make_user(db, email="target@example.com")

    with pytest.raises(HTTPException) as exc:
        asyncio.run(admin_force_logout_user(target.id, db=db, current_user=moderator))
    assert exc.value.status_code == 403


def test_admin_force_logout_404_for_missing_user(db):
    admin = _make_super_admin(db)
    with pytest.raises(HTTPException) as exc:
        asyncio.run(admin_force_logout_user("does-not-exist", db=db, current_user=admin))
    assert exc.value.status_code == 404
