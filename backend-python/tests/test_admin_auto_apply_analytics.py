"""Tests for the admin auto-apply funnel + AI usage rollup — proposal
volume/approval-rate from JobMatchProposal (already populated, unlike the
deleted JobMatch table) and per-feature LLM call counts from LlmCallLog
(llm_service.py recorded nothing about usage before this session).
"""
import asyncio
import uuid

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.base import Base
from app.models import Company, Job, JobMatchProposal, LlmCallLog, User, UserRole
from app.api.v1.admin import admin_auto_apply_analytics


@pytest.fixture()
def db():
    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()


def _make_admin(db):
    admin = User(id=str(uuid.uuid4()), email=f"admin-{uuid.uuid4()}@parvagas.pt", full_name="Admin", password_hash="x", role=UserRole.admin)
    db.add(admin)
    db.commit()
    return admin


def _make_candidate_profile(db):
    from app.models import CandidateProfile
    user = User(id=str(uuid.uuid4()), email=f"cand-{uuid.uuid4()}@x.com", full_name="Cand", password_hash="x", role=UserRole.candidate)
    db.add(user)
    db.flush()
    profile = CandidateProfile(user_id=user.id)
    db.add(profile)
    db.commit()
    return profile


def _make_job(db):
    owner = User(id=str(uuid.uuid4()), email=f"owner-{uuid.uuid4()}@x.com", full_name="Owner", password_hash="x", role=UserRole.company)
    db.add(owner)
    db.flush()
    company = Company(owner_user_id=owner.id, name="Acme", status="active")
    db.add(company)
    db.flush()
    job = Job(company_id=company.id, title="Vaga", status="approved", visibility="public")
    db.add(job)
    db.commit()
    return job


def test_funnel_counts_by_status(db):
    admin = _make_admin(db)
    profile = _make_candidate_profile(db)
    job = _make_job(db)
    db.add(JobMatchProposal(candidate_id=profile.id, job_id=job.id, status="pending"))
    db.add(JobMatchProposal(candidate_id=profile.id, job_id=job.id, status="approved"))
    db.add(JobMatchProposal(candidate_id=profile.id, job_id=job.id, status="approved"))
    db.add(JobMatchProposal(candidate_id=profile.id, job_id=job.id, status="dismissed"))
    db.commit()

    result = asyncio.run(admin_auto_apply_analytics(db=db, current_user=admin))

    funnel = result["autoApplyFunnel"]
    assert funnel["total"] == 4
    assert funnel["pending"] == 1
    assert funnel["approved"] == 2
    assert funnel["dismissed"] == 1
    assert funnel["approvalRate"] == 50.0


def test_funnel_approval_rate_none_when_no_proposals(db):
    admin = _make_admin(db)
    result = asyncio.run(admin_auto_apply_analytics(db=db, current_user=admin))
    assert result["autoApplyFunnel"]["total"] == 0
    assert result["autoApplyFunnel"]["approvalRate"] is None


def test_llm_usage_grouped_by_feature_with_success_and_failure_counts(db):
    admin = _make_admin(db)
    db.add(LlmCallLog(feature="auto_apply_scoring", provider="ollama", model="m", success=True))
    db.add(LlmCallLog(feature="auto_apply_scoring", provider="ollama", model="m", success=True))
    db.add(LlmCallLog(feature="auto_apply_scoring", provider="ollama", model="m", success=False))
    db.add(LlmCallLog(feature="resume_ai_paid", provider="openai", model="gpt", success=True))
    db.commit()

    result = asyncio.run(admin_auto_apply_analytics(db=db, current_user=admin))

    usage_by_feature = {u["feature"]: u for u in result["llmUsage"]}
    assert usage_by_feature["auto_apply_scoring"]["success"] == 2
    assert usage_by_feature["auto_apply_scoring"]["failed"] == 1
    assert usage_by_feature["auto_apply_scoring"]["total"] == 3
    assert usage_by_feature["resume_ai_paid"]["total"] == 1
    # Ordered by total descending.
    assert result["llmUsage"][0]["feature"] == "auto_apply_scoring"


def test_llm_usage_empty_when_no_calls_logged(db):
    admin = _make_admin(db)
    result = asyncio.run(admin_auto_apply_analytics(db=db, current_user=admin))
    assert result["llmUsage"] == []
