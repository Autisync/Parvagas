"""Tests for overnight-audit W5.4 — company API key management
(create/list/revoke). Owner-only; gated behind the Business plan; the raw
key value must only ever appear in the create response.
"""
import asyncio
import uuid

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.base import Base
from app.models import ApiKey, Company, CompanyMember, Plan, Subscription, User, UserRole
from app.api.v1.company_api import create_api_key, list_api_keys, revoke_api_key, _MAX_ACTIVE_KEYS
from datetime import datetime, timedelta


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
    plan = Plan(code="business", name="Business", price=75000, interval="month", max_active_jobs=-1, api_access_included=True)
    db.add(plan)
    db.flush()
    db.add(Subscription(company_id=company.id, plan_id=plan.id, status="active", current_period_end=datetime.utcnow() + timedelta(days=30)))
    db.commit()


def test_owner_can_create_list_revoke_key(db):
    owner, company = _make_owner_and_company(db)
    _give_business_plan(db, company)

    created = asyncio.run(create_api_key({"label": "Zapier"}, db=db, current_user=owner))
    assert created["rawKey"].startswith("pgv_")
    assert created["apiKey"]["keyPrefix"] == created["rawKey"][:12]

    listed = asyncio.run(list_api_keys(db=db, current_user=owner))
    assert len(listed["apiKeys"]) == 1
    assert "rawKey" not in listed["apiKeys"][0]
    assert listed["apiKeys"][0]["label"] == "Zapier"

    revoked = asyncio.run(revoke_api_key(created["apiKey"]["_id"], db=db, current_user=owner))
    assert revoked["apiKey"]["revokedAt"] is not None


def test_recruiter_cannot_create_key(db):
    owner, company = _make_owner_and_company(db)
    _give_business_plan(db, company)
    recruiter = User(id=str(uuid.uuid4()), email="recruiter@x.com", full_name="Recruiter", password_hash="x", role=UserRole.company)
    db.add(recruiter)
    db.flush()
    db.add(CompanyMember(company_id=company.id, user_id=recruiter.id, role="recruiter"))
    db.commit()

    with pytest.raises(HTTPException) as exc:
        asyncio.run(create_api_key({}, db=db, current_user=recruiter))
    assert exc.value.status_code == 403


def test_free_plan_company_gets_402(db):
    owner, company = _make_owner_and_company(db)  # no subscription -> free plan
    with pytest.raises(HTTPException) as exc:
        asyncio.run(create_api_key({}, db=db, current_user=owner))
    assert exc.value.status_code == 402


def test_active_key_cap_enforced(db):
    owner, company = _make_owner_and_company(db)
    _give_business_plan(db, company)
    for _ in range(_MAX_ACTIVE_KEYS):
        asyncio.run(create_api_key({}, db=db, current_user=owner))

    with pytest.raises(HTTPException) as exc:
        asyncio.run(create_api_key({}, db=db, current_user=owner))
    assert exc.value.status_code == 400


def test_revoked_key_does_not_count_toward_cap(db):
    owner, company = _make_owner_and_company(db)
    _give_business_plan(db, company)
    created = [asyncio.run(create_api_key({}, db=db, current_user=owner)) for _ in range(_MAX_ACTIVE_KEYS)]
    asyncio.run(revoke_api_key(created[0]["apiKey"]["_id"], db=db, current_user=owner))

    # Should succeed now that one slot is free.
    result = asyncio.run(create_api_key({}, db=db, current_user=owner))
    assert result["rawKey"].startswith("pgv_")
