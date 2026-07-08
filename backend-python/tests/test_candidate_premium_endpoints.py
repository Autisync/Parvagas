"""Tests for the premium AI tool endpoints (Phase 4): interview-prep,
cover-letter, company-snapshot. Covers access control (auth + entitlement
gate) and the grounding/fallback guarantees each endpoint depends on.
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
from app.models import CandidateProfile, CandidateSubscription, Company, Job, User, UserRole
from app.api.v1 import candidates as candidates_module
from app.api.v1.candidates import (
    generate_cover_letter,
    generate_interview_prep,
    get_company_snapshot,
)


@pytest.fixture()
def db():
    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()


@pytest.fixture(autouse=True)
def _premium_flag_off(monkeypatch):
    # Ship-free default — most tests exercise the free-for-now path.
    monkeypatch.setattr(candidates_module.settings, "CANDIDATE_PREMIUM_ENABLED", False)


def _make_candidate(db, **profile_kwargs):
    user = User(id=str(uuid.uuid4()), email=f"cand-{uuid.uuid4()}@x.com", full_name="Candidate", password_hash="x", role=UserRole.candidate)
    db.add(user)
    db.flush()
    defaults = dict(user_id=user.id, phone="+244900000000", location="Luanda")
    defaults.update(profile_kwargs)
    profile = CandidateProfile(**defaults)
    db.add(profile)
    db.commit()
    return user, profile


def _make_company_and_job(db, **job_kwargs):
    owner = User(id=str(uuid.uuid4()), email=f"owner-{uuid.uuid4()}@x.com", full_name="Owner", password_hash="x", role=UserRole.company)
    db.add(owner)
    db.flush()
    company = Company(owner_user_id=owner.id, name="Acme", status="active", website="https://acme.example", description="Uma empresa de tecnologia.")
    db.add(company)
    db.flush()
    defaults = dict(company_id=company.id, title="Engenheiro de Software", category="Tecnologia", status="approved", visibility="public", published_at=datetime.utcnow())
    defaults.update(job_kwargs)
    job = Job(**defaults)
    db.add(job)
    db.commit()
    return company, job


# ── Access control ────────────────────────────────────────────────────────

def test_interview_prep_requires_active_subscription_when_flag_on(db, monkeypatch):
    monkeypatch.setattr(candidates_module.settings, "CANDIDATE_PREMIUM_ENABLED", True)
    user, profile = _make_candidate(db)
    _, job = _make_company_and_job(db)

    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(generate_interview_prep({"jobId": job.id}, db=db, current_user=user))
    assert exc_info.value.status_code == 402


def test_interview_prep_allowed_with_active_subscription_when_flag_on(db, monkeypatch):
    monkeypatch.setattr(candidates_module.settings, "CANDIDATE_PREMIUM_ENABLED", True)
    user, profile = _make_candidate(db, work_experience=json.dumps([{"jobTitle": "Dev", "company": "X"}]))
    db.add(CandidateSubscription(candidate_user_id=user.id, status="active"))
    db.commit()
    _, job = _make_company_and_job(db)
    monkeypatch.setattr(candidates_module.llm_service, "chat_json", lambda *a, **k: {"stories": [{"situation": "s", "task": "t", "action": "a", "result": "r"}]})

    result = asyncio.run(generate_interview_prep({"jobId": job.id}, db=db, current_user=user))
    assert result["unavailable"] is False


def test_non_candidate_role_rejected(db):
    user = User(id=str(uuid.uuid4()), email="co@x.com", full_name="Co", password_hash="x", role=UserRole.company)
    db.add(user)
    db.commit()
    _, job = _make_company_and_job(db)

    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(generate_interview_prep({"jobId": job.id}, db=db, current_user=user))
    assert exc_info.value.status_code == 403


def test_missing_job_id_returns_400(db):
    user, _ = _make_candidate(db)
    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(generate_interview_prep({}, db=db, current_user=user))
    assert exc_info.value.status_code == 400


def test_unknown_job_returns_404(db):
    user, _ = _make_candidate(db)
    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(generate_interview_prep({"jobId": "does-not-exist"}, db=db, current_user=user))
    assert exc_info.value.status_code == 404


# ── Interview prep grounding ─────────────────────────────────────────────

def test_interview_prep_skips_llm_call_with_no_work_experience(db, monkeypatch):
    user, profile = _make_candidate(db, work_experience=None)
    _, job = _make_company_and_job(db)
    calls = []
    monkeypatch.setattr(candidates_module.llm_service, "chat_json", lambda *a, **k: calls.append(1) or {"stories": []})

    result = asyncio.run(generate_interview_prep({"jobId": job.id}, db=db, current_user=user))
    assert result["unavailable"] is True
    assert calls == []  # never called the LLM without real experience to ground on


def test_interview_prep_falls_back_when_llm_returns_empty(db, monkeypatch):
    user, profile = _make_candidate(db, work_experience=json.dumps([{"jobTitle": "Dev", "company": "X"}]))
    _, job = _make_company_and_job(db)
    monkeypatch.setattr(candidates_module.llm_service, "chat_json", lambda *a, **k: {"stories": []})

    result = asyncio.run(generate_interview_prep({"jobId": job.id}, db=db, current_user=user))
    assert result["unavailable"] is True
    assert result["stories"] == []


def test_interview_prep_falls_back_when_llm_raises(db, monkeypatch):
    user, profile = _make_candidate(db, work_experience=json.dumps([{"jobTitle": "Dev", "company": "X"}]))
    _, job = _make_company_and_job(db)

    def _boom(*a, **k):
        raise RuntimeError("ollama unreachable")

    monkeypatch.setattr(candidates_module.llm_service, "chat_json", _boom)
    result = asyncio.run(generate_interview_prep({"jobId": job.id}, db=db, current_user=user))
    assert result["unavailable"] is True


# ── Cover letter ──────────────────────────────────────────────────────────

def test_cover_letter_success(db, monkeypatch):
    user, profile = _make_candidate(db, professional_summary="Engenheira com 5 anos de experiencia.")
    _, job = _make_company_and_job(db)
    monkeypatch.setattr(candidates_module.llm_service, "chat_json", lambda *a, **k: {"coverLetter": "Prezados, ..."})

    result = asyncio.run(generate_cover_letter({"jobId": job.id}, db=db, current_user=user))
    assert result["unavailable"] is False
    assert result["coverLetter"] == "Prezados, ..."


def test_cover_letter_falls_back_on_malformed_response(db, monkeypatch):
    user, profile = _make_candidate(db)
    _, job = _make_company_and_job(db)
    monkeypatch.setattr(candidates_module.llm_service, "chat_json", lambda *a, **k: {"coverLetter": 12345})

    result = asyncio.run(generate_cover_letter({"jobId": job.id}, db=db, current_user=user))
    assert result["unavailable"] is True
    assert result["coverLetter"] == ""


# ── Company snapshot ──────────────────────────────────────────────────────

def test_company_snapshot_uses_only_known_db_facts(db, monkeypatch):
    user, _ = _make_candidate(db)
    company, job = _make_company_and_job(db)
    captured_prompt = {}

    def _fake_chat_json(system, user_prompt, fallback):
        captured_prompt["user_prompt"] = json.loads(user_prompt)
        return {"snapshot": "A Acme e uma empresa de tecnologia."}

    monkeypatch.setattr(candidates_module.llm_service, "chat_json", _fake_chat_json)
    result = asyncio.run(get_company_snapshot(job.id, db=db, current_user=user))

    assert result["unavailable"] is False
    assert result["facts"]["name"] == "Acme"
    assert result["facts"]["website"] == "https://acme.example"
    assert result["facts"]["activeJobs"] == 1
    # Only real DB facts ever left this function into the prompt.
    assert captured_prompt["user_prompt"]["known_facts"]["name"] == "Acme"


def test_company_snapshot_returns_raw_facts_when_llm_unavailable(db, monkeypatch):
    user, _ = _make_candidate(db)
    company, job = _make_company_and_job(db)

    def _boom(*a, **k):
        raise RuntimeError("ollama unreachable")

    monkeypatch.setattr(candidates_module.llm_service, "chat_json", _boom)
    result = asyncio.run(get_company_snapshot(job.id, db=db, current_user=user))
    assert result["unavailable"] is True
    assert result["facts"]["name"] == "Acme"  # real facts still returned even without prose


def test_company_snapshot_unavailable_for_aggregator_jobs_with_no_real_company(db):
    """Aggregated/scraped jobs point at the synthetic Parvagas Aggregator
    company — we must never present that as if it were the real employer."""
    user, _ = _make_candidate(db)
    owner = User(id=str(uuid.uuid4()), email="admin@parvagas.pt", full_name="Admin", password_hash="x", role=UserRole.admin)
    db.add(owner)
    db.flush()
    aggregator = Company(owner_user_id=owner.id, name="Parvagas Aggregator", status="active")
    db.add(aggregator)
    db.flush()
    job = Job(company_id=aggregator.id, title="Vaga externa", category="Tecnologia", status="approved", visibility="public", published_at=datetime.utcnow())
    db.add(job)
    db.commit()

    result = asyncio.run(get_company_snapshot(job.id, db=db, current_user=user))
    assert result["unavailable"] is True
    assert result["facts"]["name"] is None
