"""Tests for employer job-posting plan quota enforcement.

Mirrors test_candidate_billing_service.py's structure. Unlike the candidate
side, this has no feature flag: the limits enforced here (free: 1 active
job, starter: 5, business: unlimited) are already advertised on the pricing
page and already sold, so enforcement is always-on — see the module
docstring in company_billing_service.py.
"""
import uuid
from datetime import datetime, timedelta

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.base import Base
from app.models import Company, Job, Plan, Subscription
from app.services.company_billing_service import (
    assert_job_quota,
    get_company_plan_code,
    get_job_plan_limit,
)


@pytest.fixture()
def db():
    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()


def _make_company(db) -> Company:
    company = Company(owner_user_id=str(uuid.uuid4()), name="Acme Lda")
    db.add(company)
    db.commit()
    return company


def _make_plan(db, code: str, max_active_jobs: int, interval: str = "month") -> Plan:
    plan = Plan(code=code, name=code, price=0, interval=interval, max_active_jobs=max_active_jobs)
    db.add(plan)
    db.commit()
    return plan


def _make_subscription(db, company_id: str, plan_id: str, status: str = "active",
                        current_period_end=None) -> Subscription:
    if current_period_end is None:
        current_period_end = datetime.utcnow() + timedelta(days=30)
    sub = Subscription(company_id=company_id, plan_id=plan_id, status=status,
                        current_period_end=current_period_end)
    db.add(sub)
    db.commit()
    return sub


def _make_job(db, company_id: str, status: str = "approved") -> Job:
    job = Job(company_id=company_id, title="Vaga", status=status)
    db.add(job)
    db.commit()
    return job


# ── get_company_plan_code ────────────────────────────────────────────────

def test_get_company_plan_code_defaults_to_free_with_no_subscription(db):
    company = _make_company(db)
    assert get_company_plan_code(db, company.id) == "free"


def test_get_company_plan_code_returns_active_paid_plan(db):
    company = _make_company(db)
    plan = _make_plan(db, "business", -1)
    _make_subscription(db, company.id, plan.id)
    assert get_company_plan_code(db, company.id) == "business"


def test_get_company_plan_code_falls_back_to_free_when_expired(db):
    company = _make_company(db)
    plan = _make_plan(db, "starter", 5)
    _make_subscription(db, company.id, plan.id, current_period_end=datetime.utcnow() - timedelta(days=1))
    assert get_company_plan_code(db, company.id) == "free"


def test_get_company_plan_code_ignores_featured_post_addon(db):
    """A featured_post add-on purchase lands as a Subscription row too, but
    must never shadow the company's real recurring plan — even when it's
    the most recently created subscription."""
    company = _make_company(db)
    starter = _make_plan(db, "starter", 5)
    featured = _make_plan(db, "featured_post", -1, interval="one_time")
    _make_subscription(db, company.id, starter.id, current_period_end=datetime.utcnow() + timedelta(days=20))
    _make_subscription(db, company.id, featured.id, current_period_end=datetime.utcnow() + timedelta(days=30))
    assert get_company_plan_code(db, company.id) == "starter"


# ── get_job_plan_limit ───────────────────────────────────────────────────

def test_get_job_plan_limit_reads_plan_row(db):
    _make_plan(db, "starter", 5)
    assert get_job_plan_limit(db, "starter") == 5


def test_get_job_plan_limit_seeds_defaults_when_missing(db):
    """Should never happen outside a fresh/test DB — falls back to seeding
    the default catalogue rather than raising."""
    assert get_job_plan_limit(db, "free") == 1


# ── assert_job_quota ──────────────────────────────────────────────────────

def test_job_quota_blocks_free_plan_at_cap(db):
    company = _make_company(db)
    _make_plan(db, "free", 1)
    _make_job(db, company.id, status="approved")
    with pytest.raises(HTTPException) as exc_info:
        assert_job_quota(db, company)
    assert exc_info.value.status_code == 402


def test_job_quota_allows_below_cap(db):
    company = _make_company(db)
    plan = _make_plan(db, "starter", 5)
    _make_subscription(db, company.id, plan.id)
    for _ in range(3):
        _make_job(db, company.id, status="approved")
    assert_job_quota(db, company)  # 3 of 5 — must not raise


def test_job_quota_unlimited_for_business_plan(db):
    company = _make_company(db)
    plan = _make_plan(db, "business", -1)
    _make_subscription(db, company.id, plan.id)
    for _ in range(50):
        _make_job(db, company.id, status="approved")
    assert_job_quota(db, company)  # must not raise — unlimited


def test_job_quota_excludes_archived_and_pending_jobs(db):
    company = _make_company(db)
    _make_plan(db, "free", 1)
    _make_job(db, company.id, status="archived")
    _make_job(db, company.id, status="pending_platform_review")
    _make_job(db, company.id, status="rejected")
    assert_job_quota(db, company)  # none of these count — must not raise


def test_job_quota_falls_back_to_free_cap_when_subscription_expired(db):
    """The end-to-end version of the expired-subscription-falls-back-to-free
    scenario: a lapsed paid plan actually loses posting capacity, not just a
    cosmetic status flag."""
    company = _make_company(db)
    _make_plan(db, "free", 1)
    starter = _make_plan(db, "starter", 5)
    _make_subscription(db, company.id, starter.id, current_period_end=datetime.utcnow() - timedelta(days=1))
    _make_job(db, company.id, status="approved")
    with pytest.raises(HTTPException) as exc_info:
        assert_job_quota(db, company)
    assert exc_info.value.status_code == 402


def test_job_quota_locks_the_company_row(db, monkeypatch):
    """TOCTOU guard: verifies assert_job_quota requests a row lock on the
    company before counting — same technique as
    test_resume_quota_locks_the_candidate_profile_row."""
    from sqlalchemy.orm import Query

    company = _make_company(db)
    _make_plan(db, "free", 1)

    locked_entities = []
    original = Query.with_for_update

    def spy(self, *a, **k):
        desc = self.column_descriptions
        if desc:
            locked_entities.append(desc[0].get("name") or desc[0].get("entity"))
        return original(self, *a, **k)

    monkeypatch.setattr(Query, "with_for_update", spy)

    assert_job_quota(db, company)  # 0 of 1 (free) — must not raise

    assert any(
        entity is Company or entity == "Company" for entity in locked_entities
    ), f"assert_job_quota never locked Company (locked: {locked_entities})"
