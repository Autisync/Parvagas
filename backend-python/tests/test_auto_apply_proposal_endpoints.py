"""Tests for the auto-apply proposal review endpoints (approve/dismiss/list).

Approving must be the ONLY path that creates a real JobApplication — this
locks in the "propose then approve" design so a regression can't silently
turn it back into an auto-submit.
"""
import asyncio
import json
import uuid
from datetime import datetime

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.base import Base
from app.models import CandidateProfile, Company, CVUpload, Job, JobApplication, JobMatchProposal, Resume, User, UserRole
from app.api.v1.candidates import (
    approve_auto_apply_proposal,
    dismiss_auto_apply_proposal,
    list_auto_apply_proposals,
)


@pytest.fixture()
def db():
    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()


def _setup(db):
    owner = User(id=str(uuid.uuid4()), email="owner@x.com", full_name="Owner", password_hash="x", role=UserRole.company)
    db.add(owner)
    db.flush()
    company = Company(owner_user_id=owner.id, name="Acme", status="active")
    db.add(company)
    db.flush()

    user = User(id=str(uuid.uuid4()), email="cand@x.com", full_name="Candidate", password_hash="x", role=UserRole.candidate)
    db.add(user)
    db.flush()
    profile = CandidateProfile(user_id=user.id, phone="+244900000000", location="Luanda", auto_apply_opt_in=True)
    db.add(profile)
    db.flush()
    db.add(CVUpload(candidate_id=profile.id, file_name="cv.pdf", file_path="local:cv.pdf", file_size=10, mime_type="application/pdf"))

    job = Job(company_id=company.id, title="Dev", category="Tecnologia", status="approved", visibility="public", published_at=datetime.utcnow())
    db.add(job)
    db.flush()

    proposal = JobMatchProposal(candidate_id=profile.id, job_id=job.id, match_score=80, match_reasons=json.dumps(["ok"]), status="pending")
    db.add(proposal)
    db.commit()

    return user, profile, job, proposal


def test_approve_creates_application_tagged_auto_apply(db, monkeypatch):
    user, profile, job, proposal = _setup(db)
    monkeypatch.setattr("app.api.v1.candidates.send_application_received_email.delay", lambda *a, **k: None)

    result = asyncio.run(approve_auto_apply_proposal(proposal.id, db=db, current_user=user))

    assert "applicationId" in result
    app_row = db.query(JobApplication).filter(JobApplication.id == result["applicationId"]).first()
    assert app_row is not None
    assert app_row.profile_source == "auto_apply"
    assert app_row.job_id == job.id

    db.refresh(proposal)
    assert proposal.status == "approved"
    assert proposal.resulting_application_id == app_row.id


def test_dismiss_never_creates_an_application(db):
    user, profile, job, proposal = _setup(db)

    result = asyncio.run(dismiss_auto_apply_proposal(proposal.id, db=db, current_user=user))

    assert result["message"]
    db.refresh(proposal)
    assert proposal.status == "dismissed"
    assert db.query(JobApplication).count() == 0


def test_cannot_approve_an_already_reviewed_proposal(db):
    user, profile, job, proposal = _setup(db)
    proposal.status = "dismissed"
    db.commit()

    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(approve_auto_apply_proposal(proposal.id, db=db, current_user=user))
    assert exc_info.value.status_code == 409


def test_cannot_approve_another_candidates_proposal(db):
    user, profile, job, proposal = _setup(db)
    other = User(id=str(uuid.uuid4()), email="other@x.com", full_name="Other", password_hash="x", role=UserRole.candidate)
    db.add(other)
    db.commit()

    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(approve_auto_apply_proposal(proposal.id, db=db, current_user=other))
    assert exc_info.value.status_code == 404


# -------------------- suggested resume attachment (D2) --------------------- #

def test_approve_attaches_category_matching_resume(db, monkeypatch):
    """D2: when the candidate has a resume whose title mentions the job's
    category, approval attaches it (resume_id) instead of the CVUpload
    fallback, and tags profile_source distinctly."""
    user, profile, job, proposal = _setup(db)
    monkeypatch.setattr("app.api.v1.candidates.send_application_received_email.delay", lambda *a, **k: None)
    other_resume = Resume(candidate_profile_id=profile.id, title="CV Genérico", data=json.dumps({}))
    matching_resume = Resume(candidate_profile_id=profile.id, title="CV Tecnologia", data=json.dumps({}))
    db.add_all([other_resume, matching_resume])
    db.commit()

    result = asyncio.run(approve_auto_apply_proposal(proposal.id, db=db, current_user=user))
    app_row = db.query(JobApplication).filter(JobApplication.id == result["applicationId"]).first()
    assert app_row.resume_id == matching_resume.id
    assert app_row.profile_source == "auto_apply_resume"
    assert app_row.saved_cv_document_id is None  # resume wins over the CVUpload fallback


def test_approve_falls_back_to_newest_resume_without_category_match(db, monkeypatch):
    user, profile, job, proposal = _setup(db)
    monkeypatch.setattr("app.api.v1.candidates.send_application_received_email.delay", lambda *a, **k: None)
    older = Resume(candidate_profile_id=profile.id, title="CV Vendas", data=json.dumps({}))
    db.add(older)
    db.commit()
    newer = Resume(candidate_profile_id=profile.id, title="CV Marketing", data=json.dumps({}))
    db.add(newer)
    db.commit()

    result = asyncio.run(approve_auto_apply_proposal(proposal.id, db=db, current_user=user))
    app_row = db.query(JobApplication).filter(JobApplication.id == result["applicationId"]).first()
    assert app_row.resume_id == newer.id  # newest, since neither title matches "Tecnologia"


def test_approve_uses_cvupload_fallback_when_candidate_has_no_resumes(db, monkeypatch):
    user, profile, job, proposal = _setup(db)
    monkeypatch.setattr("app.api.v1.candidates.send_application_received_email.delay", lambda *a, **k: None)

    result = asyncio.run(approve_auto_apply_proposal(proposal.id, db=db, current_user=user))
    app_row = db.query(JobApplication).filter(JobApplication.id == result["applicationId"]).first()
    assert app_row.resume_id is None
    assert app_row.saved_cv_document_id is not None
    assert app_row.profile_source == "auto_apply"


def test_list_proposals_exposes_suggested_resume(db):
    user, profile, job, proposal = _setup(db)
    resume = Resume(candidate_profile_id=profile.id, title="CV Tecnologia", data=json.dumps({}))
    db.add(resume)
    db.commit()

    result = asyncio.run(list_auto_apply_proposals(status_filter="pending", db=db, current_user=user))
    listed = next(p for p in result["proposals"] if p["_id"] == proposal.id)
    assert listed["suggestedResumeId"] == resume.id
    assert listed["suggestedResumeTitle"] == "CV Tecnologia"


def test_list_defaults_to_pending_only(db):
    user, profile, job, proposal = _setup(db)
    proposal2 = JobMatchProposal(candidate_id=profile.id, job_id=job.id + "-x", match_score=70, match_reasons="[]", status="dismissed")
    db.add(proposal2)
    db.commit()

    result = asyncio.run(list_auto_apply_proposals(status_filter="pending", db=db, current_user=user))
    ids = [p["_id"] for p in result["proposals"]]
    assert proposal.id in ids
    assert proposal2.id not in ids
