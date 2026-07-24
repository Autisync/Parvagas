"""Tests for the Plan/PlanVersion versioning service — mirrors
legal_service.py's tests in spirit. Draft upsert, publish semantics
(archive-prior + sync Plan's mirrored columns), and current-version
resolution.
"""
import uuid

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.base import Base
from app.models import Plan
from app.services import plan_service


@pytest.fixture()
def db():
    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()


def _make_plan(db, *, code="business", name="Business", price=75000, max_active_jobs=-1):
    plan = Plan(
        id=str(uuid.uuid4()), code=code, name=name, price=price, currency="AOA", interval="month",
        max_active_jobs=max_active_jobs, candidate_search_included=True, api_access_included=True,
    )
    db.add(plan)
    db.commit()
    return plan


def test_draft_upsert_does_not_duplicate(db):
    plan = _make_plan(db)
    v1 = plan_service.create_draft_version(db, plan_id=plan.id, name="Business", price=80000)
    v2 = plan_service.create_draft_version(db, plan_id=plan.id, price=85000)
    assert v1.id == v2.id
    assert v2.price == 85000
    assert len(plan_service.list_versions(db, plan.id)) == 1


def test_publish_archives_prior_and_syncs_plan(db):
    plan = _make_plan(db)
    v1 = plan_service.create_draft_version(db, plan_id=plan.id, name="Business", price=75000, currency="AOA", interval="month", max_active_jobs=-1, candidate_search_included=True, api_access_included=True)
    plan_service.publish_plan_version(db, v1)

    v2 = plan_service.create_draft_version(db, plan_id=plan.id, max_active_jobs=10)
    plan_service.publish_plan_version(db, v2)

    db.refresh(v1)
    db.refresh(plan)
    assert v1.status == "archived"
    assert v2.status == "published"
    assert plan.max_active_jobs == 10  # synced from newly published version


def test_get_current_version_by_code(db):
    plan = _make_plan(db, code="starter", max_active_jobs=5)
    v1 = plan_service.create_draft_version(db, plan_id=plan.id, name="Starter", price=25000, currency="AOA", interval="month", max_active_jobs=5, candidate_search_included=False, api_access_included=False)
    plan_service.publish_plan_version(db, v1)

    current = plan_service.get_current_version_by_code(db, "starter")
    assert current is not None
    assert current.id == v1.id
    assert plan_service.get_current_version_by_code(db, "nonexistent") is None
