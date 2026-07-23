"""Test for overnight-audit W-extra — the application-specific cover
letter a candidate wrote was silently overwritten by their profile's
generic professional_summary the moment they had one, with the UI
showing a single undifferentiated "Resumo" field either way. The
candidate-cv endpoint now returns coverLetter and summary as distinct
fields.
"""
import asyncio
import uuid

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.base import Base
from app.models import CandidateProfile, Company, Job, JobApplication, User, UserRole
from app.api.v1.applications import application_candidate_cv


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


def test_cover_letter_survives_alongside_profile_summary(db):
    owner, company = _make_owner_and_company(db)
    job = Job(company_id=company.id, title="Vaga", status="approved", visibility="public")
    candidate_user = User(id=str(uuid.uuid4()), email="cand@x.com", full_name="Cand", password_hash="x", role=UserRole.candidate)
    db.add_all([job, candidate_user])
    db.flush()
    db.add(CandidateProfile(user_id=candidate_user.id, professional_summary="Sou um profissional dedicado com 5 anos de experiência."))
    app_row = JobApplication(
        job_id=job.id, company_id=company.id, candidate_user_id=candidate_user.id,
        applicant_full_name="Cand", applicant_email="cand@x.com",
        cover_letter="Escrevo para candidatar-me especificamente a esta vaga de Engenheiro.",
    )
    db.add(app_row)
    db.commit()

    result = asyncio.run(application_candidate_cv(app_row.id, db=db, current_user=owner))
    candidate = result["candidate"]
    assert candidate["coverLetter"] == "Escrevo para candidatar-me especificamente a esta vaga de Engenheiro."
    assert candidate["summary"] == "Sou um profissional dedicado com 5 anos de experiência."


def test_cover_letter_present_without_profile(db):
    owner, company = _make_owner_and_company(db)
    job = Job(company_id=company.id, title="Vaga", status="approved", visibility="public")
    db.add(job)
    db.flush()
    app_row = JobApplication(
        job_id=job.id, company_id=company.id,
        applicant_full_name="Guest", applicant_email="guest@x.com",
        cover_letter="Interesse na vaga.",
    )
    db.add(app_row)
    db.commit()

    result = asyncio.run(application_candidate_cv(app_row.id, db=db, current_user=owner))
    candidate = result["candidate"]
    assert candidate["coverLetter"] == "Interesse na vaga."
    assert candidate["summary"] is None
