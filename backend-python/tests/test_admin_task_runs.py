"""Tests for the admin task-heartbeat panel — GET /admin/task-runs reports
last-run status for every celery-beat scheduled task, generalizing
ScraperSource.last_run_* (scoped only to the scraper) to all 9 tasks.
"""
import asyncio
import uuid
from datetime import datetime, timedelta

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.base import Base
from app.models import TaskRun, User, UserRole
from app.api.v1.admin import admin_task_runs, _SCHEDULED_TASK_NAMES


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


def test_reports_never_run_when_no_task_run_rows(db):
    admin = _make_admin(db)

    result = asyncio.run(admin_task_runs(db=db, current_user=admin))

    assert len(result["tasks"]) == len(_SCHEDULED_TASK_NAMES)
    assert all(t["lastRun"]["status"] == "never_run" for t in result["tasks"])


def test_reports_most_recent_run_per_task(db):
    admin = _make_admin(db)
    older = datetime.utcnow() - timedelta(days=1)
    newer = datetime.utcnow()
    db.add(TaskRun(task_name="cleanup_expired_tokens", started_at=older, finished_at=older, status="success", detail="old"))
    db.add(TaskRun(task_name="cleanup_expired_tokens", started_at=newer, finished_at=newer, status="success", detail="new"))
    db.commit()

    result = asyncio.run(admin_task_runs(db=db, current_user=admin))

    entry = next(t for t in result["tasks"] if t["taskName"] == "cleanup_expired_tokens")
    assert entry["lastRun"]["detail"] == "new"
    assert entry["lastRun"]["status"] == "success"


def test_reports_failed_status(db):
    admin = _make_admin(db)
    db.add(TaskRun(task_name="run_hibp_breach_scan", started_at=datetime.utcnow(), finished_at=datetime.utcnow(), status="failed", detail="boom"))
    db.commit()

    result = asyncio.run(admin_task_runs(db=db, current_user=admin))

    entry = next(t for t in result["tasks"] if t["taskName"] == "run_hibp_breach_scan")
    assert entry["lastRun"]["status"] == "failed"
    assert entry["lastRun"]["detail"] == "boom"


def test_reports_running_status_for_in_progress_task(db):
    admin = _make_admin(db)
    db.add(TaskRun(task_name="scrape_external_jobs", started_at=datetime.utcnow(), status="running"))
    db.commit()

    result = asyncio.run(admin_task_runs(db=db, current_user=admin))

    entry = next(t for t in result["tasks"] if t["taskName"] == "scrape_external_jobs")
    assert entry["lastRun"]["status"] == "running"
    assert entry["lastRun"]["finishedAt"] is None
