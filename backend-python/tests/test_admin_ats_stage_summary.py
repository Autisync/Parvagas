"""Tests for the admin read-only ATS pipeline rollup — companies own their
own ATSStage rows, so this aggregates pipeline item counts by stage NAME
across every company rather than a single shared stage id.
"""
import asyncio
import uuid

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.base import Base
from app.models import ATSPipelineItem, ATSStage, Company, JobApplication, User, UserRole
from app.api.v1.admin import admin_ats_stage_summary


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
    company = Company(owner_user_id=owner.id, name="Acme", status="active")
    db.add(company)
    db.commit()
    return company


def test_summary_aggregates_counts_across_companies_by_stage_name(db):
    admin = _make_admin(db)
    company1 = _make_company(db)
    company2 = _make_company(db)
    stage1 = ATSStage(company_id=company1.id, name="Novo", position=0)
    stage2 = ATSStage(company_id=company2.id, name="Novo", position=0)
    db.add_all([stage1, stage2])
    db.commit()
    db.add_all([
        ATSPipelineItem(company_id=company1.id, stage_id=stage1.id),
        ATSPipelineItem(company_id=company1.id, stage_id=stage1.id),
        ATSPipelineItem(company_id=company2.id, stage_id=stage2.id),
    ])
    db.commit()

    result = asyncio.run(admin_ats_stage_summary(db=db, current_user=admin))

    novo = next(s for s in result["stages"] if s["name"] == "Novo")
    assert novo["count"] == 3
    assert result["totalPipelineItems"] == 3
    assert result["companiesWithPipeline"] == 2


def test_summary_includes_stages_with_zero_items(db):
    admin = _make_admin(db)
    company = _make_company(db)
    db.add(ATSStage(company_id=company.id, name="Contratado", position=5))
    db.commit()

    result = asyncio.run(admin_ats_stage_summary(db=db, current_user=admin))

    contratado = next(s for s in result["stages"] if s["name"] == "Contratado")
    assert contratado["count"] == 0


def test_summary_empty_when_no_data(db):
    admin = _make_admin(db)
    result = asyncio.run(admin_ats_stage_summary(db=db, current_user=admin))
    assert result["stages"] == []
    assert result["totalPipelineItems"] == 0
    assert result["companiesWithPipeline"] == 0
