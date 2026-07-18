"""Tests for the new security-event capture points added on top of
record_security_event: captcha failures, password reset lifecycle, admin
login, OTP verify failures, and rate-limit hits. Calls the FastAPI endpoint
functions directly (same pattern as test_notification_wiring.py) rather
than spinning up a TestClient — lighter weight, and verify_captcha is
monkeypatched on app.core.captcha since every call site does a local
`from app.core.captcha import verify_captcha` import that re-resolves the
module attribute at call time.
"""
import asyncio
import uuid
from types import SimpleNamespace

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core.security import hash_password
from app.db.base import Base
from app.models import SecurityEvent, User, UserRole
from app.schemas import ForgotPasswordRequest, ResetPasswordRequest, UserLoginRequest
from app.api.v1.auth import forgot_password, login, otp_verify, reset_password
from app.services.auth_service import AuthService


def _fake_request(ip="9.9.9.9") -> SimpleNamespace:
    return SimpleNamespace(
        client=SimpleNamespace(host=ip),
        headers={"user-agent": "pytest"},
    )


async def _always_pass_captcha(*a, **k):
    return True


async def _always_fail_captcha(*a, **k):
    return False


@pytest.fixture()
def db():
    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()


def _events(db, event_type):
    return db.query(SecurityEvent).filter(SecurityEvent.event_type == event_type).all()


def test_captcha_failure_is_recorded(db, monkeypatch):
    monkeypatch.setattr("app.core.captcha.verify_captcha", _always_fail_captcha)

    payload = UserLoginRequest(email="someone@example.com", password="whatever123")
    with pytest.raises(Exception):
        asyncio.run(login(_fake_request(), payload, db=db))

    rows = _events(db, "captcha_failed")
    assert len(rows) == 1
    assert rows[0].ip_address == "9.9.9.9"


def test_password_reset_requested_is_recorded(db, monkeypatch):
    monkeypatch.setattr("app.core.captcha.verify_captcha", _always_pass_captcha)
    monkeypatch.setattr("app.workers.tasks.send_password_reset_email.delay", lambda *a, **k: None)

    user = User(id=str(uuid.uuid4()), email="reset-me@example.com", full_name="Reset Me", password_hash=hash_password("Password123!"), role=UserRole.candidate)
    db.add(user)
    db.commit()

    asyncio.run(forgot_password(_fake_request(), ForgotPasswordRequest(email=user.email), db=db))

    rows = _events(db, "password_reset_requested")
    assert len(rows) == 1
    assert rows[0].email == user.email.lower()


def test_password_reset_completed_is_recorded(db, monkeypatch):
    monkeypatch.setattr("app.core.captcha.verify_captcha", _always_pass_captcha)

    user = User(id=str(uuid.uuid4()), email="reset-done@example.com", full_name="Reset Done", password_hash=hash_password("OldPassword123!"), role=UserRole.candidate)
    db.add(user)
    db.commit()
    raw_token = AuthService.create_password_reset_token(db, user)
    db.commit()

    asyncio.run(reset_password(
        _fake_request(),
        ResetPasswordRequest(token=raw_token, new_password="NewPassword123!", confirm_password="NewPassword123!"),
        db=db,
    ))

    rows = _events(db, "password_reset_completed")
    assert len(rows) == 1
    assert rows[0].email == user.email.lower()


def test_admin_login_success_is_recorded(db, monkeypatch):
    monkeypatch.setattr("app.core.captcha.verify_captcha", _always_pass_captcha)

    admin = User(id=str(uuid.uuid4()), email="admin-login@parvagas.pt", full_name="Admin", password_hash=hash_password("AdminPass123!"), role=UserRole.admin, admin_level="super-admin", email_verified=True)
    db.add(admin)
    db.commit()

    result = asyncio.run(login(_fake_request(), UserLoginRequest(email=admin.email, password="AdminPass123!"), db=db))

    assert result["access_token"]
    rows = _events(db, "admin_login_success")
    assert len(rows) == 1
    assert rows[0].email == admin.email.lower()


def test_non_admin_login_success_is_not_recorded_as_admin_login(db, monkeypatch):
    monkeypatch.setattr("app.core.captcha.verify_captcha", _always_pass_captcha)

    candidate = User(id=str(uuid.uuid4()), email="candidate-login@example.com", full_name="Candidate", password_hash=hash_password("CandPass123!"), role=UserRole.candidate, email_verified=True)
    db.add(candidate)
    db.commit()

    asyncio.run(login(_fake_request(), UserLoginRequest(email=candidate.email, password="CandPass123!"), db=db))

    assert _events(db, "admin_login_success") == []


def test_otp_verify_wrong_code_is_recorded(db, monkeypatch):
    from app.models import OtpCode
    from app.core.security import hash_token
    from datetime import datetime, timedelta

    monkeypatch.setattr("app.core.captcha.verify_captcha", _always_pass_captcha)
    monkeypatch.setattr("app.api.v1.auth._ensure_otp_login_enabled", lambda db: None)

    db.add(OtpCode(phone="+244900000000", code_hash=hash_token("123456"), purpose="login", expires_at=datetime.utcnow() + timedelta(minutes=10)))
    db.commit()

    with pytest.raises(Exception):
        asyncio.run(otp_verify(_fake_request(), {"phone": "+244900000000", "code": "000000"}, db=db))

    rows = _events(db, "otp_verify_failed")
    assert len(rows) == 1
    assert rows[0].details and "wrong_code" in rows[0].details


def test_rate_limit_exceeded_is_recorded(db, monkeypatch):
    from app.main import _rate_limit_exceeded_with_logging

    monkeypatch.setattr("app.db.session.SessionLocal", lambda: db)

    class _FakeExc(Exception):
        detail = "5 per 1 minute"

    fake_request = SimpleNamespace(
        client=SimpleNamespace(host="1.2.3.4"),
        headers={"user-agent": "pytest"},
        url=SimpleNamespace(path="/api/v1/auth/login"),
        app=SimpleNamespace(state=SimpleNamespace(limiter=SimpleNamespace(_inject_headers=lambda resp, _state: resp))),
        state=SimpleNamespace(view_rate_limit=None),
    )

    _rate_limit_exceeded_with_logging(fake_request, _FakeExc())

    rows = _events(db, "rate_limit_exceeded")
    assert len(rows) == 1
    assert rows[0].details and "/api/v1/auth/login" in rows[0].details
