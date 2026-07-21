"""Tests for the renewal-lifecycle grace period / expiry logic — Wave P4,
EXECUTION_PLAN_LEGAL_AND_PAYMENTS.md.
"""
import uuid
from datetime import datetime, timedelta

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.base import Base
from app.models import CandidateCVSubscription, CandidateProfile, Company, Plan, Subscription, User, UserRole
from app.services.subscription_lifecycle_service import GRACE_PERIOD_DAYS, process_lapsed_subscriptions
from app.workers.tasks import dispatch_subscription_expiry_reminders


@pytest.fixture()
def db(monkeypatch):
    monkeypatch.setattr("app.workers.tasks.send_templated_email.delay", lambda *a, **k: None)
    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()


def _make_company_sub(db, *, period_end, cancel_requested_at=None, grace_notified_at=None):
    owner = User(id=str(uuid.uuid4()), email=f"owner-{uuid.uuid4()}@x.com", full_name="Owner", password_hash="x", role=UserRole.company)
    db.add(owner)
    db.flush()
    company = Company(owner_user_id=owner.id, name="Acme", status="active")
    db.add(company)
    db.flush()
    plan = Plan(code=f"p-{uuid.uuid4()}", name="Business", price=75000, currency="AOA", interval="month", features="[]", active=True)
    db.add(plan)
    db.flush()
    sub = Subscription(
        company_id=company.id, plan_id=plan.id, status="active", current_period_end=period_end,
        cancel_requested_at=cancel_requested_at, grace_notified_at=grace_notified_at,
    )
    db.add(sub)
    db.commit()
    return sub


def _make_candidate_sub(db, *, period_end, tier="pro", cancel_requested_at=None, grace_notified_at=None):
    user = User(id=str(uuid.uuid4()), email=f"cand-{uuid.uuid4()}@x.com", full_name="Cand", password_hash="x", role=UserRole.candidate)
    db.add(user)
    db.flush()
    profile = CandidateProfile(user_id=user.id)
    db.add(profile)
    db.flush()
    sub = CandidateCVSubscription(
        candidate_profile_id=profile.id, plan_tier=tier, status="active", current_period_end=period_end,
        cancel_requested_at=cancel_requested_at, grace_notified_at=grace_notified_at,
    )
    db.add(sub)
    db.commit()
    return sub


# ── company subscriptions ───────────────────────────────────────────────────

def test_company_sub_untouched_before_period_end(db):
    sub = _make_company_sub(db, period_end=datetime.utcnow() + timedelta(days=1))
    process_lapsed_subscriptions(db)
    db.refresh(sub)
    assert sub.status == "active"
    assert sub.grace_notified_at is None


def test_company_sub_enters_grace_the_day_it_lapses(db):
    sub = _make_company_sub(db, period_end=datetime.utcnow() - timedelta(hours=2))
    process_lapsed_subscriptions(db)
    db.refresh(sub)
    assert sub.status == "active"
    assert sub.grace_notified_at is not None


def test_company_sub_grace_notification_is_sent_only_once(db):
    already_notified = datetime.utcnow() - timedelta(days=1)
    sub = _make_company_sub(db, period_end=datetime.utcnow() - timedelta(days=1), grace_notified_at=already_notified)
    process_lapsed_subscriptions(db)
    db.refresh(sub)
    assert sub.grace_notified_at == already_notified


def test_company_sub_expires_after_grace_period(db):
    sub = _make_company_sub(db, period_end=datetime.utcnow() - timedelta(days=GRACE_PERIOD_DAYS + 1))
    process_lapsed_subscriptions(db)
    db.refresh(sub)
    assert sub.status == "expired"


def test_company_sub_with_cancel_requested_skips_grace_and_finalizes_as_cancelled(db):
    sub = _make_company_sub(
        db, period_end=datetime.utcnow() - timedelta(hours=1),
        cancel_requested_at=datetime.utcnow() - timedelta(days=10),
    )
    process_lapsed_subscriptions(db)
    db.refresh(sub)
    assert sub.status == "cancelled"
    assert sub.grace_notified_at is None  # never nagged — they already asked to leave


# ── candidate CV Builder subscriptions ──────────────────────────────────────

def test_candidate_sub_enters_grace_then_expires(db):
    sub = _make_candidate_sub(db, period_end=datetime.utcnow() - timedelta(hours=1))
    process_lapsed_subscriptions(db)
    db.refresh(sub)
    assert sub.status == "active"
    assert sub.grace_notified_at is not None

    sub.current_period_end = datetime.utcnow() - timedelta(days=GRACE_PERIOD_DAYS + 1)
    sub.grace_notified_at = datetime.utcnow() - timedelta(days=GRACE_PERIOD_DAYS)
    db.commit()
    process_lapsed_subscriptions(db)
    db.refresh(sub)
    assert sub.status == "expired"


def test_candidate_free_tier_never_processed(db):
    sub = _make_candidate_sub(db, period_end=datetime.utcnow() - timedelta(days=GRACE_PERIOD_DAYS + 5), tier="free")
    process_lapsed_subscriptions(db)
    db.refresh(sub)
    assert sub.status == "active"
    assert sub.grace_notified_at is None


def test_candidate_sub_with_cancel_requested_finalizes_as_cancelled(db):
    sub = _make_candidate_sub(
        db, period_end=datetime.utcnow() - timedelta(hours=1),
        cancel_requested_at=datetime.utcnow() - timedelta(days=5),
    )
    process_lapsed_subscriptions(db)
    db.refresh(sub)
    assert sub.status == "cancelled"


def test_process_lapsed_subscriptions_returns_stats(db):
    _make_company_sub(db, period_end=datetime.utcnow() - timedelta(days=GRACE_PERIOD_DAYS + 1))
    _make_candidate_sub(db, period_end=datetime.utcnow() - timedelta(hours=1))
    result = process_lapsed_subscriptions(db)
    assert result["company"]["expired"] == 1
    assert result["candidate"]["grace_notified"] == 1
