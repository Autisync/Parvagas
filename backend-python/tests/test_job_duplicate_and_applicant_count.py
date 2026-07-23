"""Tests for overnight-audit W3.1 (job duplicate) and W3.2 (applicant count
in the jobs list) — both quality-of-life gaps for a company posting/
tracking several roles."""
import asyncio
import uuid

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.base import Base
from datetime import datetime, timedelta

from app.models import Company, Job, JobApplication, Plan, Subscription, User, UserRole
from app.api.v1.companies import duplicate_company_job, list_company_jobs


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


def test_duplicate_job_copies_fields_and_enters_moderation(db):
    owner, company = _make_owner_and_company(db)
    plan = Plan(code="business", name="business", price=0, interval="month", max_active_jobs=-1)
    db.add(plan)
    db.flush()
    db.add(Subscription(company_id=company.id, plan_id=plan.id, status="active", current_period_end=datetime.utcnow() + timedelta(days=30)))
    db.commit()
    source = Job(
        company_id=company.id, title="Engenheiro de Software", status="approved", visibility="public",
        description="Descrição original", location="Luanda", category="Tecnologia",
    )
    db.add(source)
    db.commit()

    result = asyncio.run(duplicate_company_job(source.id, db=db, current_user=owner))

    assert result["job"]["title"] == "Engenheiro de Software (cópia)"
    assert result["job"]["description"] == "Descrição original"
    assert result["job"]["location"] == "Luanda"
    assert result["job"]["status"] == "pending_platform_review"
    assert result["job"]["_id"] != source.id


def test_duplicate_job_404s_for_another_companys_job(db):
    _owner1, _company1 = _make_owner_and_company(db)
    owner2, company2 = _make_owner_and_company(db)
    other_job = Job(company_id=company2.id, title="Vaga de Outra Empresa", status="approved", visibility="public")
    db.add(other_job)
    db.commit()

    with pytest.raises(HTTPException) as exc:
        asyncio.run(duplicate_company_job(other_job.id, db=db, current_user=_owner1))
    assert exc.value.status_code == 404


def test_jobs_list_includes_application_count(db):
    owner, company = _make_owner_and_company(db)
    job_with_apps = Job(company_id=company.id, title="Vaga A", status="approved", visibility="public")
    job_without_apps = Job(company_id=company.id, title="Vaga B", status="approved", visibility="public")
    db.add_all([job_with_apps, job_without_apps])
    db.flush()
    db.add_all([
        JobApplication(job_id=job_with_apps.id, company_id=company.id, applicant_full_name="A", applicant_email="a@x.com"),
        JobApplication(job_id=job_with_apps.id, company_id=company.id, applicant_full_name="B", applicant_email="b@x.com"),
    ])
    db.commit()

    result = asyncio.run(list_company_jobs(page=1, limit=20, status_filter=None, db=db, current_user=owner))
    counts = {j["_id"]: j["applicationCount"] for j in result["jobs"]}
    assert counts[job_with_apps.id] == 2
    assert counts[job_without_apps.id] == 0


def test_jobs_list_includes_quota(db):
    owner, company = _make_owner_and_company(db)
    db.add(Job(company_id=company.id, title="Vaga A", status="approved", visibility="public"))
    db.commit()

    result = asyncio.run(list_company_jobs(page=1, limit=20, status_filter=None, db=db, current_user=owner))
    # No Plan row seeded -> falls back to the free-tier default (1 active job).
    assert result["quota"]["activeJobs"] == 1
    assert result["quota"]["maxActiveJobs"] == 1
