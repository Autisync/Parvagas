"""Tests for overnight-audit W5.3 — the public, shareable employer page.
Only status == "active" companies resolve; the public payload omits
contact info (mirrors the W5.2 candidate full-profile privacy trim), and
the job list is scoped to that company's own live public jobs.
"""
import asyncio
import uuid

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.base import Base
from app.models import Company, Job, User, UserRole
from app.services.slug_service import generate_unique_slug
from app.api.v1.companies import get_public_company
from app.api.v1.jobs import list_public_jobs


class _FakeClient:
    host = "127.0.0.1"


class _FakeRequest:
    client = _FakeClient()
    headers = {}
    state = type("State", (), {})()


@pytest.fixture()
def db():
    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()


def _make_company(db, *, status="active", name="Acme Angola"):
    owner = User(id=str(uuid.uuid4()), email=f"owner-{uuid.uuid4()}@x.com", full_name="Owner", password_hash="x", role=UserRole.company)
    db.add(owner)
    db.flush()
    company = Company(
        owner_user_id=owner.id, name=name, status=status,
        slug=generate_unique_slug(db, Company, name),
        description="Uma empresa angolana.",
    )
    db.add(company)
    db.commit()
    return company


def _make_job(db, company, *, status="published", visibility="public", title="Vaga X"):
    job = Job(
        id=str(uuid.uuid4()), company_id=company.id, title=title, status=status, visibility=visibility,
        description="Descrição", location="Luanda",
    )
    db.add(job)
    db.commit()
    return job


def test_slugify_and_collision_suffix(db):
    _make_company(db, name="Acme")
    slug2 = generate_unique_slug(db, Company, "Acme")
    assert slug2 != "acme"
    assert slug2.startswith("acme-")


def test_active_company_public_page_returns_trimmed_payload(db):
    company = _make_company(db)
    _make_job(db, company)

    result = asyncio.run(get_public_company(company.slug, db=db))
    payload = result["company"]
    assert payload["name"] == "Acme Angola"
    assert "contactEmail" not in payload
    assert "contactPhone" not in payload
    assert "ownerUserId" not in payload
    assert "email" not in payload
    assert "phone" not in payload
    assert result["totalJobs"] == 1
    assert len(result["jobs"]) == 1


def test_pending_verification_company_404s(db):
    company = _make_company(db, status="pending_verification")
    with pytest.raises(HTTPException) as exc:
        asyncio.run(get_public_company(company.slug, db=db))
    assert exc.value.status_code == 404


def test_suspended_company_404s(db):
    company = _make_company(db, status="suspended")
    with pytest.raises(HTTPException) as exc:
        asyncio.run(get_public_company(company.slug, db=db))
    assert exc.value.status_code == 404


def test_nonexistent_slug_404s(db):
    with pytest.raises(HTTPException) as exc:
        asyncio.run(get_public_company("does-not-exist", db=db))
    assert exc.value.status_code == 404


def test_jobs_scoped_to_company_and_public_statuses_only(db):
    company = _make_company(db)
    other = _make_company(db, name="Other Co")
    _make_job(db, company, title="Own job")
    _make_job(db, other, title="Other company's job")
    _make_job(db, company, status="draft", title="Draft job")

    result = asyncio.run(get_public_company(company.slug, db=db))
    titles = {j["title"] for j in result["jobs"]}
    assert titles == {"Own job"}


def test_list_public_jobs_company_id_filter(db):
    company = _make_company(db)
    other = _make_company(db, name="Other Co 2")
    _make_job(db, company, title="A")
    _make_job(db, other, title="B")

    result = asyncio.run(list_public_jobs(
        request=_FakeRequest(), page=1, limit=20, companyId=company.id, db=db,
    ))
    titles = {j["title"] for j in result["jobs"]}
    assert titles == {"A"}
