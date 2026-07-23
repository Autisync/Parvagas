"""Tests for overnight-audit W5.4 — the API-key-authenticated applications
feed. Read-only, scoped strictly to the calling company's own
applications; a plan downgrade blocks even a previously-valid key
immediately (checked on every request, not just at key creation).
"""
import asyncio
import uuid
from datetime import datetime, timedelta

import pytest
from fastapi import HTTPException

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.base import Base
from app.models import Company, JobApplication, Plan, Subscription, User, UserRole
from app.api.v1.company_api import create_api_key, list_applications_via_api_key
from app.core.api_key_auth import get_company_from_api_key


class _FakeRequest:
    def __init__(self, headers=None):
        self.headers = headers or {}
        self.state = type("State", (), {})()


@pytest.fixture()
def db():
    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()


def _make_owner_and_company(db, *, name="Acme"):
    owner = User(id=str(uuid.uuid4()), email=f"owner-{uuid.uuid4()}@x.com", full_name="Owner", password_hash="x", role=UserRole.company)
    db.add(owner)
    db.flush()
    company = Company(owner_user_id=owner.id, name=name, status="active")
    db.add(company)
    db.commit()
    return owner, company


def _give_business_plan(db, company):
    plan = Plan(code="business", name="Business", price=75000, interval="month", max_active_jobs=-1, api_access_included=True)
    db.add(plan)
    db.flush()
    sub = Subscription(company_id=company.id, plan_id=plan.id, status="active", current_period_end=datetime.utcnow() + timedelta(days=30))
    db.add(sub)
    db.commit()
    return sub


def _make_application(db, company, *, job_id=None, status_val="submitted", created_at=None):
    app = JobApplication(
        id=str(uuid.uuid4()), job_id=job_id or str(uuid.uuid4()), company_id=company.id,
        applicant_full_name="Ana Silva", applicant_email="ana@x.com", applicant_phone="+244911111111",
        status=status_val,
    )
    db.add(app)
    db.commit()
    if created_at:
        app.created_at = created_at
        db.commit()
    return app


def _raw_key_for(db, owner):
    result = asyncio.run(create_api_key({"label": "Integration"}, db=db, current_user=owner))
    return result["rawKey"]


def test_valid_key_returns_only_own_company_applications(db):
    owner, company = _make_owner_and_company(db)
    _give_business_plan(db, company)
    _other_owner, other_company = _make_owner_and_company(db, name="Other")
    _make_application(db, company)
    _make_application(db, other_company)
    raw_key = _raw_key_for(db, owner)

    resolved = get_company_from_api_key(_FakeRequest({"X-API-Key": raw_key}), db=db)
    result = asyncio.run(list_applications_via_api_key(
        request=_FakeRequest(), page=1, limit=20, jobId=None, status_filter=None, since=None, db=db, company=resolved,
    ))
    assert result["total"] == 1
    assert result["applications"][0]["profileSnapshot"]["email"] == "ana@x.com"
    assert result["applications"][0]["profileSnapshot"]["phone"] == "+244911111111"


def test_missing_key_401s(db):
    with pytest.raises(HTTPException) as exc:
        get_company_from_api_key(_FakeRequest(), db=db)
    assert exc.value.status_code == 401


def test_invalid_key_401s(db):
    with pytest.raises(HTTPException) as exc:
        get_company_from_api_key(_FakeRequest({"X-API-Key": "pgv_not-a-real-key"}), db=db)
    assert exc.value.status_code == 401


def test_revoked_key_401s(db):
    from app.api.v1.company_api import create_api_key, revoke_api_key

    owner, company = _make_owner_and_company(db)
    _give_business_plan(db, company)
    created = asyncio.run(create_api_key({}, db=db, current_user=owner))
    asyncio.run(revoke_api_key(created["apiKey"]["_id"], db=db, current_user=owner))

    with pytest.raises(HTTPException) as exc:
        get_company_from_api_key(_FakeRequest({"X-API-Key": created["rawKey"]}), db=db)
    assert exc.value.status_code == 401


def test_downgraded_plan_blocks_previously_valid_key(db):
    owner, company = _make_owner_and_company(db)
    sub = _give_business_plan(db, company)
    raw_key = _raw_key_for(db, owner)

    # Simulate a downgrade — the subscription lapses (not renewed).
    sub.status = "canceled"
    db.commit()

    with pytest.raises(HTTPException) as exc:
        get_company_from_api_key(_FakeRequest({"X-API-Key": raw_key}), db=db)
    assert exc.value.status_code == 402


def test_filters_by_job_id_status_and_since(db):
    owner, company = _make_owner_and_company(db)
    _give_business_plan(db, company)
    job_id = str(uuid.uuid4())
    _make_application(db, company, job_id=job_id, status_val="submitted")
    _make_application(db, company, job_id=str(uuid.uuid4()), status_val="rejected")
    old_app = _make_application(db, company, created_at=datetime.utcnow() - timedelta(days=10))
    raw_key = _raw_key_for(db, owner)
    resolved = get_company_from_api_key(_FakeRequest({"X-API-Key": raw_key}), db=db)

    by_job = asyncio.run(list_applications_via_api_key(
        request=_FakeRequest(), page=1, limit=20, jobId=job_id, status_filter=None, since=None, db=db, company=resolved,
    ))
    assert by_job["total"] == 1

    by_status = asyncio.run(list_applications_via_api_key(
        request=_FakeRequest(), page=1, limit=20, jobId=None, status_filter="rejected", since=None, db=db, company=resolved,
    ))
    assert by_status["total"] == 1

    since_cutoff = (datetime.utcnow() - timedelta(days=1)).isoformat()
    recent = asyncio.run(list_applications_via_api_key(
        request=_FakeRequest(), page=1, limit=20, jobId=None, status_filter=None, since=since_cutoff, db=db, company=resolved,
    ))
    recent_ids = {a["_id"] for a in recent["applications"]}
    assert old_app.id not in recent_ids


def test_last_used_at_updates_on_success(db):
    owner, company = _make_owner_and_company(db)
    _give_business_plan(db, company)
    raw_key = _raw_key_for(db, owner)

    from app.models import ApiKey
    from app.core.api_key_auth import hash_api_key
    key_row = db.query(ApiKey).filter(ApiKey.key_hash == hash_api_key(raw_key)).first()
    assert key_row.last_used_at is None

    get_company_from_api_key(_FakeRequest({"X-API-Key": raw_key}), db=db)
    db.refresh(key_row)
    assert key_row.last_used_at is not None
