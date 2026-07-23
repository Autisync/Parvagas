"""Tests for overnight-audit W-extra — bulk status updates on the ATS
pipeline. Previously triaging a stack of applications meant clicking
through each one individually; PATCH /applications/bulk-status moves
several at once with the same permission/status rules as the single
endpoint.
"""
import asyncio
import uuid

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.base import Base
from app.models import Company, CompanyMember, Job, JobApplication, User, UserRole
from app.api.v1.applications import bulk_update_application_status


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


def _make_applications(db, company, job, n):
    apps = []
    for i in range(n):
        app_row = JobApplication(
            job_id=job.id, company_id=company.id,
            applicant_full_name=f"Cand {i}", applicant_email=f"cand{i}@x.com",
        )
        db.add(app_row)
        apps.append(app_row)
    db.commit()
    return apps


def test_bulk_update_moves_all_selected(db):
    owner, company = _make_owner_and_company(db)
    job = Job(company_id=company.id, title="Vaga", status="approved", visibility="public")
    db.add(job)
    db.flush()
    apps = _make_applications(db, company, job, 3)
    db.commit()

    result = asyncio.run(bulk_update_application_status(
        {"applicationIds": [a.id for a in apps], "status": "shortlisted"}, db=db, current_user=owner,
    ))
    assert result["updated"] == 3
    for a in apps:
        db.refresh(a)
        assert a.status == "shortlisted"


def test_bulk_update_skips_ids_outside_callers_company(db):
    owner, company = _make_owner_and_company(db)
    other_owner, other_company = _make_owner_and_company(db)
    job = Job(company_id=company.id, title="Vaga", status="approved", visibility="public")
    other_job = Job(company_id=other_company.id, title="Outra vaga", status="approved", visibility="public")
    db.add_all([job, other_job])
    db.flush()
    mine = _make_applications(db, company, job, 1)
    other = _make_applications(db, other_company, other_job, 1)
    db.commit()

    result = asyncio.run(bulk_update_application_status(
        {"applicationIds": [mine[0].id, other[0].id], "status": "rejected"}, db=db, current_user=owner,
    ))
    assert result["updated"] == 1
    db.refresh(other[0])
    assert other[0].status != "rejected"


def test_viewer_cannot_bulk_update(db):
    owner, company = _make_owner_and_company(db)
    viewer_user = User(id=str(uuid.uuid4()), email="viewer@x.com", full_name="Viewer", password_hash="x", role=UserRole.company)
    db.add(viewer_user)
    db.flush()
    db.add(CompanyMember(company_id=company.id, user_id=viewer_user.id, role="viewer"))
    job = Job(company_id=company.id, title="Vaga", status="approved", visibility="public")
    db.add(job)
    db.flush()
    apps = _make_applications(db, company, job, 1)
    db.commit()

    with pytest.raises(HTTPException) as exc:
        asyncio.run(bulk_update_application_status(
            {"applicationIds": [apps[0].id], "status": "rejected"}, db=db, current_user=viewer_user,
        ))
    assert exc.value.status_code == 403


def test_bulk_update_rejects_empty_list(db):
    owner, company = _make_owner_and_company(db)
    with pytest.raises(HTTPException) as exc:
        asyncio.run(bulk_update_application_status({"applicationIds": [], "status": "rejected"}, db=db, current_user=owner))
    assert exc.value.status_code == 400


def test_bulk_update_rejects_invalid_status(db):
    owner, company = _make_owner_and_company(db)
    job = Job(company_id=company.id, title="Vaga", status="approved", visibility="public")
    db.add(job)
    db.flush()
    apps = _make_applications(db, company, job, 1)
    db.commit()

    with pytest.raises(HTTPException) as exc:
        asyncio.run(bulk_update_application_status(
            {"applicationIds": [apps[0].id], "status": "not-a-real-status"}, db=db, current_user=owner,
        ))
    assert exc.value.status_code == 400
