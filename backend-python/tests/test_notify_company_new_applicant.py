"""Tests for the dual notification path in _notify_company_new_applicant:
the resolved Company owner (if any) always gets the normal notification, and
jobs with an external_contact_email (no real Parvagas account) additionally
get a dedicated email with a no-login view link — this is the fix for
applications silently landing only in an internal admin inbox for
aggregated/scraped jobs.
"""
import uuid

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.base import Base
from app.models import Company, Job, Notification, User, UserRole
from app.api.v1.applications import _notify_company_new_applicant


@pytest.fixture()
def db():
    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()


def test_sends_external_email_when_contact_email_set(db, monkeypatch):
    owner = User(id=str(uuid.uuid4()), email="admin@parvagas.pt", full_name="Admin", password_hash="x", role=UserRole.admin)
    db.add(owner)
    db.flush()
    company = Company(owner_user_id=owner.id, name="Parvagas Aggregator", status="active")
    db.add(company)
    db.flush()
    job = Job(
        company_id=company.id, title="Vaga X", status="approved", visibility="public",
        external_company_name="Real Co", external_contact_email="rh@realco.example",
    )
    db.add(job)
    db.commit()

    calls = []
    monkeypatch.setattr("app.api.v1.applications.send_templated_email.delay", lambda method, payload: calls.append((method, payload)))

    _notify_company_new_applicant(db, company.id, job.id, "Candidate Name")

    methods = [c[0] for c in calls]
    assert "send_new_applicant_email" in methods  # internal admin still sees it
    assert "send_external_employer_new_applicant_email" in methods  # real employer now also does

    external_call = next(c for c in calls if c[0] == "send_external_employer_new_applicant_email")
    assert external_call[1]["email"] == "rh@realco.example"
    assert "token=" in external_call[1]["view_url"]

    db.refresh(job)
    assert job.employer_access_token  # generated so the view link actually resolves


def test_skips_external_email_when_no_contact_email(db, monkeypatch):
    owner = User(id=str(uuid.uuid4()), email="owner2@x.com", full_name="Owner", password_hash="x", role=UserRole.company)
    db.add(owner)
    db.flush()
    company = Company(owner_user_id=owner.id, name="Real Registered Co", status="active")
    db.add(company)
    db.flush()
    job = Job(company_id=company.id, title="Vaga Y", status="approved", visibility="public")
    db.add(job)
    db.commit()

    calls = []
    monkeypatch.setattr("app.api.v1.applications.send_templated_email.delay", lambda method, payload: calls.append((method, payload)))

    _notify_company_new_applicant(db, company.id, job.id, "Candidate Name")

    methods = [c[0] for c in calls]
    assert methods == ["send_new_applicant_email"]


def test_reuses_existing_employer_access_token_instead_of_rotating(db, monkeypatch):
    owner = User(id=str(uuid.uuid4()), email="admin2@parvagas.pt", full_name="Admin", password_hash="x", role=UserRole.admin)
    db.add(owner)
    db.flush()
    company = Company(owner_user_id=owner.id, name="Parvagas Aggregator 2", status="active")
    db.add(company)
    db.flush()
    job = Job(
        company_id=company.id, title="Vaga Z", status="approved", visibility="public",
        external_contact_email="rh@z.example", employer_access_token="stable-token",
    )
    db.add(job)
    db.commit()

    monkeypatch.setattr("app.api.v1.applications.send_templated_email.delay", lambda method, payload: None)

    _notify_company_new_applicant(db, company.id, job.id, "Candidate Name")

    db.refresh(job)
    assert job.employer_access_token == "stable-token"


def test_creates_bell_notification_for_company_owner(db, monkeypatch):
    """The owner gets an in-app notification alongside the email — this was
    previously email-only, so the bell stayed empty for companies."""
    owner = User(id=str(uuid.uuid4()), email="owner3@x.com", full_name="Owner", password_hash="x", role=UserRole.company)
    db.add(owner)
    db.flush()
    company = Company(owner_user_id=owner.id, name="Acme", status="active")
    db.add(company)
    db.flush()
    job = Job(company_id=company.id, title="Vaga Bell", status="approved", visibility="public")
    db.add(job)
    db.commit()

    monkeypatch.setattr("app.api.v1.applications.send_templated_email.delay", lambda method, payload: None)

    _notify_company_new_applicant(db, company.id, job.id, "Candidate Name")

    rows = db.query(Notification).filter(Notification.user_id == owner.id).all()
    assert len(rows) == 1
    assert rows[0].type == "new_applicant"
    assert "Candidate Name" in rows[0].body
    assert "Vaga Bell" in rows[0].body
