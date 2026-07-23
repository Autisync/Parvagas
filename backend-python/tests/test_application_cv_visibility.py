"""Tests for overnight-audit W0.4: application_candidate_cv (the "Ver CV"
modal a recruiter opens) never checked JobApplication.cv_file_path — the
field that actually holds the file for guest/quick-apply applicants (no
account, so no CandidateProfile/CVUpload row exists) and for logged-in
candidates who uploaded a one-off CV for that specific job. Both are live,
reachable flows; recruiters saw "no CV available" for real applications
that had one, even though the same data was already correctly surfaced on
the separate no-login external-employer view.
"""
import asyncio
import uuid

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.base import Base
from app.models import Company, Job, JobApplication, User, UserRole
from app.api.v1.applications import application_candidate_cv


@pytest.fixture()
def db():
    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()


def _make_owner_company_job(db):
    owner = User(id=str(uuid.uuid4()), email=f"owner-{uuid.uuid4()}@x.com", full_name="Owner", password_hash="x", role=UserRole.company)
    db.add(owner)
    db.flush()
    company = Company(owner_user_id=owner.id, name="Acme", status="active")
    db.add(company)
    db.flush()
    job = Job(company_id=company.id, title="Vaga", status="approved", visibility="public")
    db.add(job)
    db.commit()
    return owner, company, job


def test_guest_quick_apply_cv_now_visible(db):
    """Guest applicant: no account, so candidate_user_id is None and no
    CVUpload row can exist — the file only lives at cv_file_path."""
    owner, company, job = _make_owner_company_job(db)
    app_row = JobApplication(
        job_id=job.id, company_id=company.id, candidate_user_id=None,
        applicant_full_name="Guest Candidate", applicant_email="guest@x.com",
        cv_file_path="server:cvs/guest-application.pdf",
    )
    db.add(app_row)
    db.commit()

    result = asyncio.run(application_candidate_cv(app_row.id, db=db, current_user=owner))
    assert len(result["documents"]) == 1
    assert result["documents"][0]["fileName"] == "CV enviado com a candidatura"


def test_custom_cv_upload_for_logged_in_candidate_now_visible(db):
    """Logged-in candidate who uploaded a one-off CV for this application
    instead of their saved profile CV — candidate_user_id is set, but no
    CandidateProfile/CVUpload row backs this specific file either."""
    owner, company, job = _make_owner_company_job(db)
    candidate_user = User(id=str(uuid.uuid4()), email="cand@x.com", full_name="Cand", password_hash="x", role=UserRole.candidate)
    db.add(candidate_user)
    db.flush()
    app_row = JobApplication(
        job_id=job.id, company_id=company.id, candidate_user_id=candidate_user.id,
        applicant_full_name="Cand", applicant_email="cand@x.com",
        cv_file_path="server:cvs/custom-upload.pdf",
    )
    db.add(app_row)
    db.commit()

    result = asyncio.run(application_candidate_cv(app_row.id, db=db, current_user=owner))
    assert any(d["fileName"] == "CV enviado com a candidatura" for d in result["documents"])


def test_no_cv_at_all_still_returns_empty_documents(db):
    owner, company, job = _make_owner_company_job(db)
    app_row = JobApplication(
        job_id=job.id, company_id=company.id, candidate_user_id=None,
        applicant_full_name="No CV", applicant_email="nocv@x.com",
    )
    db.add(app_row)
    db.commit()

    result = asyncio.run(application_candidate_cv(app_row.id, db=db, current_user=owner))
    assert result["documents"] == []
