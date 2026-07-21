"""Tests for self-service subscription cancellation — Wave P2,
EXECUTION_PLAN_LEGAL_AND_PAYMENTS.md. reembolsos.md Section 3 promises
cancellation "a qualquer momento nas Definições de conta" that keeps
access until the current period ends and grants no refund for the
period in progress — these endpoints are what make that real.
"""
import asyncio
import uuid
from datetime import datetime, timedelta

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.base import Base
from app.models import (
    CandidateCVSubscription, CandidateProfile, Company, Plan, Subscription, User, UserRole,
)
from app.api.v1.payments import (
    cancel_cv_builder_subscription,
    cancel_subscription,
    my_cv_builder_subscription,
    my_subscription,
    resume_cv_builder_subscription,
    resume_subscription,
)


@pytest.fixture()
def db():
    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()


def _make_company_user(db):
    user = User(id=str(uuid.uuid4()), email=f"co-{uuid.uuid4()}@x.com", full_name="Owner", password_hash="x", role=UserRole.company)
    db.add(user)
    db.flush()
    company = Company(owner_user_id=user.id, name="Acme", status="active")
    db.add(company)
    db.flush()
    plan = Plan(code="business", name="Business", price=75000, currency="AOA", interval="month", features="[]", active=True)
    db.add(plan)
    db.flush()
    sub = Subscription(company_id=company.id, plan_id=plan.id, status="active", current_period_end=datetime.utcnow() + timedelta(days=20))
    db.add(sub)
    db.commit()
    return user, company, sub


def _make_candidate_with_paid_sub(db, tier="pro"):
    user = User(id=str(uuid.uuid4()), email=f"cand-{uuid.uuid4()}@x.com", full_name="Cand", password_hash="x", role=UserRole.candidate)
    db.add(user)
    db.flush()
    profile = CandidateProfile(user_id=user.id)
    db.add(profile)
    db.flush()
    sub = CandidateCVSubscription(candidate_profile_id=profile.id, plan_tier=tier, status="active", current_period_end=datetime.utcnow() + timedelta(days=20))
    db.add(sub)
    db.commit()
    return user, profile, sub


# ── Company subscription ────────────────────────────────────────────────────

def test_cancel_sets_cancel_requested_at_and_keeps_status_active(db):
    user, _, sub = _make_company_user(db)
    result = asyncio.run(cancel_subscription(db=db, current_user=user))
    assert result["subscription"]["cancelRequestedAt"] is not None
    db.refresh(sub)
    assert sub.status == "active"
    assert sub.cancel_requested_at is not None


def test_cancel_is_idempotent(db):
    user, _, sub = _make_company_user(db)
    first = asyncio.run(cancel_subscription(db=db, current_user=user))
    second = asyncio.run(cancel_subscription(db=db, current_user=user))
    assert first["subscription"]["cancelRequestedAt"] == second["subscription"]["cancelRequestedAt"]


def test_cancel_404s_with_no_active_subscription(db):
    user = User(id=str(uuid.uuid4()), email="nosub@x.com", full_name="X", password_hash="x", role=UserRole.company)
    db.add(user)
    db.flush()
    db.add(Company(owner_user_id=user.id, name="NoSub", status="active"))
    db.commit()
    with pytest.raises(HTTPException) as exc:
        asyncio.run(cancel_subscription(db=db, current_user=user))
    assert exc.value.status_code == 404


def test_resume_clears_cancel_requested_at(db):
    user, _, sub = _make_company_user(db)
    asyncio.run(cancel_subscription(db=db, current_user=user))
    result = asyncio.run(resume_subscription(db=db, current_user=user))
    assert result["subscription"]["cancelRequestedAt"] is None
    db.refresh(sub)
    assert sub.cancel_requested_at is None
    assert sub.status == "active"


def test_my_subscription_reflects_cancel_state(db):
    user, _, _ = _make_company_user(db)
    asyncio.run(cancel_subscription(db=db, current_user=user))
    result = asyncio.run(my_subscription(db=db, current_user=user))
    assert result["subscription"]["cancelRequestedAt"] is not None


# ── Candidate CV Builder subscription ───────────────────────────────────────

def test_cancel_cv_builder_sets_flag(db):
    user, _, sub = _make_candidate_with_paid_sub(db)
    result = asyncio.run(cancel_cv_builder_subscription(db=db, current_user=user))
    assert result["subscription"]["cancelRequestedAt"] is not None
    db.refresh(sub)
    assert sub.status == "active"


def test_cancel_cv_builder_rejects_free_tier(db):
    user, profile, sub = _make_candidate_with_paid_sub(db)
    sub.plan_tier = "free"
    db.commit()
    with pytest.raises(HTTPException) as exc:
        asyncio.run(cancel_cv_builder_subscription(db=db, current_user=user))
    assert exc.value.status_code == 404


def test_resume_cv_builder_clears_flag(db):
    user, _, sub = _make_candidate_with_paid_sub(db)
    asyncio.run(cancel_cv_builder_subscription(db=db, current_user=user))
    result = asyncio.run(resume_cv_builder_subscription(db=db, current_user=user))
    assert result["subscription"]["cancelRequestedAt"] is None
    db.refresh(sub)
    assert sub.cancel_requested_at is None


def test_cv_builder_subscription_view_reflects_cancel_state(db):
    user, _, _ = _make_candidate_with_paid_sub(db)
    asyncio.run(cancel_cv_builder_subscription(db=db, current_user=user))
    result = asyncio.run(my_cv_builder_subscription(db=db, current_user=user))
    assert result["subscription"]["cancelRequestedAt"] is not None
