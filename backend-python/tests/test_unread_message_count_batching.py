"""Test for the batched unreadMessageCount/hasCompanyMessage fields added
to _serialize_application for W5.1 — computed via _message_meta_for, the
same one-query-per-list-call batching pattern as _job_titles_for/
_skills_for_candidates (W3.4/W3.5), not N+1 per row. Confirms correctness
across several applications with mixed message states in a single list call.
"""
import asyncio
import uuid

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.base import Base
from app.models import Company, Job, JobApplication, User, UserRole
from app.api.v1.applications import list_applications, list_candidate_applications
from app.api.v1.messages import send_application_message


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


def test_batched_message_meta_correct_across_multiple_applications(db):
    owner, company = _make_owner_and_company(db)
    job = Job(company_id=company.id, title="Vaga", status="approved", visibility="public")
    db.add(job)
    db.flush()

    candidates = []
    apps = []
    for i in range(3):
        cand = User(id=str(uuid.uuid4()), email=f"cand{i}@x.com", full_name=f"Cand {i}", password_hash="x", role=UserRole.candidate)
        db.add(cand)
        db.flush()
        app_row = JobApplication(job_id=job.id, company_id=company.id, candidate_user_id=cand.id, applicant_full_name=f"Cand {i}", applicant_email=f"cand{i}@x.com")
        db.add(app_row)
        db.commit()
        candidates.append(cand)
        apps.append(app_row)

    # App 0: no messages at all.
    # App 1: company sent one message, unread by the candidate.
    asyncio.run(send_application_message(apps[1].id, {"body": "Olá!"}, db=db, current_user=owner))
    # App 2: company sent, candidate replied — company has 1 unread.
    asyncio.run(send_application_message(apps[2].id, {"body": "Olá!"}, db=db, current_user=owner))
    asyncio.run(send_application_message(apps[2].id, {"body": "Oi!"}, db=db, current_user=candidates[2]))

    company_view = asyncio.run(list_applications(page=1, limit=20, jobId=None, db=db, current_user=owner))
    by_id = {a["_id"]: a for a in company_view["applications"]}
    assert by_id[apps[0].id]["unreadMessageCount"] == 0
    assert by_id[apps[0].id]["hasCompanyMessage"] is False
    assert by_id[apps[1].id]["unreadMessageCount"] == 0  # candidate's message, not company's, is what companies see as unread
    assert by_id[apps[2].id]["unreadMessageCount"] == 1  # candidate's reply, unread by the company

    candidate_view = asyncio.run(list_candidate_applications(page=1, limit=20, db=db, current_user=candidates[1]))
    assert candidate_view["applications"][0]["unreadMessageCount"] == 1  # the company's message, unread by this candidate
    assert candidate_view["applications"][0]["hasCompanyMessage"] is True
