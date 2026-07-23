"""Tests for overnight-audit W3.6 — a "viewer" CompanyMember seat used to
have byte-for-byte the same access as "owner"/"recruiter" once W0.1's 404
fix landed (role was checked at invite time and never again). Confirms
require_role now actually blocks viewer-role mutations across
companies.py, applications.py, and payments.py, while owner/recruiter
keep working.
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
    Company, CompanyMember, Job, JobApplication, Plan, Subscription, User, UserRole,
)
from app.api.v1.companies import (
    create_company_job, duplicate_company_job, update_company_job, delete_company_job,
    update_company_profile,
)
from app.api.v1.applications import update_application_status
from app.api.v1.payments import cancel_subscription, resume_subscription, subscribe


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
    company = Company(owner_user_id=owner.id, name="Acme Angola", status="active")
    db.add(company)
    db.commit()
    return owner, company


def _make_member(db, company, role):
    member_user = User(id=str(uuid.uuid4()), email=f"member-{uuid.uuid4()}@x.com", full_name="Member", password_hash="x", role=UserRole.company)
    db.add(member_user)
    db.flush()
    db.add(CompanyMember(company_id=company.id, user_id=member_user.id, role=role))
    db.commit()
    return member_user


def _assert_forbidden(coro):
    with pytest.raises(HTTPException) as exc:
        asyncio.run(coro)
    assert exc.value.status_code == 403


# ── create/duplicate/update/delete job ──────────────────────────────────────

def test_viewer_cannot_create_job(db):
    owner, company = _make_owner_and_company(db)
    viewer = _make_member(db, company, role="viewer")
    _assert_forbidden(create_company_job(payload={"title": "Vaga"}, db=db, current_user=viewer))


def test_recruiter_can_create_job(db):
    owner, company = _make_owner_and_company(db)
    recruiter = _make_member(db, company, role="recruiter")
    result = asyncio.run(create_company_job(payload={"title": "Vaga"}, db=db, current_user=recruiter))
    assert result["job"]["title"] == "Vaga"


def test_viewer_cannot_duplicate_job(db):
    owner, company = _make_owner_and_company(db)
    viewer = _make_member(db, company, role="viewer")
    job = Job(company_id=company.id, title="Vaga", status="approved", visibility="public")
    db.add(job)
    db.commit()
    _assert_forbidden(duplicate_company_job(job_id=job.id, db=db, current_user=viewer))


def test_viewer_cannot_update_job(db):
    owner, company = _make_owner_and_company(db)
    viewer = _make_member(db, company, role="viewer")
    job = Job(company_id=company.id, title="Vaga", status="approved", visibility="public")
    db.add(job)
    db.commit()
    _assert_forbidden(update_company_job(job_id=job.id, payload={"title": "Nova"}, db=db, current_user=viewer))


def test_viewer_cannot_delete_job(db):
    owner, company = _make_owner_and_company(db)
    viewer = _make_member(db, company, role="viewer")
    job = Job(company_id=company.id, title="Vaga", status="approved", visibility="public")
    db.add(job)
    db.commit()
    _assert_forbidden(delete_company_job(job_id=job.id, db=db, current_user=viewer))


def test_recruiter_can_delete_job(db):
    owner, company = _make_owner_and_company(db)
    recruiter = _make_member(db, company, role="recruiter")
    job = Job(company_id=company.id, title="Vaga", status="approved", visibility="public")
    db.add(job)
    db.commit()
    result = asyncio.run(delete_company_job(job_id=job.id, db=db, current_user=recruiter))
    assert result["deleted"] is True


# ── company profile: owner-only ─────────────────────────────────────────────

def test_recruiter_cannot_update_company_profile(db):
    owner, company = _make_owner_and_company(db)
    recruiter = _make_member(db, company, role="recruiter")
    _assert_forbidden(update_company_profile(payload={"name": "Novo Nome"}, db=db, current_user=recruiter))


def test_owner_can_update_company_profile(db):
    owner, company = _make_owner_and_company(db)
    result = asyncio.run(update_company_profile(payload={"name": "Novo Nome"}, db=db, current_user=owner))
    assert result["company"]["name"] == "Novo Nome"


# ── application status: viewer blocked, recruiter allowed ──────────────────

def test_viewer_cannot_update_application_status(db):
    owner, company = _make_owner_and_company(db)
    viewer = _make_member(db, company, role="viewer")
    job = Job(company_id=company.id, title="Vaga", status="approved", visibility="public")
    db.add(job)
    db.flush()
    app_row = JobApplication(job_id=job.id, company_id=company.id, applicant_full_name="Ana", applicant_email="ana@x.com")
    db.add(app_row)
    db.commit()
    _assert_forbidden(update_application_status(application_id=app_row.id, payload={"status": "interview"}, db=db, current_user=viewer))


def test_recruiter_can_update_application_status(db):
    owner, company = _make_owner_and_company(db)
    recruiter = _make_member(db, company, role="recruiter")
    job = Job(company_id=company.id, title="Vaga", status="approved", visibility="public")
    db.add(job)
    db.flush()
    app_row = JobApplication(job_id=job.id, company_id=company.id, applicant_full_name="Ana", applicant_email="ana@x.com")
    db.add(app_row)
    db.commit()
    result = asyncio.run(update_application_status(application_id=app_row.id, payload={"status": "interview"}, db=db, current_user=recruiter))
    assert result["application"]["status"] == "interview"


# ── subscription mutations: owner-only ──────────────────────────────────────

def _make_active_subscription(db, company):
    plan = Plan(code=f"biz-{uuid.uuid4().hex[:6]}", name="Business", price=0, currency="AOA", interval="month", max_active_jobs=-1)
    db.add(plan)
    db.flush()
    sub = Subscription(company_id=company.id, plan_id=plan.id, status="active", current_period_end=datetime.utcnow() + timedelta(days=30))
    db.add(sub)
    db.commit()
    return plan, sub


def test_recruiter_cannot_cancel_subscription(db):
    owner, company = _make_owner_and_company(db)
    recruiter = _make_member(db, company, role="recruiter")
    _make_active_subscription(db, company)
    _assert_forbidden(cancel_subscription(db=db, current_user=recruiter))


def test_recruiter_cannot_resume_subscription(db):
    owner, company = _make_owner_and_company(db)
    recruiter = _make_member(db, company, role="recruiter")
    _make_active_subscription(db, company)
    _assert_forbidden(resume_subscription(db=db, current_user=recruiter))


def test_recruiter_cannot_subscribe(db):
    owner, company = _make_owner_and_company(db)
    recruiter = _make_member(db, company, role="recruiter")
    _assert_forbidden(subscribe(payload={"planCode": "free"}, db=db, current_user=recruiter))


def test_owner_can_cancel_subscription(db):
    owner, company = _make_owner_and_company(db)
    _make_active_subscription(db, company)
    result = asyncio.run(cancel_subscription(db=db, current_user=owner))
    assert result["subscription"]["cancelRequestedAt"] is not None
