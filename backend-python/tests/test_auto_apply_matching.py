"""Tests for the auto-apply matching/proposal-generation service.

Covers the redesigned feature: precise multi-signal scoring (not just
category), a bounded "propose then approve" queue, eligibility gating, and
dedup against jobs already applied to or already proposed.
"""
import json
import uuid
from datetime import datetime, timedelta

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.base import Base
from app.models import CandidateProfile, CVUpload, Company, Job, JobApplication, JobMatchProposal, User, UserRole
from app.services.auto_apply_service import (
    MATCH_THRESHOLD,
    candidate_is_eligible,
    expire_stale_proposals,
    generate_proposals_for_candidate,
    score_job_for_candidate,
)


@pytest.fixture()
def db():
    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()


def _make_company(db):
    owner = User(id=str(uuid.uuid4()), email=f"owner-{uuid.uuid4()}@x.com", full_name="Owner", password_hash="x", role=UserRole.company)
    db.add(owner)
    db.flush()
    company = Company(owner_user_id=owner.id, name="Acme", status="active")
    db.add(company)
    db.flush()
    return company


def _make_candidate(db, **profile_kwargs):
    user = User(id=str(uuid.uuid4()), email=f"cand-{uuid.uuid4()}@x.com", full_name="Candidate", password_hash="x", role=UserRole.candidate)
    db.add(user)
    db.flush()
    defaults = dict(
        user_id=user.id,
        phone="+244900000000",
        location="Luanda",
        auto_apply_opt_in=True,
        preferred_job_categories=json.dumps(["Tecnologia"]),
        skills=json.dumps(["Python", "SQL", "React"]),
        years_of_experience=5,
        expected_salary_aoa=300000,
        preferred_job_type="remoto",
    )
    defaults.update(profile_kwargs)
    profile = CandidateProfile(**defaults)
    db.add(profile)
    db.flush()
    db.add(CVUpload(candidate_id=profile.id, file_name="cv.pdf", file_path="local:cv.pdf", file_size=100, mime_type="application/pdf"))
    db.commit()
    return user, profile


def _make_job(db, company, **job_kwargs):
    defaults = dict(
        company_id=company.id, title="Engenheiro de Software", category="Tecnologia",
        status="approved", visibility="public", published_at=datetime.utcnow(),
        required_skills=json.dumps(["Python", "SQL"]), required_experience_years=3,
        salary_min=250000, salary_max=400000, work_mode="Remoto", location="Luanda",
    )
    defaults.update(job_kwargs)
    job = Job(**defaults)
    db.add(job)
    db.commit()
    return job


def test_well_matched_job_scores_above_threshold(db):
    company = _make_company(db)
    _, profile = _make_candidate(db)
    job = _make_job(db, company)

    score, reasons = score_job_for_candidate(profile, job)
    assert score >= MATCH_THRESHOLD
    assert reasons


def test_poorly_matched_job_scores_below_threshold(db):
    company = _make_company(db)
    _, profile = _make_candidate(db, skills=json.dumps(["Excel"]), years_of_experience=0, expected_salary_aoa=900000)
    job = _make_job(db, company, required_skills=json.dumps(["Kubernetes", "Rust"]), required_experience_years=8, work_mode="Presencial", location="Benguela")

    score, _ = score_job_for_candidate(profile, job)
    assert score < MATCH_THRESHOLD


def test_ineligible_without_cv(db):
    company = _make_company(db)
    user = User(id=str(uuid.uuid4()), email="nocv@x.com", full_name="No CV", password_hash="x", role=UserRole.candidate)
    db.add(user)
    db.flush()
    profile = CandidateProfile(
        user_id=user.id, phone="+244900000000", location="Luanda",
        auto_apply_opt_in=True, preferred_job_categories=json.dumps(["Tecnologia"]),
    )
    db.add(profile)
    db.commit()

    assert candidate_is_eligible(db, profile) is False
    assert generate_proposals_for_candidate(db, profile) == []


def test_ineligible_without_opt_in(db):
    _, profile = _make_candidate(db, auto_apply_opt_in=False)
    assert candidate_is_eligible(db, profile) is False


def test_generates_proposal_for_matching_job(db):
    company = _make_company(db)
    _, profile = _make_candidate(db)
    job = _make_job(db, company)

    created = generate_proposals_for_candidate(db, profile)
    assert len(created) == 1
    assert created[0].job_id == job.id
    assert created[0].status == "pending"


def test_does_not_reproposal_same_job_twice(db):
    company = _make_company(db)
    _, profile = _make_candidate(db)
    _make_job(db, company)

    first = generate_proposals_for_candidate(db, profile)
    second = generate_proposals_for_candidate(db, profile)
    assert len(first) == 1
    assert len(second) == 0


def test_skips_job_already_applied_to(db):
    company = _make_company(db)
    user, profile = _make_candidate(db)
    job = _make_job(db, company)
    db.add(JobApplication(
        job_id=job.id, company_id=company.id, candidate_user_id=user.id,
        applicant_full_name="Candidate", applicant_email=user.email, profile_source="manual",
    ))
    db.commit()

    created = generate_proposals_for_candidate(db, profile)
    assert created == []


def test_skips_job_in_different_category(db):
    company = _make_company(db)
    _, profile = _make_candidate(db)
    _make_job(db, company, category="Energia")

    created = generate_proposals_for_candidate(db, profile)
    assert created == []


def test_respects_max_pending_cap(db):
    company = _make_company(db)
    _, profile = _make_candidate(db)
    for _ in range(25):
        _make_job(db, company)

    created = generate_proposals_for_candidate(db, profile)
    assert len(created) == 5  # MAX_NEW_PROPOSALS_PER_RUN


def test_expire_stale_proposals_marks_old_pending_as_expired(db):
    company = _make_company(db)
    _, profile = _make_candidate(db)
    job = _make_job(db, company)
    old = JobMatchProposal(
        candidate_id=profile.id, job_id=job.id, match_score=80,
        match_reasons="[]", status="pending",
        created_at=datetime.utcnow() - timedelta(days=20),
    )
    db.add(old)
    db.commit()

    expired_count = expire_stale_proposals(db)
    db.refresh(old)
    assert expired_count == 1
    assert old.status == "expired"
