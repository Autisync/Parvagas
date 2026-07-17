"""Tests for the admin CSV export endpoint — the 'jobs' kind used to write
only a header row and never query, producing an empty file for every export.
"""
import asyncio
import uuid

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.base import Base
from app.models import Company, Job, User, UserRole
from app.api.v1.admin import admin_export_csv


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


def test_jobs_export_includes_every_job(db):
    admin = _make_admin(db)
    owner = User(id=str(uuid.uuid4()), email="owner@x.com", full_name="Owner", password_hash="x", role=UserRole.company)
    db.add(owner)
    db.flush()
    company = Company(owner_user_id=owner.id, name="Acme", status="active")
    db.add(company)
    db.flush()
    db.add(Job(company_id=company.id, title="Vaga Um", status="approved", visibility="public"))
    db.add(Job(company_id=company.id, title="Vaga Dois", status="pending_platform_review", visibility="private"))
    db.commit()

    response = asyncio.run(admin_export_csv("jobs", from_date=None, to_date=None, db=db, current_user=admin))
    body = response.body.decode("utf-8")

    assert "Vaga Um" in body
    assert "Vaga Dois" in body
    assert "id,title,status,visibility,companyId,createdAt" in body


def test_jobs_export_empty_when_no_jobs(db):
    admin = _make_admin(db)
    response = asyncio.run(admin_export_csv("jobs", from_date=None, to_date=None, db=db, current_user=admin))
    body = response.body.decode("utf-8")
    lines = [line for line in body.strip().split("\r\n") if line]
    assert lines == ["id,title,status,visibility,companyId,createdAt"]
