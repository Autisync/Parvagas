"""Tests for the public "express interest" CV-drop endpoint
(POST /public/cv-submissions) — a general, no-login lead-capture form, not
tied to any specific job. Guests created here get a "claim your account"
email (AuthService.maybe_send_guest_claim_email) rather than a plain
verify-email link, since claiming needs to grant a real password too.
"""
import asyncio
import io
import uuid

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from starlette.datastructures import UploadFile

from app.db.base import Base
from app.models import CandidateProfile, CVUpload, User, UserRole
from app.api.v1.jobs import submit_spontaneous_cv

_ENDPOINT = submit_spontaneous_cv.__wrapped__


@pytest.fixture()
def db():
    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()


def _cv_file(name="cv.pdf", content=b"%PDF-1.4 fake"):
    return UploadFile(filename=name, file=io.BytesIO(content), headers={"content-type": "application/pdf"})


async def _submit(db, monkeypatch, email="new-candidate@example.com"):
    parsed = []
    claimed = []
    monkeypatch.setattr("app.api.v1.jobs.parse_cv.delay", lambda cv_id: parsed.append(cv_id))
    monkeypatch.setattr("app.workers.tasks.send_guest_cv_claim_email.delay", lambda uid, token: claimed.append(uid))
    monkeypatch.setattr("app.api.v1.jobs.StorageService.save_file", lambda content, name: f"local:{name}")

    result = await _ENDPOINT(
        request=None,
        fullName="Maria Candidata",
        email=email,
        cellphoneContact="+244900000000",
        city="Luanda",
        personalStatement="Interessada em vagas de engenharia",
        cv=_cv_file(),
        db=db,
    )
    return result, parsed, claimed


def test_creates_user_profile_and_cv_upload(db, monkeypatch):
    result, parsed, claimed = asyncio.run(_submit(db, monkeypatch))

    assert result["success"] is True
    user = db.query(User).filter(User.email == "new-candidate@example.com").first()
    assert user is not None
    assert user.role == UserRole.candidate
    assert user.is_guest_account is True

    profile = db.query(CandidateProfile).filter(CandidateProfile.user_id == user.id).first()
    assert profile is not None
    assert profile.first_name == "Maria"
    assert profile.location == "Luanda"
    assert profile.professional_summary == "Interessada em vagas de engenharia"

    cv_upload = db.query(CVUpload).filter(CVUpload.candidate_id == profile.id).first()
    assert cv_upload is not None
    assert cv_upload.is_primary is True
    assert parsed == [cv_upload.id]
    assert claimed == [user.id]


def test_reuses_existing_candidate_account_without_resending_claim_email(db, monkeypatch):
    existing = User(
        id=str(uuid.uuid4()), email="returning@example.com", full_name="Returning User",
        password_hash="x", role=UserRole.candidate, email_verified=True, is_guest_account=False,
    )
    db.add(existing)
    db.flush()

    result, parsed, claimed = asyncio.run(_submit(db, monkeypatch, email="returning@example.com"))

    assert result["success"] is True
    assert db.query(User).filter(User.email == "returning@example.com").count() == 1
    # Not a guest anymore, so no claim-email nudge — matches
    # AuthService.maybe_send_guest_claim_email's own guard.
    assert claimed == []
    assert len(parsed) == 1


def test_does_not_resend_claim_email_to_already_notified_guest(db, monkeypatch):
    result1, _, claimed1 = asyncio.run(_submit(db, monkeypatch, email="repeat-guest@example.com"))
    assert result1["success"] is True
    assert claimed1 == [db.query(User).filter(User.email == "repeat-guest@example.com").first().id]

    result2, _, claimed2 = asyncio.run(_submit(db, monkeypatch, email="repeat-guest@example.com"))
    assert result2["success"] is True
    assert claimed2 == []  # one-shot: guest_claim_email_sent_at already set


def test_rejects_email_already_used_by_a_company_account(db, monkeypatch):
    company_user = User(
        id=str(uuid.uuid4()), email="taken@example.com", full_name="Company Owner",
        password_hash="x", role=UserRole.company,
    )
    db.add(company_user)
    db.flush()

    from fastapi import HTTPException

    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(_submit(db, monkeypatch, email="taken@example.com"))
    assert exc_info.value.status_code == 409
