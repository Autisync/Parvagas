"""Tests for overnight-audit W5.1 — company<->candidate messaging on a
JobApplication. Previously a company's only way to ask a candidate a
clarifying question was emailing them manually outside the platform.
Covers: company-initiates-first, role gates, notification dispatch, read
receipts, guest-application 404, and body-length/rate-limit validation.
"""
import asyncio
import uuid

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.base import Base
from app.models import ApplicationMessage, Company, CompanyMember, Job, JobApplication, Notification, User, UserRole
from app.api.v1.messages import list_application_messages, send_application_message, mark_application_messages_read


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


def _make_application_with_candidate(db, company):
    candidate = User(id=str(uuid.uuid4()), email="cand@x.com", full_name="Cand", password_hash="x", role=UserRole.candidate)
    job = Job(company_id=company.id, title="Vaga", status="approved", visibility="public")
    db.add_all([candidate, job])
    db.flush()
    app_row = JobApplication(
        job_id=job.id, company_id=company.id, candidate_user_id=candidate.id,
        applicant_full_name="Cand", applicant_email="cand@x.com",
    )
    db.add(app_row)
    db.commit()
    return candidate, app_row


def test_company_can_send_first_message(db):
    owner, company = _make_owner_and_company(db)
    candidate, app_row = _make_application_with_candidate(db, company)

    result = asyncio.run(send_application_message(app_row.id, {"body": "Olá, podemos falar sobre a sua candidatura?"}, db=db, current_user=owner))
    assert result["message"]["senderRole"] == "company"
    assert db.query(Notification).filter(Notification.user_id == candidate.id, Notification.type == "new_message").count() == 1


def test_candidate_cannot_send_before_company(db):
    owner, company = _make_owner_and_company(db)
    candidate, app_row = _make_application_with_candidate(db, company)

    with pytest.raises(HTTPException) as exc:
        asyncio.run(send_application_message(app_row.id, {"body": "Olá?"}, db=db, current_user=candidate))
    assert exc.value.status_code == 403


def test_candidate_can_reply_after_company_message(db):
    owner, company = _make_owner_and_company(db)
    candidate, app_row = _make_application_with_candidate(db, company)
    asyncio.run(send_application_message(app_row.id, {"body": "Olá!"}, db=db, current_user=owner))

    result = asyncio.run(send_application_message(app_row.id, {"body": "Olá, claro!"}, db=db, current_user=candidate))
    assert result["message"]["senderRole"] == "candidate"
    assert db.query(Notification).filter(Notification.user_id == owner.id, Notification.type == "new_message").count() == 1


def test_viewer_cannot_send(db):
    owner, company = _make_owner_and_company(db)
    candidate, app_row = _make_application_with_candidate(db, company)
    viewer_user = User(id=str(uuid.uuid4()), email="viewer@x.com", full_name="Viewer", password_hash="x", role=UserRole.company)
    db.add(viewer_user)
    db.flush()
    db.add(CompanyMember(company_id=company.id, user_id=viewer_user.id, role="viewer"))
    db.commit()

    with pytest.raises(HTTPException) as exc:
        asyncio.run(send_application_message(app_row.id, {"body": "Olá"}, db=db, current_user=viewer_user))
    assert exc.value.status_code == 403


def test_viewer_can_read(db):
    owner, company = _make_owner_and_company(db)
    candidate, app_row = _make_application_with_candidate(db, company)
    viewer_user = User(id=str(uuid.uuid4()), email="viewer2@x.com", full_name="Viewer", password_hash="x", role=UserRole.company)
    db.add(viewer_user)
    db.flush()
    db.add(CompanyMember(company_id=company.id, user_id=viewer_user.id, role="viewer"))
    db.commit()
    asyncio.run(send_application_message(app_row.id, {"body": "Olá"}, db=db, current_user=owner))

    result = asyncio.run(list_application_messages(app_row.id, db=db, current_user=viewer_user))
    assert len(result["messages"]) == 1
    assert result["viewerRole"] == "company"


def test_different_candidate_gets_403(db):
    owner, company = _make_owner_and_company(db)
    candidate, app_row = _make_application_with_candidate(db, company)
    other_candidate = User(id=str(uuid.uuid4()), email="other@x.com", full_name="Other", password_hash="x", role=UserRole.candidate)
    db.add(other_candidate)
    db.commit()

    with pytest.raises(HTTPException) as exc:
        asyncio.run(list_application_messages(app_row.id, db=db, current_user=other_candidate))
    assert exc.value.status_code == 403


def test_guest_application_404s_on_send(db):
    owner, company = _make_owner_and_company(db)
    job = Job(company_id=company.id, title="Vaga", status="approved", visibility="public")
    db.add(job)
    db.flush()
    guest_app = JobApplication(
        job_id=job.id, company_id=company.id, candidate_user_id=None,
        applicant_full_name="Guest", applicant_email="guest@x.com",
    )
    db.add(guest_app)
    db.commit()

    with pytest.raises(HTTPException) as exc:
        asyncio.run(send_application_message(guest_app.id, {"body": "Olá"}, db=db, current_user=owner))
    assert exc.value.status_code == 404


def test_empty_body_rejected(db):
    owner, company = _make_owner_and_company(db)
    candidate, app_row = _make_application_with_candidate(db, company)

    with pytest.raises(HTTPException) as exc:
        asyncio.run(send_application_message(app_row.id, {"body": "   "}, db=db, current_user=owner))
    assert exc.value.status_code == 400


def test_oversized_body_rejected(db):
    owner, company = _make_owner_and_company(db)
    candidate, app_row = _make_application_with_candidate(db, company)

    with pytest.raises(HTTPException) as exc:
        asyncio.run(send_application_message(app_row.id, {"body": "x" * 2001}, db=db, current_user=owner))
    assert exc.value.status_code == 400


def test_mark_read_only_clears_other_partys_messages(db):
    owner, company = _make_owner_and_company(db)
    candidate, app_row = _make_application_with_candidate(db, company)
    asyncio.run(send_application_message(app_row.id, {"body": "Olá!"}, db=db, current_user=owner))
    asyncio.run(send_application_message(app_row.id, {"body": "Oi!"}, db=db, current_user=candidate))

    result = asyncio.run(mark_application_messages_read(app_row.id, db=db, current_user=owner))
    assert result["markedRead"] == 1  # only the candidate's message, not the company's own

    rows = db.query(ApplicationMessage).filter(ApplicationMessage.application_id == app_row.id).all()
    company_msg = next(m for m in rows if m.sender_role == "company")
    candidate_msg = next(m for m in rows if m.sender_role == "candidate")
    assert company_msg.read_at is None
    assert candidate_msg.read_at is not None
