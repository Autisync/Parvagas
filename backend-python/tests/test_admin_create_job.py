"""Tests for POST /admin/jobs — the direct alternative to scraping: an admin
authors a job on behalf of a company that agreed (via business development)
to be listed but has no Parvagas account yet. Covers both attribution modes
(external company + contact email, and an existing registered company) and
confirms the private contact email never leaks into non-admin serialization.
"""
import asyncio
import uuid

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.base import Base
from app.models import Company, Job, User, UserRole
from app.api.v1.admin import admin_create_job
from app.api.v1.jobs import serialize_job


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


def _make_company(db):
    owner = User(id=str(uuid.uuid4()), email=f"owner-{uuid.uuid4()}@x.com", full_name="Owner", password_hash="x", role=UserRole.company)
    db.add(owner)
    db.flush()
    company = Company(owner_user_id=owner.id, name="Acme Angola", status="active")
    db.add(company)
    db.commit()
    return company


def test_create_external_job_publishes_immediately(db):
    admin = _make_admin(db)

    result = asyncio.run(admin_create_job(
        {
            "title": "Engenheiro de Processos",
            "description": "Vaga obtida via desenvolvimento de negócio.",
            "externalCompanyName": "Sonangol Contractor Ltd",
            "externalContactEmail": "rh@contractor.co.ao",
        },
        db=db, current_user=admin,
    ))

    job = db.query(Job).filter(Job.id == result["job"]["_id"]).first()
    assert job.status == "approved"
    assert job.visibility == "public"
    assert job.published_at is not None
    assert job.external_company_name == "Sonangol Contractor Ltd"
    assert job.external_contact_email == "rh@contractor.co.ao"
    # Attributed to the synthetic aggregator company, same as scraped jobs.
    company = db.query(Company).filter(Company.id == job.company_id).first()
    assert company.name == "Parvagas Aggregator"


def test_create_job_for_registered_company(db):
    admin = _make_admin(db)
    company = _make_company(db)

    result = asyncio.run(admin_create_job(
        {"title": "Analista Financeiro", "companyId": company.id},
        db=db, current_user=admin,
    ))

    job = db.query(Job).filter(Job.id == result["job"]["_id"]).first()
    assert job.company_id == company.id
    assert job.external_company_name is None
    assert job.external_contact_email is None


def test_create_job_requires_title(db):
    admin = _make_admin(db)
    with pytest.raises(HTTPException) as exc:
        asyncio.run(admin_create_job(
            {"externalCompanyName": "X", "externalContactEmail": "a@b.com"},
            db=db, current_user=admin,
        ))
    assert exc.value.status_code == 400


def test_create_job_requires_company_attribution(db):
    admin = _make_admin(db)
    with pytest.raises(HTTPException) as exc:
        asyncio.run(admin_create_job({"title": "Vaga sem empresa"}, db=db, current_user=admin))
    assert exc.value.status_code == 400


def test_create_job_rejects_invalid_email(db):
    admin = _make_admin(db)
    with pytest.raises(HTTPException) as exc:
        asyncio.run(admin_create_job(
            {"title": "Vaga", "externalCompanyName": "X", "externalContactEmail": "not-an-email"},
            db=db, current_user=admin,
        ))
    assert exc.value.status_code == 400


def test_create_job_rejects_unknown_company_id(db):
    admin = _make_admin(db)
    with pytest.raises(HTTPException) as exc:
        asyncio.run(admin_create_job(
            {"title": "Vaga", "companyId": "does-not-exist"},
            db=db, current_user=admin,
        ))
    assert exc.value.status_code == 404


def test_non_admin_forbidden(db):
    candidate = User(id=str(uuid.uuid4()), email="c@x.com", full_name="C", password_hash="x", role=UserRole.candidate)
    db.add(candidate)
    db.commit()

    with pytest.raises(HTTPException) as exc:
        asyncio.run(admin_create_job(
            {"title": "Vaga", "externalCompanyName": "X", "externalContactEmail": "a@b.com"},
            db=db, current_user=candidate,
        ))
    assert exc.value.status_code == 403


def test_external_contact_email_hidden_from_public_serialization(db):
    admin = _make_admin(db)
    result = asyncio.run(admin_create_job(
        {"title": "Vaga", "externalCompanyName": "X", "externalContactEmail": "private@contractor.co.ao"},
        db=db, current_user=admin,
    ))
    job = db.query(Job).filter(Job.id == result["job"]["_id"]).first()

    # Admin response includes it (already asserted implicitly by the create
    # flow succeeding); the public/company-scoped serialization must not.
    admin_payload = serialize_job(job, detail=True, admin=True)
    public_payload = serialize_job(job, detail=True)
    assert admin_payload["externalContactEmail"] == "private@contractor.co.ao"
    assert "externalContactEmail" not in public_payload
