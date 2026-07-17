"""Tests for the admin Subscriptions & Plans surface:

- Company `Plan` CRUD (the table existed but had zero admin management
  before this change — everything past the initial env-seeded catalogue
  required a direct DB write).
- Candidate `CandidateCvPlan` CRUD (edit-only — replaces the old hardcoded
  CV_BUILDER_PLANS constant in candidate_billing_service.py; tiers
  themselves are fixed identity, not admin-creatable/deletable).
- `/admin/transactions` listing with company/candidate resolution — no
  endpoint exposed pending payments at all before this change.
- Per-user subscription view/override under the Users tab
  (`/admin/users/{id}/subscription`).
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
    CandidateCVSubscription, CandidateCvPlan, CandidateProfile, Company,
    Plan, Subscription, Transaction, User, UserRole,
)
from app.api.v1.admin import (
    admin_create_plan,
    admin_delete_plan,
    admin_get_user_subscription,
    admin_list_candidate_cv_plans,
    admin_list_plans,
    admin_list_transactions,
    admin_update_candidate_cv_plan,
    admin_update_plan,
    admin_update_user_subscription,
)


@pytest.fixture()
def db():
    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()


def _make_admin(db):
    user = User(id=str(uuid.uuid4()), email=f"admin-{uuid.uuid4()}@parvagas.pt", full_name="Admin", password_hash="x", role=UserRole.admin)
    db.add(user)
    db.commit()
    return user


def _make_company_user(db, **over):
    user = User(id=str(uuid.uuid4()), email=f"co-{uuid.uuid4()}@x.com", full_name="Empresa Teste", password_hash="x", role=UserRole.company)
    db.add(user)
    db.flush()
    company = Company(owner_user_id=user.id, name="Acme", **over)
    db.add(company)
    db.commit()
    return user, company


def _make_candidate_user(db):
    user = User(id=str(uuid.uuid4()), email=f"cand-{uuid.uuid4()}@x.com", full_name="Candidato Teste", password_hash="x", role=UserRole.candidate)
    db.add(user)
    db.flush()
    profile = CandidateProfile(user_id=user.id)
    db.add(profile)
    db.commit()
    return user, profile


def _make_cv_plan(db, tier="free", **over):
    base = dict(tier=tier, name=tier.title(), price=0, max_resumes=1)
    base.update(over)
    row = CandidateCvPlan(**base)
    db.add(row)
    db.commit()
    return row


# ── Company Plan CRUD ──────────────────────────────────────────────────────

def test_list_plans_seeds_defaults(db):
    admin = _make_admin(db)
    result = asyncio.run(admin_list_plans(db=db, current_user=admin))
    codes = {p["code"] for p in result["plans"]}
    assert {"free", "starter", "business", "featured_post"}.issubset(codes)


def test_create_plan(db):
    admin = _make_admin(db)
    result = asyncio.run(admin_create_plan(
        {"code": "enterprise", "name": "Enterprise", "price": 150000, "interval": "month", "features": ["Tudo"]},
        db=db, current_user=admin,
    ))
    assert result["code"] == "enterprise"
    assert result["price"] == 150000
    assert result["active"] is True


def test_create_plan_rejects_duplicate_code(db):
    admin = _make_admin(db)
    asyncio.run(admin_create_plan({"code": "x", "name": "X", "price": 0}, db=db, current_user=admin))
    with pytest.raises(HTTPException):
        asyncio.run(admin_create_plan({"code": "x", "name": "X2", "price": 0}, db=db, current_user=admin))


def test_create_plan_rejects_bad_interval(db):
    admin = _make_admin(db)
    with pytest.raises(HTTPException):
        asyncio.run(admin_create_plan({"code": "y", "name": "Y", "interval": "yearly"}, db=db, current_user=admin))


def test_update_plan_price(db):
    admin = _make_admin(db)
    created = asyncio.run(admin_create_plan({"code": "z", "name": "Z", "price": 100}, db=db, current_user=admin))
    updated = asyncio.run(admin_update_plan(created["_id"], {"price": 200}, db=db, current_user=admin))
    assert updated["price"] == 200


def test_delete_plan_blocked_when_referenced_by_subscription(db):
    admin = _make_admin(db)
    plan = Plan(code="ref", name="Ref", price=0, active=True)
    db.add(plan)
    db.flush()
    _, company = _make_company_user(db)
    db.add(Subscription(company_id=company.id, plan_id=plan.id, status="active"))
    db.commit()

    with pytest.raises(HTTPException) as exc:
        asyncio.run(admin_delete_plan(plan.id, db=db, current_user=admin))
    assert exc.value.status_code == 400
    assert db.query(Plan).filter(Plan.id == plan.id).first() is not None


def test_delete_plan_allowed_when_unreferenced(db):
    admin = _make_admin(db)
    created = asyncio.run(admin_create_plan({"code": "free-to-delete", "name": "Del"}, db=db, current_user=admin))
    asyncio.run(admin_delete_plan(created["_id"], db=db, current_user=admin))
    assert db.query(Plan).filter(Plan.id == created["_id"]).first() is None


# ── Candidate CV Plan (edit-only) ──────────────────────────────────────────

def test_list_candidate_cv_plans(db):
    admin = _make_admin(db)
    _make_cv_plan(db, tier="free", price=0)
    _make_cv_plan(db, tier="pro", price=15000)
    result = asyncio.run(admin_list_candidate_cv_plans(db=db, current_user=admin))
    tiers = [p["tier"] for p in result["candidateCvPlans"]]
    assert tiers == ["free", "pro"]  # ordered by price ascending


def test_update_candidate_cv_plan_price_and_limits(db):
    admin = _make_admin(db)
    row = _make_cv_plan(db, tier="pro", price=15000, max_resumes=3, cover_letters=True)
    updated = asyncio.run(admin_update_candidate_cv_plan(
        row.id, {"price": 18000, "maxResumes": 5, "autoApply": True}, db=db, current_user=admin,
    ))
    assert updated["price"] == 18000
    assert updated["maxResumes"] == 5
    assert updated["autoApply"] is True
    assert updated["coverLetters"] is True  # untouched field preserved


def test_update_candidate_cv_plan_not_found(db):
    admin = _make_admin(db)
    with pytest.raises(HTTPException) as exc:
        asyncio.run(admin_update_candidate_cv_plan("does-not-exist", {"price": 1}, db=db, current_user=admin))
    assert exc.value.status_code == 404


# ── Transactions listing ───────────────────────────────────────────────────

def test_list_transactions_resolves_company_name(db):
    admin = _make_admin(db)
    _, company = _make_company_user(db)
    db.add(Transaction(company_id=company.id, amount=25000, reference="PV-ABC123", status="pending", kind="subscription"))
    db.commit()

    result = asyncio.run(admin_list_transactions(page=1, limit=20, status_filter=None, kind=None, keyword=None, db=db, current_user=admin))
    assert result["pagination"]["total"] == 1
    row = result["transactions"][0]
    assert row["partyType"] == "company"
    assert row["partyName"] == "Acme"


def test_list_transactions_resolves_candidate_name(db):
    admin = _make_admin(db)
    user, profile = _make_candidate_user(db)
    db.add(CandidateCVSubscription(candidate_profile_id=profile.id, plan_tier="pro", status="pending", transaction_reference="PVCV-XYZ"))
    db.add(Transaction(amount=15000, reference="PVCV-XYZ", status="pending", kind="subscription"))
    db.commit()

    result = asyncio.run(admin_list_transactions(page=1, limit=20, status_filter=None, kind=None, keyword=None, db=db, current_user=admin))
    row = result["transactions"][0]
    assert row["partyType"] == "candidate"
    assert row["partyName"] == "Candidato Teste"


def test_list_transactions_filters_by_status(db):
    admin = _make_admin(db)
    db.add(Transaction(amount=1, reference="A", status="pending", kind="subscription"))
    db.add(Transaction(amount=1, reference="B", status="paid", kind="subscription"))
    db.commit()

    result = asyncio.run(admin_list_transactions(page=1, limit=20, status_filter="paid", db=db, current_user=admin))
    assert result["pagination"]["total"] == 1
    assert result["transactions"][0]["reference"] == "B"


# ── Per-user subscription view/override ────────────────────────────────────

def test_get_user_subscription_company_no_subscription_yet(db):
    admin = _make_admin(db)
    user, _ = _make_company_user(db)
    result = asyncio.run(admin_get_user_subscription(user.id, db=db, current_user=admin))
    assert result["scope"] == "company"
    assert result["subscription"] is None
    assert len(result["availablePlans"]) == 0  # no active Plan rows seeded in this test


def test_get_user_subscription_candidate_defaults(db):
    admin = _make_admin(db)
    user, _ = _make_candidate_user(db)
    result = asyncio.run(admin_get_user_subscription(user.id, db=db, current_user=admin))
    assert result["scope"] == "candidate"
    assert result["subscription"] is None
    assert len(result["availablePlans"]) == 3  # falls back to built-in tier defs


def test_get_user_subscription_admin_role_returns_no_scope(db):
    admin = _make_admin(db)
    other_admin = _make_admin(db)
    result = asyncio.run(admin_get_user_subscription(other_admin.id, db=db, current_user=admin))
    assert result["scope"] is None


def test_override_company_subscription_creates_row(db):
    admin = _make_admin(db)
    user, company = _make_company_user(db)
    plan = Plan(code="starter", name="Starter", price=25000, active=True)
    db.add(plan)
    db.commit()

    result = asyncio.run(admin_update_user_subscription(
        user.id, {"planCode": "starter", "status": "active"}, db=db, current_user=admin,
    ))
    assert result["subscription"]["planCode"] == "starter"
    assert result["subscription"]["status"] == "active"


def test_override_company_subscription_requires_plan_code_when_none_exists(db):
    admin = _make_admin(db)
    user, _ = _make_company_user(db)
    with pytest.raises(HTTPException):
        asyncio.run(admin_update_user_subscription(user.id, {"status": "active"}, db=db, current_user=admin))


def test_override_candidate_subscription_creates_row(db):
    admin = _make_admin(db)
    user, profile = _make_candidate_user(db)
    result = asyncio.run(admin_update_user_subscription(
        user.id, {"tier": "premium", "status": "active"}, db=db, current_user=admin,
    ))
    assert result["subscription"]["tier"] == "premium"
    assert result["subscription"]["status"] == "active"


def test_override_candidate_subscription_rejects_invalid_tier(db):
    admin = _make_admin(db)
    user, _ = _make_candidate_user(db)
    with pytest.raises(HTTPException):
        asyncio.run(admin_update_user_subscription(user.id, {"tier": "ultra"}, db=db, current_user=admin))


def test_override_updates_existing_subscription_status(db):
    admin = _make_admin(db)
    user, profile = _make_candidate_user(db)
    db.add(CandidateCVSubscription(
        candidate_profile_id=profile.id, plan_tier="pro", status="active",
        current_period_end=datetime.utcnow() + timedelta(days=30),
    ))
    db.commit()

    result = asyncio.run(admin_update_user_subscription(user.id, {"status": "cancelled"}, db=db, current_user=admin))
    assert result["subscription"]["status"] == "cancelled"
    assert result["subscription"]["tier"] == "pro"  # untouched


def test_override_rejects_invalid_status(db):
    admin = _make_admin(db)
    user, _ = _make_candidate_user(db)
    with pytest.raises(HTTPException):
        asyncio.run(admin_update_user_subscription(user.id, {"tier": "free", "status": "bogus"}, db=db, current_user=admin))
