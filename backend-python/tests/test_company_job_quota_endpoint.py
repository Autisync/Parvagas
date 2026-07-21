"""Endpoint-level coverage for job-posting plan quota enforcement wired into
companies.py::create_company_job — this is the first enforcement ever added
to that endpoint, so it's worth verifying the wiring (import + call site,
and that update/delete aren't accidentally affected) at the HTTP-handler
level, not just the service level (see test_company_billing_service.py for
the exhaustive tier/expiry/TOCTOU matrix).
"""
import asyncio
import uuid

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.base import Base
from app.models import Company, Job, Plan, User, UserRole
from app.api.v1.companies import create_company_job


@pytest.fixture()
def db():
    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()


def _make_company_owner(db) -> tuple[User, Company]:
    owner = User(id=str(uuid.uuid4()), email=f"owner-{uuid.uuid4()}@x.com",
                 full_name="Owner", password_hash="x", role=UserRole.company)
    db.add(owner)
    db.flush()
    company = Company(owner_user_id=owner.id, name="Acme Lda")
    db.add(company)
    db.commit()
    return owner, company


def test_create_job_blocked_at_free_cap(db):
    db.add(Plan(code="free", name="Grátis", price=0, interval="month", max_active_jobs=1))
    db.commit()
    owner, company = _make_company_owner(db)
    db.add(Job(company_id=company.id, title="Vaga existente", status="approved"))
    db.commit()

    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(create_company_job({"title": "Nova vaga"}, db=db, current_user=owner))
    assert exc_info.value.status_code == 402


def test_create_job_succeeds_below_cap(db):
    db.add(Plan(code="free", name="Grátis", price=0, interval="month", max_active_jobs=1))
    db.commit()
    owner, company = _make_company_owner(db)

    result = asyncio.run(create_company_job({"title": "Primeira vaga"}, db=db, current_user=owner))
    assert result["job"]["title"] == "Primeira vaga"
