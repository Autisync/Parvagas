"""Tests for applying with a native Construtor de CV resume (D1,
EXECUTION_PLAN_NATIVE_CV_BUILDER.md): POST /candidates/jobs/apply's
resumeId param, and the employer-side candidate-cv/resume-cv endpoints
that surface it.
"""
import asyncio
import json
import uuid

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.api.v1.applications import (
    application_candidate_cv,
    application_resume_cv,
    submit_candidate_application,
)
from app.db.base import Base
from app.models import CandidateProfile, Company, Job, JobApplication, Resume, User, UserRole


@pytest.fixture()
def db():
    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()


def _make_candidate_with_resume(db, title="O meu CV"):
    user = User(email=f"cand-{uuid.uuid4()}@example.com", full_name="Ana Sousa", password_hash="x", role=UserRole.candidate)
    db.add(user)
    db.flush()
    profile = CandidateProfile(user_id=user.id)
    db.add(profile)
    db.flush()
    resume = Resume(
        candidate_profile_id=profile.id, title=title,
        data=json.dumps({"fullName": "Ana Sousa", "professionalSummary": "Resumo."}),
        is_draft=False, is_published=False,
    )
    db.add(resume)
    db.commit()
    return user, profile, resume


def _make_job(db):
    owner = User(email=f"owner-{uuid.uuid4()}@example.com", full_name="Owner", password_hash="x", role=UserRole.company)
    db.add(owner)
    db.flush()
    company = Company(owner_user_id=owner.id, name="Acme", status="active")
    db.add(company)
    db.flush()
    job = Job(company_id=company.id, title="Dev", status="approved", visibility="public")
    db.add(job)
    db.commit()
    return company, job, owner


def test_apply_with_resume_id_attaches_it_to_the_application(db, monkeypatch):
    import app.api.v1.applications as applications_module
    monkeypatch.setattr(applications_module, "send_application_received_email", type("T", (), {"delay": staticmethod(lambda *a: None)}))
    monkeypatch.setattr(applications_module, "_notify_company_new_applicant", lambda *a, **k: None)

    user, profile, resume = _make_candidate_with_resume(db)
    company, job, owner = _make_job(db)

    result = asyncio.run(submit_candidate_application(
        jobId=job.id, companyId=company.id, useLatestCv="false", coverLetter="",
        phone=None, location=None, savedCvDocumentId=None, resumeId=resume.id,
        customCv=None, db=db, current_user=user,
    ))
    app_row = db.query(JobApplication).filter(JobApplication.id == result["applicationId"]).first()
    assert app_row.resume_id == resume.id
    assert app_row.profile_source == "native_resume"


def test_apply_rejects_resume_not_owned_by_candidate(db, monkeypatch):
    import app.api.v1.applications as applications_module
    monkeypatch.setattr(applications_module, "send_application_received_email", type("T", (), {"delay": staticmethod(lambda *a: None)}))
    monkeypatch.setattr(applications_module, "_notify_company_new_applicant", lambda *a, **k: None)

    _owner_user, _owner_profile, resume = _make_candidate_with_resume(db)
    intruder, _profile, _r = _make_candidate_with_resume(db, title="Outro CV")
    company, job, owner = _make_job(db)

    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(submit_candidate_application(
            jobId=job.id, companyId=company.id, useLatestCv="false", coverLetter="",
            phone=None, location=None, savedCvDocumentId=None, resumeId=resume.id,
            customCv=None, db=db, current_user=intruder,
        ))
    assert exc_info.value.status_code == 404


def test_candidate_cv_lists_native_resume_first_without_signed_url(db):
    user, profile, resume = _make_candidate_with_resume(db)
    company, job, owner = _make_job(db)
    app_row = JobApplication(
        job_id=job.id, company_id=company.id, candidate_user_id=user.id,
        applicant_full_name=user.full_name, applicant_email=user.email,
        profile_source="native_resume", status="submitted", resume_id=resume.id,
    )
    db.add(app_row)
    db.commit()

    result = asyncio.run(application_candidate_cv(application_id=app_row.id, db=db, current_user=owner))
    docs = result["documents"]
    assert docs[0]["_id"] == resume.id
    assert docs[0]["isNativeResume"] is True
    assert docs[0]["signedUrl"] is None


def test_resume_cv_download_returns_pdf_for_owning_company(db):
    user, profile, resume = _make_candidate_with_resume(db)
    company, job, owner = _make_job(db)
    app_row = JobApplication(
        job_id=job.id, company_id=company.id, candidate_user_id=user.id,
        applicant_full_name=user.full_name, applicant_email=user.email,
        profile_source="native_resume", status="submitted", resume_id=resume.id,
    )
    db.add(app_row)
    db.commit()

    response = asyncio.run(application_resume_cv(application_id=app_row.id, db=db, current_user=owner))
    assert response.media_type == "application/pdf"
    assert response.body.startswith(b"%PDF")


def test_resume_cv_download_rejects_other_company(db):
    user, profile, resume = _make_candidate_with_resume(db)
    company, job, owner = _make_job(db)
    other_owner = User(email=f"other-{uuid.uuid4()}@example.com", full_name="Other", password_hash="x", role=UserRole.company)
    db.add(other_owner)
    db.flush()
    other_company = Company(owner_user_id=other_owner.id, name="Other Co", status="active")
    db.add(other_company)
    db.commit()

    app_row = JobApplication(
        job_id=job.id, company_id=company.id, candidate_user_id=user.id,
        applicant_full_name=user.full_name, applicant_email=user.email,
        profile_source="native_resume", status="submitted", resume_id=resume.id,
    )
    db.add(app_row)
    db.commit()

    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(application_resume_cv(application_id=app_row.id, db=db, current_user=other_owner))
    assert exc_info.value.status_code == 403
