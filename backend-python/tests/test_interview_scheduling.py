"""Tests for overnight-audit W-extra — interview-scheduling fields.
Moving an application to "interview" previously only flipped a status
label and sent a generic email telling the candidate the company would
contact them separately; there was no home anywhere in the data model
for date/location/meeting-link. update_application_status now persists
these onto the application and threads them into the status email.
"""
import asyncio
import uuid

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.base import Base
from app.models import Company, Job, JobApplication, User, UserRole
from app.api.v1.applications import update_application_status, list_company_applications


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


def test_interview_details_persisted_on_status_change(db):
    owner, company = _make_owner_and_company(db)
    job = Job(company_id=company.id, title="Vaga", status="approved", visibility="public")
    db.add(job)
    db.flush()
    app_row = JobApplication(job_id=job.id, company_id=company.id, applicant_full_name="Ana", applicant_email="ana@x.com")
    db.add(app_row)
    db.commit()

    asyncio.run(update_application_status(
        app_row.id,
        {
            "status": "interview",
            "interviewDate": "2026-08-01T14:00:00",
            "interviewLocation": "Escritório Talatona, sala 3",
            "interviewMeetingLink": "https://meet.example.com/abc",
        },
        db=db, current_user=owner,
    ))

    db.refresh(app_row)
    assert app_row.interview_scheduled_at is not None
    assert app_row.interview_location == "Escritório Talatona, sala 3"
    assert app_row.interview_meeting_link == "https://meet.example.com/abc"


def test_interview_details_surfaced_in_application_list(db):
    owner, company = _make_owner_and_company(db)
    job = Job(company_id=company.id, title="Vaga", status="approved", visibility="public")
    db.add(job)
    db.flush()
    app_row = JobApplication(job_id=job.id, company_id=company.id, applicant_full_name="Ana", applicant_email="ana@x.com")
    db.add(app_row)
    db.commit()

    asyncio.run(update_application_status(
        app_row.id, {"status": "interview", "interviewLocation": "Online"}, db=db, current_user=owner,
    ))

    result = asyncio.run(list_company_applications(page=1, limit=20, db=db, current_user=owner))
    listed = result["applications"][0]
    assert listed["interview"]["location"] == "Online"


def test_no_interview_block_when_status_is_not_interview(db):
    owner, company = _make_owner_and_company(db)
    job = Job(company_id=company.id, title="Vaga", status="approved", visibility="public")
    db.add(job)
    db.flush()
    app_row = JobApplication(job_id=job.id, company_id=company.id, applicant_full_name="Ana", applicant_email="ana@x.com")
    db.add(app_row)
    db.commit()

    asyncio.run(update_application_status(app_row.id, {"status": "shortlisted"}, db=db, current_user=owner))

    result = asyncio.run(list_company_applications(page=1, limit=20, db=db, current_user=owner))
    assert result["applications"][0]["interview"] is None


def test_malformed_interview_date_ignored_not_raised(db):
    owner, company = _make_owner_and_company(db)
    job = Job(company_id=company.id, title="Vaga", status="approved", visibility="public")
    db.add(job)
    db.flush()
    app_row = JobApplication(job_id=job.id, company_id=company.id, applicant_full_name="Ana", applicant_email="ana@x.com")
    db.add(app_row)
    db.commit()

    result = asyncio.run(update_application_status(
        app_row.id, {"status": "interview", "interviewDate": "not-a-date", "interviewLocation": "Online"}, db=db, current_user=owner,
    ))
    assert result["application"]["status"] == "interview"
    db.refresh(app_row)
    assert app_row.interview_scheduled_at is None
    assert app_row.interview_location == "Online"
