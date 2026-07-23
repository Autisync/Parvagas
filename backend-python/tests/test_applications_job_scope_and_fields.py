"""Tests for overnight-audit W3.4 (job-scoped applicant search + real job
titles) and W3.5 (candidate phone number in the ATS view). Confirms:
_serialize_application no longer fabricates "Vaga {job_id}" as the title,
list_applications accepts a jobId filter, phone is returned, and skills are
attached for applicants with a candidate profile.
"""
import asyncio
import uuid

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.base import Base
from app.models import CandidateProfile, Company, Job, JobApplication, User, UserRole
from app.api.v1.applications import list_applications, application_candidate_cv


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


def test_application_list_shows_real_job_title_and_phone(db):
    owner, company = _make_owner_and_company(db)
    job = Job(company_id=company.id, title="Engenheiro de Vendas", status="approved", visibility="public")
    db.add(job)
    db.flush()
    db.add(JobApplication(
        job_id=job.id, company_id=company.id, applicant_full_name="Ana", applicant_email="ana@x.com",
        applicant_phone="+244911111111",
    ))
    db.commit()

    result = asyncio.run(list_applications(page=1, limit=20, jobId=None, db=db, current_user=owner))
    app = result["applications"][0]
    assert app["jobId"]["title"] == "Engenheiro de Vendas"  # not "Vaga {job_id}"
    assert app["profileSnapshot"]["phone"] == "+244911111111"


def test_application_list_filters_by_job_id(db):
    owner, company = _make_owner_and_company(db)
    job_a = Job(company_id=company.id, title="Vaga A", status="approved", visibility="public")
    job_b = Job(company_id=company.id, title="Vaga B", status="approved", visibility="public")
    db.add_all([job_a, job_b])
    db.flush()
    db.add_all([
        JobApplication(job_id=job_a.id, company_id=company.id, applicant_full_name="Ana", applicant_email="ana@x.com"),
        JobApplication(job_id=job_b.id, company_id=company.id, applicant_full_name="Beto", applicant_email="beto@x.com"),
    ])
    db.commit()

    result = asyncio.run(list_applications(page=1, limit=20, jobId=job_a.id, db=db, current_user=owner))
    assert len(result["applications"]) == 1
    assert result["applications"][0]["profileSnapshot"]["fullName"] == "Ana"


def test_application_list_includes_candidate_skills(db):
    owner, company = _make_owner_and_company(db)
    job = Job(company_id=company.id, title="Vaga", status="approved", visibility="public")
    candidate_user = User(id=str(uuid.uuid4()), email="cand@x.com", full_name="Cand", password_hash="x", role=UserRole.candidate)
    db.add_all([job, candidate_user])
    db.flush()
    db.add(CandidateProfile(user_id=candidate_user.id, skills='["Python", "SQL"]'))
    db.add(JobApplication(
        job_id=job.id, company_id=company.id, candidate_user_id=candidate_user.id,
        applicant_full_name="Cand", applicant_email="cand@x.com",
    ))
    db.commit()

    result = asyncio.run(list_applications(page=1, limit=20, jobId=None, db=db, current_user=owner))
    assert result["applications"][0]["profileSnapshot"]["skills"] == ["Python", "SQL"]


def test_candidate_cv_view_includes_phone(db):
    owner, company = _make_owner_and_company(db)
    job = Job(company_id=company.id, title="Vaga", status="approved", visibility="public")
    db.add(job)
    db.flush()
    app_row = JobApplication(
        job_id=job.id, company_id=company.id, applicant_full_name="Ana", applicant_email="ana@x.com",
        applicant_phone="+244922222222",
    )
    db.add(app_row)
    db.commit()

    result = asyncio.run(application_candidate_cv(app_row.id, db=db, current_user=owner))
    assert result["candidate"]["phone"] == "+244922222222"
