"""Tests for admin-editable feature flags — settings.X_ENABLED business
decisions (candidate premium, AI providers, OTP login) that previously
required a redeploy to change, now overridable at runtime from the DB.
"""
import asyncio
import uuid

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.base import Base
from app.models import FeatureFlag, User, UserRole
from app.services.feature_flags import get_flag, list_flags, set_flag
from app.api.v1.admin import admin_list_feature_flags, admin_update_feature_flag


@pytest.fixture()
def db():
    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()


def _make_admin(db, admin_level="super-admin"):
    admin = User(
        id=str(uuid.uuid4()), email=f"admin-{uuid.uuid4()}@parvagas.pt", full_name="Admin",
        password_hash="x", role=UserRole.admin, admin_level=admin_level,
    )
    db.add(admin)
    db.commit()
    return admin


# ── Service-level get_flag/set_flag ────────────────────────────────────────

def test_get_flag_falls_back_to_default_when_no_row_exists(db):
    assert get_flag("SOME_UNKNOWN_FLAG", True, db) is True
    assert get_flag("SOME_UNKNOWN_FLAG", False, db) is False


def test_set_flag_then_get_flag_returns_override(db):
    set_flag(db, "CANDIDATE_PREMIUM_ENABLED", True)
    assert get_flag("CANDIDATE_PREMIUM_ENABLED", False, db) is True


def test_get_flag_opens_its_own_session_when_none_given():
    """Most real call sites (static-method AI-service helpers) have no db
    session in scope — get_flag must still work (and not raise) without
    one, falling back to the caller's default since this session targets
    the app's own engine, not this test file's isolated in-memory one."""
    assert get_flag("SOME_FLAG_NOT_SET_ANYWHERE", True) is True
    assert get_flag("SOME_FLAG_NOT_SET_ANYWHERE", False) is False


def test_set_flag_updates_existing_row_in_place(db):
    set_flag(db, "OTP_LOGIN_ENABLED", False, "desc v1")
    set_flag(db, "OTP_LOGIN_ENABLED", True)
    assert db.query(FeatureFlag).filter(FeatureFlag.key == "OTP_LOGIN_ENABLED").count() == 1
    row = db.query(FeatureFlag).filter(FeatureFlag.key == "OTP_LOGIN_ENABLED").first()
    assert row.value is True
    assert row.description == "desc v1"  # untouched when not passed again


def test_list_flags_orders_by_key(db):
    set_flag(db, "Z_FLAG", True)
    set_flag(db, "A_FLAG", True)
    keys = [f.key for f in list_flags(db)]
    assert keys == ["A_FLAG", "Z_FLAG"]


# ── Admin endpoints ─────────────────────────────────────────────────────────

def test_admin_list_feature_flags(db):
    admin = _make_admin(db)
    set_flag(db, "CANDIDATE_PREMIUM_ENABLED", False, "Enforce quotas")
    result = asyncio.run(admin_list_feature_flags(db=db, current_user=admin))
    assert len(result["featureFlags"]) == 1
    assert result["featureFlags"][0]["key"] == "CANDIDATE_PREMIUM_ENABLED"
    assert result["featureFlags"][0]["value"] is False


def test_admin_update_feature_flag_requires_super_admin(db):
    moderator = _make_admin(db, admin_level="moderator")
    with pytest.raises(HTTPException) as exc:
        asyncio.run(admin_update_feature_flag("CANDIDATE_PREMIUM_ENABLED", {"value": True}, db=db, current_user=moderator))
    assert exc.value.status_code == 403


def test_admin_update_feature_flag_creates_and_updates(db):
    admin = _make_admin(db)
    result = asyncio.run(admin_update_feature_flag("HIBP_PASSWORD_CHECK_ENABLED", {"value": True}, db=db, current_user=admin))
    assert result["value"] is True
    assert get_flag("HIBP_PASSWORD_CHECK_ENABLED", False, db) is True


def test_admin_update_feature_flag_requires_value(db):
    admin = _make_admin(db)
    with pytest.raises(HTTPException) as exc:
        asyncio.run(admin_update_feature_flag("X", {}, db=db, current_user=admin))
    assert exc.value.status_code == 400
