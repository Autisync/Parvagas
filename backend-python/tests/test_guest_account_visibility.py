"""Tests for guest-account visibility: is_guest_account surfaced in the
admin user record and filter, and a guest_converted_at marker (set once,
on conversion) backing a real conversion-rate stat on the dashboard.
"""
import asyncio
from datetime import datetime, timedelta
import uuid

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core.security import hash_password, hash_token
from app.db.base import Base
from app.models import PasswordResetToken, User, UserRole
from app.services.auth_service import AuthService
from app.api.v1.admin import admin_users, admin_overview, _to_user_record


@pytest.fixture()
def db():
    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()


def _make_admin(db):
    admin = User(id=str(uuid.uuid4()), email=f"admin-{uuid.uuid4()}@parvagas.pt", full_name="Admin", password_hash="x", role=UserRole.admin)
    db.add(admin)
    db.commit()
    return admin


def _make_guest(db):
    user = User(
        id=str(uuid.uuid4()), email=f"guest-{uuid.uuid4()}@parvagas.pt", full_name="Guest",
        password_hash="!", role=UserRole.candidate, is_guest_account=True,
    )
    db.add(user)
    db.commit()
    return user


def test_to_user_record_includes_is_guest_account(db):
    guest = _make_guest(db)
    record = _to_user_record(guest)
    assert record["isGuestAccount"] is True


def test_admin_users_filters_by_guest_account(db):
    admin = _make_admin(db)
    _make_guest(db)
    db.add(User(email="registered@x.com", full_name="Reg", password_hash="x", role=UserRole.candidate, is_guest_account=False))
    db.commit()

    result = asyncio.run(admin_users(page=1, limit=15, keyword=None, role=None, adminLevel=None, isGuestAccount="true", db=db, current_user=admin))

    assert len(result["users"]) == 1
    assert result["users"][0]["isGuestAccount"] is True


def test_reset_password_sets_guest_converted_at(db):
    guest = _make_guest(db)
    raw_token = "raw-reset-token"
    db.add(PasswordResetToken(user_id=guest.id, token_hash=hash_token(raw_token), expires_at=datetime.utcnow() + timedelta(hours=1)))
    db.commit()

    updated = AuthService.reset_password(db, raw_token, "NewPassw0rd!23")

    assert updated.is_guest_account is False
    assert updated.guest_converted_at is not None


def test_reset_password_does_not_set_guest_converted_at_for_non_guest(db):
    user = User(email="normal@x.com", full_name="Normal", password_hash=hash_password("x"), role=UserRole.candidate, is_guest_account=False)
    db.add(user)
    db.commit()
    raw_token = "raw-reset-token-2"
    db.add(PasswordResetToken(user_id=user.id, token_hash=hash_token(raw_token), expires_at=datetime.utcnow() + timedelta(hours=1)))
    db.commit()

    updated = AuthService.reset_password(db, raw_token, "NewPassw0rd!23")

    assert updated.guest_converted_at is None


def test_admin_overview_reports_guest_conversion_rate(db):
    admin = _make_admin(db)
    _make_guest(db)  # 1 active guest
    converted = _make_guest(db)
    converted.is_guest_account = False
    converted.guest_converted_at = datetime.utcnow()
    db.commit()

    result = asyncio.run(admin_overview(db=db, current_user=admin))

    assert result["activeGuestAccounts"] == 1
    assert result["convertedGuestAccounts"] == 1
    assert result["guestConversionRate"] == 50.0


def test_admin_overview_guest_conversion_rate_none_when_no_guests_ever(db):
    admin = _make_admin(db)
    result = asyncio.run(admin_overview(db=db, current_user=admin))
    assert result["guestConversionRate"] is None
