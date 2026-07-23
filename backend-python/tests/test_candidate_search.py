"""Tests for overnight-audit W5.2 — the candidate-directory search and
full-profile view endpoints. Companies previously could only see a
candidate after that candidate applied to one of their jobs; this is
gated behind discoverable_opt_in (hard privacy filter, not optional) and
the Business plan (assert_candidate_search_access).
"""
import asyncio
import json
import uuid
from datetime import datetime, timedelta

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.base import Base
from app.models import CandidateProfile, Company, CompanyMember, Plan, Subscription, User, UserRole
from app.api.v1.candidate_search import search_candidate_directory, view_candidate_profile


@pytest.fixture()
def db():
    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()


def _make_owner_and_company(db):
    owner = User(id=str(uuid.uuid4()), email=f"owner-{uuid.uuid4()}@x.com", full_name="Owner", password_hash="x", role=UserRole.company)
    db.add(owner)
    db.flush()
    company = Company(owner_user_id=owner.id, name="Acme", status="active")
    db.add(company)
    db.commit()
    return owner, company


def _give_business_plan(db, company):
    plan = Plan(code="business", name="Business", price=75000, interval="month", max_active_jobs=-1, candidate_search_included=True)
    db.add(plan)
    db.flush()
    db.add(Subscription(company_id=company.id, plan_id=plan.id, status="active", current_period_end=datetime.utcnow() + timedelta(days=30)))
    db.commit()


def _make_candidate(db, *, discoverable, job_title="Engenheiro de Vendas", location="Luanda", years=5, skills=None):
    user = User(id=str(uuid.uuid4()), email=f"cand-{uuid.uuid4()}@x.com", full_name="Ana Silva", password_hash="x", role=UserRole.candidate)
    db.add(user)
    db.flush()
    profile = CandidateProfile(
        user_id=user.id, job_title=job_title, location=location, years_of_experience=years,
        professional_summary="Perfil de vendas com experiência em B2B.",
        skills=json.dumps(skills or ["Vendas", "Negociação"]),
        phone="+244911111111", discoverable_opt_in=discoverable,
    )
    db.add(profile)
    db.commit()
    return user, profile


def test_search_only_returns_opted_in_candidates(db):
    owner, company = _make_owner_and_company(db)
    _give_business_plan(db, company)
    opted_in, _ = _make_candidate(db, discoverable=True)
    _opted_out, _ = _make_candidate(db, discoverable=False)

    result = asyncio.run(search_candidate_directory(page=1, limit=20, db=db, current_user=owner))
    ids = {c["userId"] for c in result["candidates"]}
    assert opted_in.id in ids
    assert len(result["candidates"]) == 1


def test_search_results_never_include_contact_info(db):
    owner, company = _make_owner_and_company(db)
    _give_business_plan(db, company)
    _make_candidate(db, discoverable=True)

    result = asyncio.run(search_candidate_directory(page=1, limit=20, db=db, current_user=owner))
    card = result["candidates"][0]
    assert "phone" not in card
    assert "email" not in card


def test_search_keyword_filters_by_job_title(db):
    owner, company = _make_owner_and_company(db)
    _give_business_plan(db, company)
    _make_candidate(db, discoverable=True, job_title="Engenheiro de Software")
    _make_candidate(db, discoverable=True, job_title="Motorista Profissional")

    result = asyncio.run(search_candidate_directory(page=1, limit=20, keyword="Motorista", db=db, current_user=owner))
    assert len(result["candidates"]) == 1
    assert result["candidates"][0]["jobTitle"] == "Motorista Profissional"


def test_search_min_years_filter(db):
    owner, company = _make_owner_and_company(db)
    _give_business_plan(db, company)
    _make_candidate(db, discoverable=True, years=2)
    _make_candidate(db, discoverable=True, years=8)

    result = asyncio.run(search_candidate_directory(page=1, limit=20, minYears=5, db=db, current_user=owner))
    assert len(result["candidates"]) == 1
    assert result["candidates"][0]["yearsOfExperience"] == 8


def test_free_plan_company_gets_402(db):
    owner, company = _make_owner_and_company(db)  # no subscription -> free plan
    _make_candidate(db, discoverable=True)

    with pytest.raises(HTTPException) as exc:
        asyncio.run(search_candidate_directory(page=1, limit=20, db=db, current_user=owner))
    assert exc.value.status_code == 402


def test_viewer_can_search(db):
    owner, company = _make_owner_and_company(db)
    _give_business_plan(db, company)
    viewer_user = User(id=str(uuid.uuid4()), email="viewer@x.com", full_name="Viewer", password_hash="x", role=UserRole.company)
    db.add(viewer_user)
    db.flush()
    db.add(CompanyMember(company_id=company.id, user_id=viewer_user.id, role="viewer"))
    db.commit()
    _make_candidate(db, discoverable=True)

    result = asyncio.run(search_candidate_directory(page=1, limit=20, db=db, current_user=viewer_user))
    assert len(result["candidates"]) == 1


def test_full_profile_includes_contact_info(db):
    owner, company = _make_owner_and_company(db)
    _give_business_plan(db, company)
    candidate, _ = _make_candidate(db, discoverable=True)

    result = asyncio.run(view_candidate_profile(candidate.id, db=db, current_user=owner))
    assert result["profile"]["phone"] == "+244911111111"
    assert result["profile"]["email"] == candidate.email


def test_full_profile_404s_for_non_opted_in(db):
    owner, company = _make_owner_and_company(db)
    _give_business_plan(db, company)
    candidate, _ = _make_candidate(db, discoverable=False)

    with pytest.raises(HTTPException) as exc:
        asyncio.run(view_candidate_profile(candidate.id, db=db, current_user=owner))
    assert exc.value.status_code == 404


def test_full_profile_404s_for_nonexistent_user(db):
    owner, company = _make_owner_and_company(db)
    _give_business_plan(db, company)

    with pytest.raises(HTTPException) as exc:
        asyncio.run(view_candidate_profile(str(uuid.uuid4()), db=db, current_user=owner))
    assert exc.value.status_code == 404
