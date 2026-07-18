"""Tests for the no-account apply flow: guest tracking + external-employer
view-without-login. Covers the gap where jobs owned by the synthetic
"Parvagas Aggregator" company (scraped/external listings) had no real path
for the actual hiring company to ever see applications, and guest applicants
had no way to check status without an account.
"""
import asyncio
import io
import uuid
from datetime import datetime

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from starlette.datastructures import UploadFile

from app.db.base import Base
from app.models import Company, Job, JobApplication, User, UserRole
from app.api.v1.applications import submit_quick_apply, track_guest_application, view_external_job_applications


@pytest.fixture()
def db():
    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()


def _make_aggregator_job(db, **job_kwargs):
    owner = User(id=str(uuid.uuid4()), email=f"admin-{uuid.uuid4()}@parvagas.pt", full_name="Admin", password_hash="x", role=UserRole.admin)
    db.add(owner)
    db.flush()
    company = Company(owner_user_id=owner.id, name=f"Parvagas Aggregator {uuid.uuid4()}", status="active")
    db.add(company)
    db.flush()
    defaults = dict(
        company_id=company.id, title="Técnico de Manutenção", status="approved", visibility="public",
        source="Ango Emprego", external_company_name="Sonangol",
        external_contact_email="rh@sonangol.example", employer_access_token="job-token-abc",
    )
    defaults.update(job_kwargs)
    job = Job(**defaults)
    db.add(job)
    db.commit()
    return job


def test_track_guest_application_returns_status(db):
    job = _make_aggregator_job(db)
    app_row = JobApplication(
        job_id=job.id, company_id=job.company_id, candidate_user_id=None,
        applicant_full_name="Maria Guest", applicant_email="maria@example.com",
        profile_source="quick_apply", status="under_review", tracking_token="tok-123",
    )
    db.add(app_row)
    db.commit()

    result = asyncio.run(track_guest_application(token="tok-123", db=db))
    assert result["application"]["status"] == "under_review"
    assert result["application"]["job"]["title"] == "Técnico de Manutenção"
    assert result["application"]["companyName"] == "Sonangol"


def test_track_guest_application_unknown_token_404s(db):
    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(track_guest_application(token="does-not-exist", db=db))
    assert exc_info.value.status_code == 404


def test_track_guest_application_empty_token_400s(db):
    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(track_guest_application(token="", db=db))
    assert exc_info.value.status_code == 400


def test_view_external_job_applications_lists_all_applicants(db):
    job = _make_aggregator_job(db)
    for i in range(3):
        db.add(JobApplication(
            job_id=job.id, company_id=job.company_id, candidate_user_id=None,
            applicant_full_name=f"Candidate {i}", applicant_email=f"c{i}@example.com",
            profile_source="quick_apply", status="submitted",
        ))
    db.commit()

    result = asyncio.run(view_external_job_applications(job_id=job.id, token="job-token-abc", db=db))
    assert result["job"]["companyName"] == "Sonangol"
    assert len(result["applications"]) == 3


def test_view_external_job_applications_wrong_token_404s(db):
    job = _make_aggregator_job(db)
    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(view_external_job_applications(job_id=job.id, token="wrong-token", db=db))
    assert exc_info.value.status_code == 404


def test_view_external_job_applications_never_leaks_across_jobs(db):
    job1 = _make_aggregator_job(db, title="Job One", employer_access_token="token-one")
    job2 = _make_aggregator_job(db, title="Job Two", employer_access_token="token-two")
    db.add(JobApplication(
        job_id=job1.id, company_id=job1.company_id, applicant_full_name="A",
        applicant_email="a@example.com", profile_source="quick_apply", status="submitted",
    ))
    db.add(JobApplication(
        job_id=job2.id, company_id=job2.company_id, applicant_full_name="B",
        applicant_email="b@example.com", profile_source="quick_apply", status="submitted",
    ))
    db.commit()

    result = asyncio.run(view_external_job_applications(job_id=job1.id, token="token-one", db=db))
    names = [a["fullName"] for a in result["applications"]]
    assert names == ["A"]


# ── POST /public/jobs/{job_id}/quick-apply — fullName/email hardening ─────
# CSV/formula-injection (CWE-1236): these two fields flow unauthenticated
# straight into the "applications" admin CSV export (see test_admin_exports
# .py's neutralisation tests for the export-side defense-in-depth layer).
# Validation here rejects the payload outright, before it's ever stored.

class _FakeClient:
    host = "127.0.0.1"


class _FakeRequest:
    client = _FakeClient()
    headers = {}


def _dummy_cv():
    return UploadFile(filename="cv.pdf", file=io.BytesIO(b"dummy"), headers={"content-type": "application/pdf"})


@pytest.fixture(autouse=True)
def _pass_captcha(monkeypatch):
    async def _ok(*args, **kwargs):
        return True

    monkeypatch.setattr("app.core.captcha.verify_captcha", _ok)


def test_quick_apply_rejects_formula_shaped_full_name(db):
    job = _make_aggregator_job(db)
    with pytest.raises(HTTPException) as exc:
        asyncio.run(submit_quick_apply(
            request=_FakeRequest(), job_id=job.id, companyId=None,
            fullName='=HYPERLINK("http://evil.example","x")', email="ana@example.com",
            phone="900000000", location="Luanda", coverLetter="", cv=_dummy_cv(), db=db,
        ))
    assert exc.value.status_code == 400
    assert db.query(JobApplication).count() == 0


def test_quick_apply_rejects_formula_shaped_email(db):
    job = _make_aggregator_job(db)
    with pytest.raises(HTTPException) as exc:
        asyncio.run(submit_quick_apply(
            request=_FakeRequest(), job_id=job.id, companyId=None,
            fullName="Ana Sousa", email="=2+2@x.com",
            phone="900000000", location="Luanda", coverLetter="", cv=_dummy_cv(), db=db,
        ))
    assert exc.value.status_code == 400
    assert db.query(JobApplication).count() == 0


def test_quick_apply_rejects_malformed_email(db):
    job = _make_aggregator_job(db)
    with pytest.raises(HTTPException) as exc:
        asyncio.run(submit_quick_apply(
            request=_FakeRequest(), job_id=job.id, companyId=None,
            fullName="Ana Sousa", email="not-an-email",
            phone="900000000", location="Luanda", coverLetter="", cv=_dummy_cv(), db=db,
        ))
    assert exc.value.status_code == 400
    assert db.query(JobApplication).count() == 0


def test_quick_apply_rejects_excessively_long_full_name(db):
    job = _make_aggregator_job(db)
    with pytest.raises(HTTPException) as exc:
        asyncio.run(submit_quick_apply(
            request=_FakeRequest(), job_id=job.id, companyId=None,
            fullName="A" * 201, email="ana@example.com",
            phone="900000000", location="Luanda", coverLetter="", cv=_dummy_cv(), db=db,
        ))
    assert exc.value.status_code == 400
    assert db.query(JobApplication).count() == 0
