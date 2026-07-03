"""Tests for the scheduled-publish sweep task, against the app's real
SessionLocal (bound to an in-memory SQLite DB per conftest's DATABASE_URL)."""
import uuid
from datetime import datetime, timedelta

from app.db.base import Base
from app.db.session import engine, SessionLocal
from app.models import User, UserRole, ScrapedJob
from app.workers.tasks import publish_scheduled_scraped_jobs

Base.metadata.create_all(engine)


def _make_admin(db):
    admin = User(
        id=str(uuid.uuid4()), email=f"admin-{uuid.uuid4()}@parvagas.pt", full_name="Admin",
        password_hash="x", role=UserRole.admin,
    )
    db.add(admin)
    db.flush()
    return admin


def _make_scraped(db, **over):
    base = dict(
        id=str(uuid.uuid4()), title="Vaga Teste", company_name="Empresa Teste",
        location="Luanda", status="scheduled",
    )
    base.update(over)
    s = ScrapedJob(**base)
    db.add(s)
    db.flush()
    return s


def test_publishes_jobs_whose_scheduled_time_has_arrived():
    db = SessionLocal()
    try:
        _make_admin(db)
        due = _make_scraped(db, title="Due Job", scheduled_publish_at=datetime.utcnow() - timedelta(minutes=5))
        db.commit()
        due_id = due.id

        result = publish_scheduled_scraped_jobs()

        assert result["published"] == 1
        db.expire_all()
        refreshed = db.query(ScrapedJob).filter(ScrapedJob.id == due_id).first()
        assert refreshed.status == "approved"
        assert refreshed.published_job_id is not None
    finally:
        db.close()


def test_does_not_publish_jobs_scheduled_in_the_future():
    db = SessionLocal()
    try:
        _make_admin(db)
        future = _make_scraped(db, title="Future Job", scheduled_publish_at=datetime.utcnow() + timedelta(days=1))
        db.commit()
        future_id = future.id

        publish_scheduled_scraped_jobs()

        db.expire_all()
        refreshed = db.query(ScrapedJob).filter(ScrapedJob.id == future_id).first()
        assert refreshed.status == "scheduled"
        assert refreshed.published_job_id is None
    finally:
        db.close()


def test_skips_non_scheduled_jobs_even_if_time_field_is_set():
    db = SessionLocal()
    try:
        _make_admin(db)
        pending = _make_scraped(
            db, title="Still Pending", status="pending",
            scheduled_publish_at=datetime.utcnow() - timedelta(minutes=5),
        )
        db.commit()
        pending_id = pending.id

        publish_scheduled_scraped_jobs()

        db.expire_all()
        refreshed = db.query(ScrapedJob).filter(ScrapedJob.id == pending_id).first()
        assert refreshed.status == "pending"
        assert refreshed.published_job_id is None
    finally:
        db.close()
