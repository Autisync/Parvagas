"""Regression test for a bug found while building W5.1 (candidate
messaging): the ATS notes endpoints used a raw `Company.owner_user_id ==
user.id` check instead of the shared resolve_company_for_user_or_none —
the same owner-only bug W0.1 fixed everywhere else this session, just a
call site that fix didn't reach. An invited team member got 403'd trying
to view or add ATS notes on an application their company owns.
"""
import asyncio
import uuid

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.base import Base
from app.models import Company, CompanyMember, Job, JobApplication, User, UserRole
from app.api.v1.applications import list_application_notes, add_application_note


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


def test_invited_recruiter_can_list_and_add_notes(db):
    owner, company = _make_owner_and_company(db)
    recruiter = User(id=str(uuid.uuid4()), email="recruiter@x.com", full_name="Recruiter", password_hash="x", role=UserRole.company)
    db.add(recruiter)
    db.flush()
    db.add(CompanyMember(company_id=company.id, user_id=recruiter.id, role="recruiter"))
    job = Job(company_id=company.id, title="Vaga", status="approved", visibility="public")
    db.add(job)
    db.flush()
    app_row = JobApplication(job_id=job.id, company_id=company.id, applicant_full_name="Ana", applicant_email="ana@x.com")
    db.add(app_row)
    db.commit()

    listed = asyncio.run(list_application_notes(app_row.id, db=db, current_user=recruiter))
    assert listed["notes"] == []

    added = asyncio.run(add_application_note(app_row.id, {"body": "Boa experiência.", "rating": 4}, db=db, current_user=recruiter))
    assert added["note"]["body"] == "Boa experiência."
