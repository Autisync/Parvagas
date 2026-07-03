"""Tests for the daily scraped-jobs digest email.

Uses its own isolated in-memory SQLite engine (monkeypatched into
app.workers.tasks.SessionLocal) rather than the shared app-wide engine other
test files use — this task counts ALL pending ScrapedJob rows and ALL admin
users, so it's sensitive to cross-test-file leakage in a way most other
tests here aren't."""
import uuid

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

import app.workers.tasks as tasks
from app.db.base import Base
from app.models import User, UserRole, ScrapedJob


@pytest.fixture()
def db(monkeypatch):
    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    monkeypatch.setattr(tasks, "SessionLocal", lambda: session)
    yield session
    session.close()


def _make_admin(db, email=None):
    admin = User(
        id=str(uuid.uuid4()), email=email or f"admin-{uuid.uuid4()}@parvagas.pt",
        full_name="Admin", password_hash="x", role=UserRole.admin,
    )
    db.add(admin)
    db.flush()
    return admin


def _make_scraped(db, status="pending"):
    s = ScrapedJob(id=str(uuid.uuid4()), title="Vaga", status=status)
    db.add(s)
    db.flush()
    return s


def test_skips_send_when_nothing_pending(db, monkeypatch):
    calls = []
    monkeypatch.setattr(tasks.EmailService, "send_scraped_jobs_digest_email", lambda *a, **k: calls.append(a) or True)

    _make_admin(db)
    db.commit()

    result = tasks.dispatch_scraped_jobs_digest()

    assert result["pendingCount"] == 0
    assert result["sent"] == 0
    assert calls == []


def test_sends_digest_to_every_admin_when_jobs_are_pending(db, monkeypatch):
    calls = []
    monkeypatch.setattr(
        tasks.EmailService, "send_scraped_jobs_digest_email",
        lambda email, count, *a, **k: calls.append((email, count)) or True,
    )

    admin1 = _make_admin(db, email="admin1@parvagas.pt")
    admin2 = _make_admin(db, email="admin2@parvagas.pt")
    _make_scraped(db, status="pending")
    _make_scraped(db, status="pending")
    _make_scraped(db, status="approved")  # not counted
    db.commit()

    result = tasks.dispatch_scraped_jobs_digest()

    assert result["pendingCount"] == 2
    assert result["sent"] == 2
    recipients = {c[0] for c in calls}
    assert recipients == {admin1.email, admin2.email}
    assert all(c[1] == 2 for c in calls)


def test_does_not_query_recipients_when_nothing_pending(db, monkeypatch):
    """Skip path shouldn't even touch admin_emails() — cheap no-op."""
    called = []
    monkeypatch.setattr(
        "app.services.notification_service.admin_emails",
        lambda db: called.append(True) or [],
    )
    result = tasks.dispatch_scraped_jobs_digest()
    assert result["pendingCount"] == 0
    assert called == []
