"""Tests for the admin demand-analytics rollup — most-saved jobs and
JobAlert volume/top categories/keywords, aggregated from existing tables.
"""
import asyncio
import uuid

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.base import Base
from app.models import Company, Job, JobAlert, SavedJob, User, UserRole
from app.api.v1.admin import admin_demand_analytics


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


def _make_job(db, title):
    owner = User(id=str(uuid.uuid4()), email=f"owner-{uuid.uuid4()}@x.com", full_name="Owner", password_hash="x", role=UserRole.company)
    db.add(owner)
    db.flush()
    company = Company(owner_user_id=owner.id, name="Acme", status="active")
    db.add(company)
    db.flush()
    job = Job(company_id=company.id, title=title, status="approved", visibility="public")
    db.add(job)
    db.commit()
    return job


def _make_candidate(db):
    user = User(id=str(uuid.uuid4()), email=f"cand-{uuid.uuid4()}@x.com", full_name="Cand", password_hash="x", role=UserRole.candidate)
    db.add(user)
    db.commit()
    return user


def test_top_saved_jobs_ordered_by_save_count(db):
    admin = _make_admin(db)
    popular = _make_job(db, "Popular Job")
    unpopular = _make_job(db, "Unpopular Job")
    for _ in range(3):
        db.add(SavedJob(candidate_user_id=_make_candidate(db).id, job_id=popular.id))
    db.add(SavedJob(candidate_user_id=_make_candidate(db).id, job_id=unpopular.id))
    db.commit()

    result = asyncio.run(admin_demand_analytics(db=db, current_user=admin))

    assert result["topSavedJobs"][0]["jobId"] == popular.id
    assert result["topSavedJobs"][0]["saves"] == 3
    assert result["topSavedJobs"][0]["title"] == "Popular Job"


def test_job_alert_volume_counts_active_and_total(db):
    admin = _make_admin(db)
    db.add(JobAlert(candidate_user_id=_make_candidate(db).id, active=True))
    db.add(JobAlert(candidate_user_id=_make_candidate(db).id, active=False))
    db.commit()

    result = asyncio.run(admin_demand_analytics(db=db, current_user=admin))

    assert result["jobAlerts"]["total"] == 2
    assert result["jobAlerts"]["active"] == 1


def test_top_alert_categories_and_keywords(db):
    admin = _make_admin(db)
    db.add(JobAlert(candidate_user_id=_make_candidate(db).id, category="Tecnologia", keyword="python"))
    db.add(JobAlert(candidate_user_id=_make_candidate(db).id, category="Tecnologia", keyword="python"))
    db.add(JobAlert(candidate_user_id=_make_candidate(db).id, category="Vendas", keyword=None))
    db.commit()

    result = asyncio.run(admin_demand_analytics(db=db, current_user=admin))

    assert result["topAlertCategories"][0] == {"label": "Tecnologia", "value": 2}
    assert result["topAlertKeywords"][0] == {"label": "python", "value": 2}


def test_empty_when_no_data(db):
    admin = _make_admin(db)
    result = asyncio.run(admin_demand_analytics(db=db, current_user=admin))
    assert result["topSavedJobs"] == []
    assert result["jobAlerts"] == {"total": 0, "active": 0}
    assert result["topAlertCategories"] == []
    assert result["topAlertKeywords"] == []
