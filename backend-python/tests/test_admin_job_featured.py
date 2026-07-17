"""Tests for the admin job-featured toggle — deliberately a separate
endpoint from `moderate` so flipping it can't accidentally re-set a job's
status/visibility (moderate defaults those to approved/public when absent).
"""
import asyncio
import uuid

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.base import Base
from app.models import Company, Job, User, UserRole
from app.api.v1.admin import admin_set_job_featured, admin_jobs


@pytest.fixture()
def db():
    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()


def _make_admin(db):
    admin = User(id=str(uuid.uuid4()), email=f"admin-{uuid.uuid4()}@parvagas.pt", full_name="Admin", password_hash="x", role=UserRole.admin)
    db.add(admin)
    db.commit()
    return admin


def _make_job(db):
    owner = User(id=str(uuid.uuid4()), email=f"owner-{uuid.uuid4()}@x.com", full_name="Owner", password_hash="x", role=UserRole.company)
    db.add(owner)
    db.flush()
    company = Company(owner_user_id=owner.id, name="Acme", status="active")
    db.add(company)
    db.flush()
    job = Job(company_id=company.id, title="Vaga", status="approved", visibility="public")
    db.add(job)
    db.commit()
    return job


def test_set_featured_true(db):
    admin = _make_admin(db)
    job = _make_job(db)

    result = asyncio.run(admin_set_job_featured(job.id, {"featured": True}, db=db, current_user=admin))

    assert result["job"]["featured"] is True
    db.refresh(job)
    assert job.featured is True


def test_set_featured_does_not_touch_status_or_visibility(db):
    admin = _make_admin(db)
    job = _make_job(db)

    asyncio.run(admin_set_job_featured(job.id, {"featured": True}, db=db, current_user=admin))

    db.refresh(job)
    assert job.status == "approved"
    assert job.visibility == "public"


def test_unset_featured(db):
    admin = _make_admin(db)
    job = _make_job(db)
    job.featured = True
    db.commit()

    result = asyncio.run(admin_set_job_featured(job.id, {"featured": False}, db=db, current_user=admin))

    assert result["job"]["featured"] is False


def test_set_featured_404(db):
    admin = _make_admin(db)
    with pytest.raises(HTTPException) as exc:
        asyncio.run(admin_set_job_featured("does-not-exist", {"featured": True}, db=db, current_user=admin))
    assert exc.value.status_code == 404


def test_admin_jobs_list_includes_featured_field(db):
    admin = _make_admin(db)
    job = _make_job(db)
    job.featured = True
    db.commit()

    result = asyncio.run(admin_jobs(page=1, limit=15, keyword=None, status_filter=None, db=db, current_user=admin))

    assert result["jobs"][0]["featured"] is True
