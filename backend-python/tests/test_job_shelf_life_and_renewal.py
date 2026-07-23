"""Tests for overnight-audit W-extra — job shelf-life and renewal. Only
scraped/aggregated jobs used to auto-expire; a company's own posting
stayed "published" indefinitely unless manually archived. Covers:
creation sets a 45-day expires_at, the sweep task expires stale
company-posted jobs (but leaves scraped ones to their own task), and the
one-click renew endpoint.
"""
import asyncio
import uuid
from datetime import datetime, timedelta

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.base import Base
from app.models import Company, CompanyMember, Job, User, UserRole
from app.api.v1.companies import create_company_job, renew_company_job
import app.workers.tasks as tasks


@pytest.fixture()
def db(monkeypatch):
    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    # expire_stale_company_jobs does `db = SessionLocal()` against the name
    # already bound at tasks.py's top-level `from app.db.session import
    # SessionLocal` — patching app.db.session.SessionLocal wouldn't reach
    # that reference, so patch tasks.SessionLocal directly and hand back
    # the same session the test itself queries against (same pattern as
    # test_scrape_ingest_dedup.py).
    monkeypatch.setattr(tasks, "SessionLocal", lambda: session)
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


def test_new_job_gets_45_day_shelf_life(db):
    owner, company = _make_owner_and_company(db)
    result = asyncio.run(create_company_job({"title": "Vaga"}, db=db, current_user=owner))
    job = db.query(Job).filter(Job.id == result["job"]["_id"]).first()
    assert job.expires_at is not None
    delta_days = (job.expires_at - datetime.utcnow()).days
    assert 43 <= delta_days <= 45


def test_expire_sweep_expires_stale_company_job_only(db):
    owner, company = _make_owner_and_company(db)
    stale_company_job = Job(company_id=company.id, title="Vaga velha", status="approved", visibility="public", expires_at=datetime.utcnow() - timedelta(days=1))
    fresh_company_job = Job(company_id=company.id, title="Vaga nova", status="approved", visibility="public", expires_at=datetime.utcnow() + timedelta(days=10))
    stale_scraped_job = Job(company_id=company.id, title="Vaga raspada", status="approved", visibility="public", expires_at=datetime.utcnow() - timedelta(days=1), source="ango-emprego")
    db.add_all([stale_company_job, fresh_company_job, stale_scraped_job])
    db.commit()
    # Capture ids before the task's own commit()/close() expire+detach these
    # instances (same shared, monkeypatched session) — .id access afterward
    # would itself raise DetachedInstanceError.
    stale_id, fresh_id, scraped_id = stale_company_job.id, fresh_company_job.id, stale_scraped_job.id

    result = tasks.expire_stale_company_jobs()
    assert result["expired"] == 1

    assert db.query(Job).filter(Job.id == stale_id).first().status == "expired"
    assert db.query(Job).filter(Job.id == fresh_id).first().status == "approved"
    assert db.query(Job).filter(Job.id == scraped_id).first().status == "approved"  # left to expire_stale_aggregated_jobs instead


def test_renew_pushes_expiry_and_restores_expired_job(db):
    owner, company = _make_owner_and_company(db)
    job = Job(company_id=company.id, title="Vaga", status="expired", visibility="public", expires_at=datetime.utcnow() - timedelta(days=1))
    db.add(job)
    db.commit()

    result = asyncio.run(renew_company_job(job.id, db=db, current_user=owner))
    assert result["job"]["status"] == "approved"

    db.refresh(job)
    assert job.status == "approved"
    assert job.expires_at > datetime.utcnow() + timedelta(days=40)


def test_viewer_cannot_renew(db):
    owner, company = _make_owner_and_company(db)
    viewer_user = User(id=str(uuid.uuid4()), email="viewer@x.com", full_name="Viewer", password_hash="x", role=UserRole.company)
    db.add(viewer_user)
    db.flush()
    db.add(CompanyMember(company_id=company.id, user_id=viewer_user.id, role="viewer"))
    job = Job(company_id=company.id, title="Vaga", status="approved", visibility="public")
    db.add(job)
    db.commit()

    with pytest.raises(HTTPException) as exc:
        asyncio.run(renew_company_job(job.id, db=db, current_user=viewer_user))
    assert exc.value.status_code == 403


def test_cannot_renew_archived_job(db):
    owner, company = _make_owner_and_company(db)
    job = Job(company_id=company.id, title="Vaga", status="archived", visibility="public")
    db.add(job)
    db.commit()

    with pytest.raises(HTTPException) as exc:
        asyncio.run(renew_company_job(job.id, db=db, current_user=owner))
    assert exc.value.status_code == 400
