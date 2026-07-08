"""Tests for the optional Llama refinement pass over auto-apply match scores
(Phase 1, TEST_PLAN_CAREER_OPS.md). The load-bearing guarantee: refinement
can only run when explicitly enabled, and must fall back to the untouched
heuristic score/reasons on any failure — it can never make matching worse
or crash the sweep.
"""
import json
import uuid

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.base import Base
from app.models import CandidateProfile, Company, CVUpload, Job, User, UserRole
from app.services import auto_apply_service
from app.services.auto_apply_service import _llm_refine_score, generate_proposals_for_candidate


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
        user_id=user.id, phone="+244900000000", location="Luanda", auto_apply_opt_in=True,
        preferred_job_categories=json.dumps(["Tecnologia"]), skills=json.dumps(["Python", "SQL"]),
        years_of_experience=5, expected_salary_aoa=300000, preferred_job_type="remoto",
    )
    defaults.update(profile_kwargs)
    profile = CandidateProfile(**defaults)
    db.add(profile)
    db.flush()
    db.add(CVUpload(candidate_id=profile.id, file_name="cv.pdf", file_path="local:cv.pdf", file_size=10, mime_type="application/pdf"))
    db.commit()
    return user, profile


def _make_job(db, company, **job_kwargs):
    from datetime import datetime
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


def test_refinement_disabled_by_default_returns_heuristic_unchanged(db, monkeypatch):
    monkeypatch.setattr(auto_apply_service.settings, "AUTO_APPLY_LLM_SCORING_ENABLED", False)
    company = _make_company(db)
    _, profile = _make_candidate(db)
    job = _make_job(db, company)

    score, reasons = _llm_refine_score(profile, job, 70, ["heuristic reason"])
    assert score == 70
    assert reasons == ["heuristic reason"]


def test_refinement_enabled_uses_llm_result_when_valid(db, monkeypatch):
    monkeypatch.setattr(auto_apply_service.settings, "AUTO_APPLY_LLM_SCORING_ENABLED", True)
    monkeypatch.setattr(
        auto_apply_service.llm_service, "chat_json",
        lambda *a, **k: {"score": 88, "reasons": ["Forte correspondencia de competencias"]},
    )
    company = _make_company(db)
    _, profile = _make_candidate(db)
    job = _make_job(db, company)

    score, reasons = _llm_refine_score(profile, job, 70, ["heuristic reason"])
    assert score == 88
    assert reasons == ["Forte correspondencia de competencias"]


def test_refinement_falls_back_when_llm_returns_out_of_range_score(db, monkeypatch):
    monkeypatch.setattr(auto_apply_service.settings, "AUTO_APPLY_LLM_SCORING_ENABLED", True)
    monkeypatch.setattr(
        auto_apply_service.llm_service, "chat_json",
        lambda *a, **k: {"score": "not-a-number", "reasons": ["x"]},
    )
    company = _make_company(db)
    _, profile = _make_candidate(db)
    job = _make_job(db, company)

    score, reasons = _llm_refine_score(profile, job, 70, ["heuristic reason"])
    assert score == 70
    assert reasons == ["heuristic reason"]


def test_refinement_falls_back_when_llm_returns_empty_reasons(db, monkeypatch):
    monkeypatch.setattr(auto_apply_service.settings, "AUTO_APPLY_LLM_SCORING_ENABLED", True)
    monkeypatch.setattr(
        auto_apply_service.llm_service, "chat_json",
        lambda *a, **k: {"score": 90, "reasons": []},
    )
    company = _make_company(db)
    _, profile = _make_candidate(db)
    job = _make_job(db, company)

    score, reasons = _llm_refine_score(profile, job, 70, ["heuristic reason"])
    assert score == 70
    assert reasons == ["heuristic reason"]


def test_refinement_clamps_out_of_bounds_score(db, monkeypatch):
    monkeypatch.setattr(auto_apply_service.settings, "AUTO_APPLY_LLM_SCORING_ENABLED", True)
    monkeypatch.setattr(
        auto_apply_service.llm_service, "chat_json",
        lambda *a, **k: {"score": 500, "reasons": ["exagero"]},
    )
    company = _make_company(db)
    _, profile = _make_candidate(db)
    job = _make_job(db, company)

    score, _ = _llm_refine_score(profile, job, 70, ["heuristic reason"])
    assert score == 100


def test_refinement_never_raises_when_llm_service_throws(db, monkeypatch):
    """Defense in depth: chat_json is designed to never raise (Phase 0), but
    if it somehow did, refinement must still degrade to the heuristic result
    instead of crashing the whole candidate's proposal sweep."""
    monkeypatch.setattr(auto_apply_service.settings, "AUTO_APPLY_LLM_SCORING_ENABLED", True)

    def _boom(*a, **k):
        raise RuntimeError("ollama unreachable")

    monkeypatch.setattr(auto_apply_service.llm_service, "chat_json", _boom)
    company = _make_company(db)
    _, profile = _make_candidate(db)
    job = _make_job(db, company)

    score, reasons = _llm_refine_score(profile, job, 70, ["heuristic reason"])
    assert score == 70
    assert reasons == ["heuristic reason"]


def test_generate_proposals_only_refines_jobs_that_already_cleared_threshold(db, monkeypatch):
    """Refinement must not be the thing that saves a bad heuristic match —
    it only runs on jobs already >= MATCH_THRESHOLD (cost control + keeps
    the hard category/skills gate meaningful)."""
    monkeypatch.setattr(auto_apply_service.settings, "AUTO_APPLY_LLM_SCORING_ENABLED", True)
    calls = []

    def _track(*a, **k):
        calls.append(1)
        return {"score": 95, "reasons": ["ok"]}

    monkeypatch.setattr(auto_apply_service.llm_service, "chat_json", _track)

    company = _make_company(db)
    _, profile = _make_candidate(db)
    _make_job(db, company)  # strong heuristic match — clears threshold
    _make_job(db, company, required_skills=json.dumps(["Kubernetes", "Rust"]), required_experience_years=10, work_mode="Presencial", location="Benguela")  # weak match

    created = generate_proposals_for_candidate(db, profile)
    assert len(calls) == len(created)  # only the jobs that made it into `created` triggered an LLM call
    assert len(created) >= 1
