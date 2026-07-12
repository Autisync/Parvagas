"""Tests for the guest "Criar CV do Zero" entry point
(POST /public/resume-sso/guest-start).

Same find-or-create-by-email shadow-account pattern as the sibling guest
CV-drop endpoint (submit_spontaneous_cv in jobs.py, see
test_public_cv_submission.py) — no visible signup screen, but a real
CandidateProfile is created behind the scenes. Since EXECUTION_PLAN_NATIVE_
CV_BUILDER.md's A5, the response is a normal login payload (access_token +
user, same shape as POST /auth/login) rather than an SSO handoff code — the
guest's next stop is the native CV builder route, not an external OIDC
redirect.
"""
import asyncio

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.api.v1.resume_sso import GuestStartRequest, guest_start
from app.db.base import Base
from app.models import CandidateProfile, User, UserRole

_ENDPOINT = guest_start.__wrapped__


@pytest.fixture()
def db():
    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()


async def _guest_start(db, monkeypatch, email="new-guest@example.com", full_name="Maria Guest"):
    verified = []
    monkeypatch.setattr("app.api.v1.resume_sso.send_verification_email.delay", lambda uid, token: verified.append(uid))
    result = await _ENDPOINT(
        request=None,
        payload=GuestStartRequest(fullName=full_name, email=email),
        db=db,
    )
    return result, verified


def test_creates_shadow_account_and_returns_login_payload(db, monkeypatch):
    result, verified = asyncio.run(_guest_start(db, monkeypatch))
    assert result["access_token"]
    assert result["token_type"] == "bearer"
    assert result["isNewUser"] is True
    assert len(verified) == 1  # new account -> verification email queued

    user = db.query(User).filter(User.email == "new-guest@example.com").first()
    assert user is not None
    assert user.role == UserRole.candidate
    assert result["user"].id == user.id

    profile = db.query(CandidateProfile).filter(CandidateProfile.user_id == user.id).first()
    assert profile is not None
    assert profile.first_name == "Maria"
    assert profile.last_name == "Guest"


def test_reuses_existing_account_without_resending_verification(db, monkeypatch):
    asyncio.run(_guest_start(db, monkeypatch, email="returning@example.com"))
    assert db.query(User).filter(User.email == "returning@example.com").count() == 1

    _result, verified = asyncio.run(_guest_start(db, monkeypatch, email="returning@example.com"))
    assert db.query(User).filter(User.email == "returning@example.com").count() == 1  # still just one
    assert verified == []  # returning user -> no new verification email


def test_rejects_email_already_used_by_a_company_account(db, monkeypatch):
    db.add(User(email="taken@example.com", full_name="Empresa X", password_hash="x", role=UserRole.company))
    db.commit()

    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(_guest_start(db, monkeypatch, email="taken@example.com"))
    assert exc_info.value.status_code == 409


def test_rejects_missing_name_or_email(db, monkeypatch):
    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(_guest_start(db, monkeypatch, full_name="   "))
    assert exc_info.value.status_code == 400


def test_rejects_invalid_email(db, monkeypatch):
    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(_guest_start(db, monkeypatch, email="not-an-email"))
    assert exc_info.value.status_code == 400
