"""Tests for AuthService.authenticate_user's account-enumeration fix.

Previously "Account suspended" / "Account temporarily locked" were raised
purely from account state, checked BEFORE the password — so anyone probing
random emails (no valid credential at all) could tell which addresses are
registered, and their account state, just from which error text came back.
The fix checks the password first: a wrong-password/unknown-email guesser
always sees the same generic message; only someone who has already proven
they hold the correct credential is told the account-specific reason.
"""
from datetime import datetime, timedelta

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core.errors import AuthenticationError
from app.core.security import hash_password
from app.db.base import Base
from app.models import User, UserRole
from app.services.auth_service import AuthService


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
        password_hash=hash_password("correct-horse-battery-staple"),
        role=UserRole.candidate,
        email_verified=True,
    )
    defaults.update(overrides)
    user = User(**defaults)
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def test_wrong_password_on_suspended_account_gives_generic_message(db):
    """A guesser without the real password must not learn this account is
    suspended — that would confirm the email is registered."""
    _make_user(db, suspended=True)
    with pytest.raises(AuthenticationError) as exc_info:
        AuthService.authenticate_user(db, "candidate@example.com", "wrong-password")
    assert exc_info.value.detail == "Invalid email or password"


def test_correct_password_on_suspended_account_reveals_suspension(db):
    """Someone who DOES hold the real credential is safe to inform — they
    already proved legitimate access, this isn't new information leaked to
    an attacker."""
    _make_user(db, suspended=True)
    with pytest.raises(AuthenticationError) as exc_info:
        AuthService.authenticate_user(db, "candidate@example.com", "correct-horse-battery-staple")
    assert exc_info.value.detail == "Account suspended"


def test_wrong_password_on_locked_account_gives_generic_message(db):
    _make_user(db, locked_until=datetime.utcnow() + timedelta(minutes=10))
    with pytest.raises(AuthenticationError) as exc_info:
        AuthService.authenticate_user(db, "candidate@example.com", "wrong-password")
    assert exc_info.value.detail == "Invalid email or password"


def test_correct_password_on_locked_account_reveals_lockout(db):
    _make_user(db, locked_until=datetime.utcnow() + timedelta(minutes=10))
    with pytest.raises(AuthenticationError) as exc_info:
        AuthService.authenticate_user(db, "candidate@example.com", "correct-horse-battery-staple")
    assert exc_info.value.detail == "Account temporarily locked. Try again later."


def test_unknown_email_and_wrong_password_are_identical_messages(db):
    """The two most common real-world guessing scenarios must be
    indistinguishable."""
    _make_user(db)
    with pytest.raises(AuthenticationError) as exc_info_unknown:
        AuthService.authenticate_user(db, "nobody@example.com", "whatever")
    with pytest.raises(AuthenticationError) as exc_info_wrong:
        AuthService.authenticate_user(db, "candidate@example.com", "wrong-password")
    assert exc_info_unknown.value.detail == exc_info_wrong.value.detail == "Invalid email or password"


def test_suspended_account_wrong_password_does_not_touch_lockout_counters(db):
    """Matches pre-existing behavior: failed_login_attempts is only
    incremented once the suspended/locked gates are passed — a suspended
    account doesn't need its own separate lockout escalation."""
    user = _make_user(db, suspended=True)
    with pytest.raises(AuthenticationError):
        AuthService.authenticate_user(db, "candidate@example.com", "wrong-password")
    db.refresh(user)
    assert user.failed_login_attempts in (0, None)


def test_correct_credentials_on_healthy_account_succeed(db):
    _make_user(db)
    user = AuthService.authenticate_user(db, "candidate@example.com", "correct-horse-battery-staple")
    assert user.email == "candidate@example.com"
