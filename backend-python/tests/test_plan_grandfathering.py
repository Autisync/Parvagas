"""The core regression this feature exists to prevent: before this
shipped, every entitlement gate (assert_job_quota,
assert_candidate_search_access, assert_api_access) re-resolved a
company's plan against the LIVE Plan row on every request, so an admin
editing a plan's limits instantly changed what every current subscriber
could do — including ones already paying under the old terms. Now a
subscription pins to a specific PlanVersion at activation
(payments.py's _activate()) and keeps it until the company pays again.
"""
import asyncio
import uuid
from datetime import datetime, timedelta

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.base import Base
from app.models import Company, Plan, Subscription, Transaction, User, UserRole
from app.services import plan_service
from app.services.company_billing_service import assert_job_quota, get_active_plan_version
from app.api.v1.payments import _activate


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


def _make_business_plan(db):
    plan = Plan(code="business", name="Business", price=75000, currency="AOA", interval="month", max_active_jobs=1)
    db.add(plan)
    db.commit()
    v1 = plan_service.create_draft_version(
        db, plan_id=plan.id, name="Business", price=75000, currency="AOA", interval="month",
        max_active_jobs=1, candidate_search_included=False, api_access_included=False,
    )
    plan_service.publish_plan_version(db, v1)
    return plan


def _subscribe_and_activate(db, company, plan):
    tx = Transaction(
        id=str(uuid.uuid4()), company_id=company.id, plan_id=plan.id, amount=plan.price,
        currency=plan.currency, provider="manual", reference=f"PV-{uuid.uuid4().hex[:8]}",
        status="pending", kind="subscription",
    )
    db.add(tx)
    sub = Subscription(company_id=company.id, plan_id=plan.id, status="pending")
    db.add(sub)
    db.commit()
    db.refresh(tx)
    _activate(db, tx)
    return sub


def test_existing_subscriber_keeps_old_terms_after_plan_tightens(db):
    owner, company = _make_owner_and_company(db)
    plan = _make_business_plan(db)
    # v1 published with max_active_jobs=1 above — bump to unlimited before
    # this company subscribes, so "grandfathered" means something real.
    v1 = plan_service.get_current_version(db, plan.id)
    v1.max_active_jobs = -1
    db.commit()

    sub = _subscribe_and_activate(db, company, plan)
    assert sub.plan_version_id == v1.id

    # Admin tightens the plan after this company already subscribed.
    v2 = plan_service.create_draft_version(db, plan_id=plan.id, max_active_jobs=1)
    plan_service.publish_plan_version(db, v2)

    # Grandfathered — still resolves against v1 (unlimited).
    version = get_active_plan_version(db, company.id)
    assert version.id == v1.id
    assert version.max_active_jobs == -1
    assert_job_quota(db, company)  # must not raise, even with jobs at any count


def test_new_subscriber_gets_the_new_terms(db):
    plan = _make_business_plan(db)
    v1 = plan_service.get_current_version(db, plan.id)
    v1.max_active_jobs = -1
    db.commit()

    v2 = plan_service.create_draft_version(db, plan_id=plan.id, max_active_jobs=3)
    plan_service.publish_plan_version(db, v2)

    _new_owner, new_company = _make_owner_and_company(db)
    sub = _subscribe_and_activate(db, new_company, plan)
    assert sub.plan_version_id == v2.id

    version = get_active_plan_version(db, new_company.id)
    assert version.max_active_jobs == 3


def test_renewal_repins_to_current_published_version(db):
    owner, company = _make_owner_and_company(db)
    plan = _make_business_plan(db)
    v1 = plan_service.get_current_version(db, plan.id)
    v1.max_active_jobs = -1
    db.commit()

    sub = _subscribe_and_activate(db, company, plan)
    assert sub.plan_version_id == v1.id

    v2 = plan_service.create_draft_version(db, plan_id=plan.id, max_active_jobs=1)
    plan_service.publish_plan_version(db, v2)

    # Simulate the subscription lapsing then the company renewing (paying
    # again) — the only "renewal" event this platform has.
    sub.status = "expired"
    db.commit()
    _subscribe_and_activate(db, company, plan)

    version = get_active_plan_version(db, company.id)
    assert version.id == v2.id
    assert version.max_active_jobs == 1
