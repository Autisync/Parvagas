"""Tests for the public "Criar Perfil por CV" endpoint (POST /public/cv-submissions).

This endpoint was missing entirely on the FastAPI backend after the Node.js
-> Python migration (the route only ever existed in the old Express server),
which is why guests could never create a CV profile from the homepage CTA.
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


async def _submit(db, monkeypatch, email="new-candidate@example.com", extra=None):
    parsed = []
    verified = []
    monkeypatch.setattr("app.api.v1.jobs.parse_cv.delay", lambda cv_id: parsed.append(cv_id))
    monkeypatch.setattr("app.api.v1.jobs.send_verification_email.delay", lambda uid, token: verified.append(uid))
    monkeypatch.setattr("app.api.v1.jobs.StorageService.save_file", lambda content, name: f"local:{name}")

    result = await _ENDPOINT(
        request=None,
        fullName="Maria Candidata",
        email=email,
        cellphoneContact="+244900000000",
        city="Luanda",
        residencialAddress="",
        qualification="Licenciatura",
        profession="Engenheira",
        personalStatement="Resumo",
        cv=_cv_file(),
        extraDocument=extra,
        db=db,
    )
    return result, parsed, verified


def test_creates_user_profile_and_cv_upload(db, monkeypatch):
    result, parsed, verified = asyncio.run(_submit(db, monkeypatch))

    assert result["success"] is True
    user = db.query(User).filter(User.email == "new-candidate@example.com").first()
    assert user is not None
    assert user.role == UserRole.candidate

    profile = db.query(CandidateProfile).filter(CandidateProfile.user_id == user.id).first()
    assert profile is not None
    assert profile.first_name == "Maria"
    assert profile.job_title == "Engenheira"

    cv_upload = db.query(CVUpload).filter(CVUpload.candidate_id == profile.id).first()
    assert cv_upload is not None
    assert cv_upload.is_primary is True
    assert parsed == [cv_upload.id]
    assert verified == [user.id]


def test_reuses_existing_candidate_account_without_resending_verification(db, monkeypatch):
    existing = User(
        id=str(uuid.uuid4()), email="returning@example.com", full_name="Returning User",
        password_hash="x", role=UserRole.candidate, email_verified=True,
    )
    db.add(existing)
    db.flush()

    result, parsed, verified = asyncio.run(_submit(db, monkeypatch, email="returning@example.com"))

    assert result["success"] is True
    assert db.query(User).filter(User.email == "returning@example.com").count() == 1
    assert verified == []
    assert len(parsed) == 1


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
