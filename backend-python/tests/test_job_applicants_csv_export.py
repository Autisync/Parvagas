"""Tests for overnight-audit W-extra — CSV export of a single job's
applicant pool. Covers owner/recruiter access, viewer 403, and the
CSV/formula-injection guard on attacker-controllable applicant fields
(name/email/phone come from the public, unauthenticated apply form).
"""
import asyncio
import csv
import io
import uuid

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.base import Base
from app.models import Company, CompanyMember, Job, JobApplication, User, UserRole
from app.api.v1.companies import export_job_applicants_csv


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


def test_export_contains_applicant_rows(db):
    owner, company = _make_owner_and_company(db)
    job = Job(company_id=company.id, title="Engenheiro de Vendas", status="approved", visibility="public")
    db.add(job)
    db.flush()
    db.add(JobApplication(
        job_id=job.id, company_id=company.id, applicant_full_name="Ana", applicant_email="ana@x.com",
        applicant_phone="+244911111111", status="under_review",
    ))
    db.commit()

    response = asyncio.run(export_job_applicants_csv(job.id, db=db, current_user=owner))
    text = response.body.decode("utf-8")
    rows = list(csv.reader(io.StringIO(text)))
    assert rows[0] == ["nome", "email", "telefone", "estado", "dataCandidatura"]
    # Phone numbers start with "+", one of the same formula-injection trigger
    # chars Excel would evaluate — the guard (shared with admin.py's export)
    # prefixes a literal-text quote here too, same as it would for "=", "-", "@".
    assert rows[1][:4] == ["Ana", "ana@x.com", "'+244911111111", "under_review"]
    assert "candidaturas-engenheiro-de-vendas.csv" in response.headers["content-disposition"]


def test_export_neutralises_formula_injection(db):
    owner, company = _make_owner_and_company(db)
    job = Job(company_id=company.id, title="Vaga", status="approved", visibility="public")
    db.add(job)
    db.flush()
    db.add(JobApplication(
        job_id=job.id, company_id=company.id,
        applicant_full_name="=cmd|'/c calc'!A1", applicant_email="attacker@x.com",
    ))
    db.commit()

    response = asyncio.run(export_job_applicants_csv(job.id, db=db, current_user=owner))
    rows = list(csv.reader(io.StringIO(response.body.decode("utf-8"))))
    assert rows[1][0].startswith("'=")


def test_viewer_cannot_export(db):
    owner, company = _make_owner_and_company(db)
    viewer_user = User(id=str(uuid.uuid4()), email="viewer@x.com", full_name="Viewer", password_hash="x", role=UserRole.company)
    db.add(viewer_user)
    db.flush()
    db.add(CompanyMember(company_id=company.id, user_id=viewer_user.id, role="viewer"))
    job = Job(company_id=company.id, title="Vaga", status="approved", visibility="public")
    db.add(job)
    db.commit()

    with pytest.raises(HTTPException) as exc:
        asyncio.run(export_job_applicants_csv(job.id, db=db, current_user=viewer_user))
    assert exc.value.status_code == 403
