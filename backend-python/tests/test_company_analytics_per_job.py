"""Tests for overnight-audit W4.1 — company_analytics previously only ever
summed views/applications across every job (a company running several
live postings had no way to tell which ones were converting). topJobs now
carries per-job applications + conversionPct alongside views.
"""
import asyncio
import uuid

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.base import Base
from app.models import Company, Job, JobApplication, User, UserRole
from app.api.v1.companies import company_analytics


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


def test_top_jobs_carry_per_job_applications_and_conversion(db):
    owner, company = _make_owner_and_company(db)
    popular = Job(company_id=company.id, title="Vaga Popular", status="approved", visibility="public", views=100)
    quiet = Job(company_id=company.id, title="Vaga Silenciosa", status="approved", visibility="public", views=10)
    db.add_all([popular, quiet])
    db.flush()
    for _ in range(20):
        db.add(JobApplication(
            job_id=popular.id, company_id=company.id,
            applicant_full_name="Ana", applicant_email=f"ana{uuid.uuid4()}@x.com",
        ))
    db.add(JobApplication(job_id=quiet.id, company_id=company.id, applicant_full_name="Beto", applicant_email="beto@x.com"))
    db.commit()

    result = asyncio.run(company_analytics(db=db, current_user=owner))
    by_title = {j["title"]: j for j in result["topJobs"]}

    assert by_title["Vaga Popular"]["applications"] == 20
    assert by_title["Vaga Popular"]["conversionPct"] == 20.0
    assert by_title["Vaga Silenciosa"]["applications"] == 1
    assert by_title["Vaga Silenciosa"]["conversionPct"] == 10.0


def test_top_jobs_zero_views_has_zero_conversion_not_div_by_zero(db):
    owner, company = _make_owner_and_company(db)
    job = Job(company_id=company.id, title="Vaga Nova", status="draft", visibility="public", views=0)
    db.add(job)
    db.commit()

    result = asyncio.run(company_analytics(db=db, current_user=owner))
    assert result["topJobs"][0]["conversionPct"] == 0.0
