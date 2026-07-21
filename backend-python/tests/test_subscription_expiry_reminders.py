"""Tests for dispatch_subscription_expiry_reminders' Wave P4 extension —
skips cancel_requested_at subscriptions and now also covers candidate CV
Builder plans, not just company plans. Runs against the app's real
SessionLocal (bound to an in-memory SQLite DB per conftest's DATABASE_URL),
same pattern as test_publish_scheduled_sweep.py.
"""
import uuid
from datetime import datetime, timedelta

from app.db.base import Base
from app.db.session import engine, SessionLocal
from app.models import CandidateCVSubscription, CandidateProfile, Company, Plan, Subscription, User, UserRole
from app.workers.tasks import dispatch_subscription_expiry_reminders

Base.metadata.create_all(engine)


def _make_company_sub(db, *, cancel_requested_at=None):
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
        company_id=company.id, plan_id=plan.id, status="active",
        current_period_end=datetime.utcnow() + timedelta(days=1),
        cancel_requested_at=cancel_requested_at,
    )
    db.add(sub)
    db.commit()
    return sub


def _make_candidate_sub(db, *, cancel_requested_at=None):
    user = User(id=str(uuid.uuid4()), email=f"cand-{uuid.uuid4()}@x.com", full_name="Cand", password_hash="x", role=UserRole.candidate)
    db.add(user)
    db.flush()
    profile = CandidateProfile(user_id=user.id)
    db.add(profile)
    db.flush()
    sub = CandidateCVSubscription(
        candidate_profile_id=profile.id, plan_tier="pro", status="active",
        current_period_end=datetime.utcnow() + timedelta(days=1),
        cancel_requested_at=cancel_requested_at,
    )
    db.add(sub)
    db.commit()
    return sub


def test_reminds_a_normal_company_and_candidate_subscription(monkeypatch):
    """Shared in-memory DB across this module (same pattern as
    test_publish_scheduled_sweep.py) — assert on the emails sent for THIS
    test's specific addresses rather than a global aggregate count, since
    other tests in this file leave their own rows behind."""
    sent_emails = []
    monkeypatch.setattr(
        "app.workers.tasks.EmailService.send_subscription_expiring_email",
        lambda email, *a, **k: sent_emails.append(email) or True,
    )
    db = SessionLocal()
    try:
        company_sub = _make_company_sub(db)
        candidate_sub = _make_candidate_sub(db)
        dispatch_subscription_expiry_reminders()

        db.refresh(company_sub)
        owner = db.query(User).join(Company, Company.owner_user_id == User.id).filter(Company.id == company_sub.company_id).first()
        candidate_user = (
            db.query(User)
            .join(CandidateProfile, CandidateProfile.user_id == User.id)
            .filter(CandidateProfile.id == candidate_sub.candidate_profile_id)
            .first()
        )
        assert owner.email in sent_emails
        assert candidate_user.email in sent_emails
    finally:
        db.close()


def test_skips_subscriptions_with_cancel_requested(monkeypatch):
    sent_emails = []
    monkeypatch.setattr(
        "app.workers.tasks.EmailService.send_subscription_expiring_email",
        lambda email, *a, **k: sent_emails.append(email) or True,
    )
    db = SessionLocal()
    try:
        company_sub = _make_company_sub(db, cancel_requested_at=datetime.utcnow())
        candidate_sub = _make_candidate_sub(db, cancel_requested_at=datetime.utcnow())
        dispatch_subscription_expiry_reminders()

        owner = db.query(User).join(Company, Company.owner_user_id == User.id).filter(Company.id == company_sub.company_id).first()
        candidate_user = (
            db.query(User)
            .join(CandidateProfile, CandidateProfile.user_id == User.id)
            .filter(CandidateProfile.id == candidate_sub.candidate_profile_id)
            .first()
        )
        assert owner.email not in sent_emails
        assert candidate_user.email not in sent_emails
    finally:
        db.close()
