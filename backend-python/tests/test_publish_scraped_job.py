"""Tests for _publish_scraped_job / _aggregator_company against a real
in-memory SQLite DB — these two functions do genuine ORM work (query, flush,
FK relationships) that SimpleNamespace fakes can't faithfully stand in for."""
import asyncio
import uuid
from datetime import datetime, timedelta

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.base import Base
from app.models import User, UserRole, Company, Job, ScrapedJob
from app.api.v1.admin import _publish_scraped_job, _aggregator_company, admin_review_scraped


@pytest.fixture()
def db():
    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()


def _make_admin(db):
    admin = User(
        id=str(uuid.uuid4()), email="admin@parvagas.pt", full_name="Admin",
        password_hash="x", role=UserRole.admin,
    )
    db.add(admin)
    db.flush()
    return admin


def _make_scraped(db, **over):
    base = dict(
        id=str(uuid.uuid4()), title="Credit Analyst Manager", company_name="Webcor Group",
        location="Luanda", category="Banca e Seguros", description="Full description",
        status="pending",
    )
    base.update(over)
    s = ScrapedJob(**base)
    db.add(s)
    db.flush()
    return s


def test_aggregator_company_created_once_and_reused(db):
    admin = _make_admin(db)
    co1 = _aggregator_company(db, admin)
    co2 = _aggregator_company(db, admin)
    assert co1.id == co2.id
    assert co1.name == "Parvagas Aggregator"


def test_aggregator_company_falls_back_to_any_admin_when_none_passed(db):
    admin = _make_admin(db)
    co = _aggregator_company(db, None)
    assert co.owner_user_id == admin.id


def test_publish_scraped_job_creates_job_and_links_it(db):
    admin = _make_admin(db)
    s = _make_scraped(db)
    job = _publish_scraped_job(db, s, admin)
    db.commit()

    assert job.id is not None
    assert job.title == "Credit Analyst Manager"
    assert job.external_company_name == "Webcor Group"
    assert job.status == "approved"
    assert job.visibility == "public"
    assert s.published_job_id == job.id
    assert s.status == "approved"
    assert s.expires_at is not None  # 45-day fallback applied


def test_publish_scraped_job_reuses_aggregator_company(db):
    admin = _make_admin(db)
    s1 = _make_scraped(db, title="Job A")
    s2 = _make_scraped(db, title="Job B")
    job1 = _publish_scraped_job(db, s1, admin)
    job2 = _publish_scraped_job(db, s2, admin)
    assert job1.company_id == job2.company_id


# ---- admin_review_scraped: "schedule" decision ----

def test_review_schedule_sets_status_and_scheduled_time(db):
    admin = _make_admin(db)
    s = _make_scraped(db)
    future = (datetime.utcnow() + timedelta(days=2)).isoformat()

    result = asyncio.run(admin_review_scraped(
        scraped_id=s.id, payload={"status": "schedule", "scheduledPublishAt": future},
        db=db, current_user=admin,
    ))

    assert result["scraped"]["status"] == "scheduled"
    assert s.published_job_id is None  # not published yet — only scheduled


def test_review_schedule_rejects_missing_datetime(db):
    admin = _make_admin(db)
    s = _make_scraped(db)
    with pytest.raises(HTTPException) as exc:
        asyncio.run(admin_review_scraped(
            scraped_id=s.id, payload={"status": "schedule"}, db=db, current_user=admin,
        ))
    assert exc.value.status_code == 400


def test_review_schedule_rejects_past_datetime(db):
    admin = _make_admin(db)
    s = _make_scraped(db)
    past = (datetime.utcnow() - timedelta(days=1)).isoformat()
    with pytest.raises(HTTPException) as exc:
        asyncio.run(admin_review_scraped(
            scraped_id=s.id, payload={"status": "schedule", "scheduledPublishAt": past},
            db=db, current_user=admin,
        ))
    assert exc.value.status_code == 400


def test_review_schedule_rejects_already_published(db):
    admin = _make_admin(db)
    s = _make_scraped(db)
    _publish_scraped_job(db, s, admin)
    db.commit()
    future = (datetime.utcnow() + timedelta(days=2)).isoformat()
    with pytest.raises(HTTPException) as exc:
        asyncio.run(admin_review_scraped(
            scraped_id=s.id, payload={"status": "schedule", "scheduledPublishAt": future},
            db=db, current_user=admin,
        ))
    assert exc.value.status_code == 400
