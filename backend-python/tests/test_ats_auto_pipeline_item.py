"""Tests that a new application auto-creates an ATS pipeline item in the
company's first stage — the plan's "new applications auto-create a
pipeline item" requirement, tested at the helper level rather than through
the full multipart submit_candidate_application/quick-apply endpoints.
"""
import uuid

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.base import Base
from app.models import ATSPipelineItem, ATSStage, CandidateProfile, Company, JobApplication, User, UserRole
from app.api.v1.applications import _auto_create_pipeline_item


@pytest.fixture()
def db():
    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()


def _make_company(db) -> Company:
    owner = User(id=str(uuid.uuid4()), email=f"owner-{uuid.uuid4()}@x.com", full_name="Owner", password_hash="x", role=UserRole.company)
    db.add(owner)
    db.flush()
    company = Company(owner_user_id=owner.id, name="Acme", status="active")
    db.add(company)
    db.commit()
    return company


def test_auto_creates_pipeline_item_in_first_stage(db):
    company = _make_company(db)
    application = JobApplication(
        job_id=str(uuid.uuid4()), company_id=company.id,
        applicant_full_name="Ana Sousa", applicant_email="ana@x.com", status="submitted",
    )
    db.add(application)
    db.commit()

    _auto_create_pipeline_item(db, application)

    item = db.query(ATSPipelineItem).filter(ATSPipelineItem.application_id == application.id).first()
    assert item is not None
    assert item.company_id == company.id
    stage = db.query(ATSStage).filter(ATSStage.id == item.stage_id).first()
    assert stage.position == min(s.position for s in db.query(ATSStage).filter(ATSStage.company_id == company.id).all())


def test_auto_creates_seeds_default_stages_if_none_exist(db):
    company = _make_company(db)
    assert db.query(ATSStage).filter(ATSStage.company_id == company.id).count() == 0
    application = JobApplication(
        job_id=str(uuid.uuid4()), company_id=company.id,
        applicant_full_name="Ana Sousa", applicant_email="ana@x.com", status="submitted",
    )
    db.add(application)
    db.commit()

    _auto_create_pipeline_item(db, application)

    assert db.query(ATSStage).filter(ATSStage.company_id == company.id).count() == 6


def test_auto_create_resolves_candidate_profile(db):
    company = _make_company(db)
    candidate_user = User(id=str(uuid.uuid4()), email="candidate@x.com", full_name="Cand", password_hash="x", role=UserRole.candidate)
    db.add(candidate_user)
    db.flush()
    profile = CandidateProfile(user_id=candidate_user.id)
    db.add(profile)
    application = JobApplication(
        job_id=str(uuid.uuid4()), company_id=company.id, candidate_user_id=candidate_user.id,
        applicant_full_name="Cand", applicant_email="candidate@x.com", status="submitted",
    )
    db.add(application)
    db.commit()

    _auto_create_pipeline_item(db, application)

    item = db.query(ATSPipelineItem).filter(ATSPipelineItem.application_id == application.id).first()
    assert item.candidate_profile_id == profile.id


def test_auto_create_noop_when_no_company_id(db):
    application = JobApplication(
        job_id=str(uuid.uuid4()), company_id=None,
        applicant_full_name="Ana Sousa", applicant_email="ana@x.com", status="submitted",
    )
    db.add(application)
    db.commit()

    _auto_create_pipeline_item(db, application)  # should not raise

    assert db.query(ATSPipelineItem).count() == 0


def test_auto_create_never_raises_when_company_missing(db):
    application = JobApplication(
        job_id=str(uuid.uuid4()), company_id=str(uuid.uuid4()),
        applicant_full_name="Ana Sousa", applicant_email="ana@x.com", status="submitted",
    )
    db.add(application)
    db.commit()

    _auto_create_pipeline_item(db, application)  # should not raise

    assert db.query(ATSPipelineItem).count() == 0
