"""Tests for the per-user verification-resend cooldown (real in-memory DB,
since it queries EmailVerificationToken.created_at)."""
import uuid
from datetime import datetime, timedelta

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.base import Base
from app.models import User, UserRole, EmailVerificationToken
from app.api.v1.auth import _verification_resend_wait_seconds, VERIFICATION_RESEND_COOLDOWN_SECONDS


@pytest.fixture()
def db():
    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()


def _make_user(db):
    user = User(
        id=str(uuid.uuid4()), email=f"user-{uuid.uuid4()}@example.com",
        full_name="Test User", password_hash="x", role=UserRole.candidate,
    )
    db.add(user)
    db.flush()
    return user


def _make_token(db, user, created_at):
    token = EmailVerificationToken(
        id=str(uuid.uuid4()), user_id=user.id, token_hash=str(uuid.uuid4()),
        expires_at=created_at + timedelta(hours=24), created_at=created_at,
    )
    db.add(token)
    db.flush()
    return token


def test_no_prior_token_means_no_wait(db):
    user = _make_user(db)
    db.commit()
    assert _verification_resend_wait_seconds(db, user) == 0


def test_recent_token_requires_waiting(db):
    user = _make_user(db)
    now = datetime.utcnow()
    _make_token(db, user, created_at=now - timedelta(seconds=5))
    db.commit()

    wait = _verification_resend_wait_seconds(db, user, now=now)
    assert 0 < wait <= VERIFICATION_RESEND_COOLDOWN_SECONDS


def test_old_token_allows_immediate_resend(db):
    user = _make_user(db)
    now = datetime.utcnow()
    _make_token(db, user, created_at=now - timedelta(seconds=VERIFICATION_RESEND_COOLDOWN_SECONDS + 30))
    db.commit()

    assert _verification_resend_wait_seconds(db, user, now=now) == 0


def test_uses_the_most_recent_token_not_the_oldest(db):
    user = _make_user(db)
    now = datetime.utcnow()
    _make_token(db, user, created_at=now - timedelta(hours=1))  # stale, would allow resend
    _make_token(db, user, created_at=now - timedelta(seconds=5))  # fresh, blocks resend
    db.commit()

    assert _verification_resend_wait_seconds(db, user, now=now) > 0
