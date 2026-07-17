"""Tests for the admin bulk verification-email backfill endpoint."""
import asyncio
import uuid
from datetime import datetime, timedelta

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from fastapi import HTTPException

from app.db.base import Base
from app.models import User, UserRole, EmailVerificationToken
from app.api.v1.admin import admin_resend_verification, admin_verification_backfill
from app.api.v1.auth import VERIFICATION_RESEND_COOLDOWN_SECONDS


@pytest.fixture()
def db():
    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()


def _make_user(db, email_verified=False):
    user = User(
        id=str(uuid.uuid4()), email=f"user-{uuid.uuid4()}@example.com",
        full_name="Test User", password_hash="x", role=UserRole.candidate,
        email_verified=email_verified,
    )
    db.add(user)
    db.flush()
    return user


def _make_admin(db):
    admin = User(
        id=str(uuid.uuid4()), email=f"admin-{uuid.uuid4()}@parvagas.pt",
        full_name="Admin", password_hash="x", role=UserRole.admin,
        email_verified=True,  # admins in these tests aren't part of the unverified count under test
    )
    db.add(admin)
    db.flush()
    return admin


def _make_token(db, user, created_at):
    token = EmailVerificationToken(
        id=str(uuid.uuid4()), user_id=user.id, token_hash=str(uuid.uuid4()),
        expires_at=created_at + timedelta(hours=24), created_at=created_at,
    )
    db.add(token)
    db.flush()


def test_sends_to_all_unverified_users(db, monkeypatch):
    calls = []
    monkeypatch.setattr(
        "app.workers.tasks.send_verification_email",
        type("T", (), {"delay": staticmethod(lambda *a, **k: calls.append(a))})(),
    )
    admin = _make_admin(db)
    _make_user(db, email_verified=False)
    _make_user(db, email_verified=False)
    _make_user(db, email_verified=True)  # already verified — must be excluded
    db.commit()

    result = asyncio.run(admin_verification_backfill(payload={}, db=db, current_user=admin))

    assert result["totalUnverified"] == 2
    assert result["sent"] == 2
    assert result["skippedCooldown"] == 0
    assert len(calls) == 2


def test_dry_run_counts_without_sending(db, monkeypatch):
    calls = []
    monkeypatch.setattr(
        "app.workers.tasks.send_verification_email",
        type("T", (), {"delay": staticmethod(lambda *a, **k: calls.append(a))})(),
    )
    admin = _make_admin(db)
    _make_user(db, email_verified=False)
    db.commit()

    result = asyncio.run(admin_verification_backfill(payload={"dryRun": True}, db=db, current_user=admin))

    assert result["dryRun"] is True
    assert result["sent"] == 1  # counted as "would send"
    assert calls == []  # but never actually enqueued
    # No token created either — dry run must not have side effects.
    assert db.query(EmailVerificationToken).count() == 0


def test_respects_per_account_cooldown_so_reruns_are_safe(db, monkeypatch):
    calls = []
    monkeypatch.setattr(
        "app.workers.tasks.send_verification_email",
        type("T", (), {"delay": staticmethod(lambda *a, **k: calls.append(a))})(),
    )
    admin = _make_admin(db)
    recently_sent = _make_user(db, email_verified=False)
    _make_token(db, recently_sent, created_at=datetime.utcnow() - timedelta(seconds=5))
    fresh = _make_user(db, email_verified=False)
    db.commit()

    result = asyncio.run(admin_verification_backfill(payload={}, db=db, current_user=admin))

    assert result["totalUnverified"] == 2
    assert result["sent"] == 1
    assert result["skippedCooldown"] == 1
    assert len(calls) == 1
    assert calls[0][0] == fresh.id


def test_no_unverified_users_is_a_no_op(db, monkeypatch):
    calls = []
    monkeypatch.setattr(
        "app.workers.tasks.send_verification_email",
        type("T", (), {"delay": staticmethod(lambda *a, **k: calls.append(a))})(),
    )
    admin = _make_admin(db)
    _make_user(db, email_verified=True)
    db.commit()

    result = asyncio.run(admin_verification_backfill(payload={}, db=db, current_user=admin))

    assert result["totalUnverified"] == 0
    assert result["sent"] == 0
    assert calls == []


# ── Single-account resend (POST /admin/users/{id}/resend-verification) ────

def test_resend_verification_sends_to_one_unverified_user(db, monkeypatch):
    calls = []
    monkeypatch.setattr(
        "app.workers.tasks.send_verification_email",
        type("T", (), {"delay": staticmethod(lambda *a, **k: calls.append(a))})(),
    )
    admin = _make_admin(db)
    target = _make_user(db, email_verified=False)
    db.commit()

    result = asyncio.run(admin_resend_verification(target.id, db=db, current_user=admin))

    assert result == {"sent": True, "userId": target.id}
    assert len(calls) == 1
    assert calls[0][0] == target.id


def test_resend_verification_rejects_already_verified_user(db, monkeypatch):
    calls = []
    monkeypatch.setattr(
        "app.workers.tasks.send_verification_email",
        type("T", (), {"delay": staticmethod(lambda *a, **k: calls.append(a))})(),
    )
    admin = _make_admin(db)
    target = _make_user(db, email_verified=True)
    db.commit()

    with pytest.raises(HTTPException) as exc:
        asyncio.run(admin_resend_verification(target.id, db=db, current_user=admin))
    assert exc.value.status_code == 400
    assert calls == []


def test_resend_verification_respects_cooldown(db, monkeypatch):
    calls = []
    monkeypatch.setattr(
        "app.workers.tasks.send_verification_email",
        type("T", (), {"delay": staticmethod(lambda *a, **k: calls.append(a))})(),
    )
    admin = _make_admin(db)
    target = _make_user(db, email_verified=False)
    _make_token(db, target, created_at=datetime.utcnow() - timedelta(seconds=5))
    db.commit()

    with pytest.raises(HTTPException) as exc:
        asyncio.run(admin_resend_verification(target.id, db=db, current_user=admin))
    assert exc.value.status_code == 429
    assert calls == []


def test_resend_verification_404_for_missing_user(db):
    admin = _make_admin(db)
    with pytest.raises(HTTPException) as exc:
        asyncio.run(admin_resend_verification("does-not-exist", db=db, current_user=admin))
    assert exc.value.status_code == 404


# ── Admin user list exposes verification status ────────────────────────────

def test_to_user_record_exposes_verification_status():
    from app.api.v1.admin import _to_user_record

    verified = User(id="1", email="a@x.com", full_name="A", password_hash="x", role=UserRole.candidate, email_verified=True, email_verified_at=datetime(2026, 1, 1))
    unverified = User(id="2", email="b@x.com", full_name="B", password_hash="x", role=UserRole.candidate, email_verified=False)

    assert _to_user_record(verified)["emailVerified"] is True
    assert _to_user_record(verified)["emailVerifiedAt"] == "2026-01-01T00:00:00"
    assert _to_user_record(unverified)["emailVerified"] is False
    assert _to_user_record(unverified)["emailVerifiedAt"] is None
