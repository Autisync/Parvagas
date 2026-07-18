"""Tests for EmailLog — send_templated_email previously recorded nothing
about which template was sent, to whom (hashed), or whether it succeeded.
_log_email_attempt() (called from send_templated_email, the single
dispatcher every templated email in the app goes through) now writes one
EmailLog row per attempt.

Monkeypatches app.db.session.SessionLocal to a sessionmaker bound to the
test db's engine — _log_email_attempt does a local `from app.db.session
import SessionLocal` inside its own function body, so patching the module
attribute is picked up at call time (same pattern as test_llm_service_metering.py).

send_templated_email is called with exactly its two declared args (method,
payload) — it's a real bound celery task (celery.local.PromiseProxy), and
celery auto-supplies `self` when the proxy is called directly, same as
through .delay()/.apply_async().
"""
import hashlib

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.base import Base
from app.models import EmailLog
from app.services.email_service import EmailService
import app.workers.tasks as tasks


@pytest.fixture()
def db(monkeypatch):
    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    import app.db.session as db_session_module
    monkeypatch.setattr(db_session_module, "SessionLocal", sessionmaker(bind=engine))
    yield session
    session.close()


def test_successful_send_logs_success_with_hashed_recipient(db, monkeypatch):
    monkeypatch.setattr(EmailService, "send_job_approved_email", staticmethod(lambda **k: True))

    tasks.send_templated_email("send_job_approved_email", {"email": "Someone@Example.com", "job_title": "X"})

    log = db.query(EmailLog).filter(EmailLog.template == "send_job_approved_email").first()
    assert log is not None
    assert log.success is True
    assert log.recipient_hash == hashlib.sha256(b"someone@example.com").hexdigest()
    assert log.error is None


def test_failed_send_logs_failure_and_still_raises(db, monkeypatch):
    monkeypatch.setattr(EmailService, "send_job_rejected_email", staticmethod(lambda **k: False))

    with pytest.raises(RuntimeError):
        tasks.send_templated_email("send_job_rejected_email", {"email": "fail@example.com"})

    log = db.query(EmailLog).filter(EmailLog.template == "send_job_rejected_email").first()
    assert log is not None
    assert log.success is False
    assert log.error and "send failed" in log.error


def test_missing_recipient_logs_null_hash(db, monkeypatch):
    monkeypatch.setattr(EmailService, "send_security_alert_email", staticmethod(lambda **k: True))

    tasks.send_templated_email("send_security_alert_email", {"subject": "x", "title": "y", "lines": []})

    log = db.query(EmailLog).filter(EmailLog.template == "send_security_alert_email").first()
    assert log is not None
    assert log.recipient_hash is None


def test_logging_failure_never_breaks_the_send(monkeypatch):
    """Without the db fixture's SessionLocal patch, _log_email_attempt's
    own SessionLocal() call hits whatever the unpatched module resolves
    to — must not raise out of send_templated_email either way."""
    monkeypatch.setattr(EmailService, "send_admin_company_pending_email", staticmethod(lambda **k: True))

    result = tasks.send_templated_email("send_admin_company_pending_email", {"email": "x@example.com"})

    assert result is True
