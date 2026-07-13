"""Tests for security event recording, burst detection, and alert throttling.

Added after the 2026-07-09 no-reply@ SMTP credential compromise. The
load-bearing guarantees:
- failed logins are recorded with account + IP + user-agent,
- a burst for one account/IP records a high-severity event and emails the
  admins exactly once per cooldown window,
- security bookkeeping never raises into the caller (login must not break),
- the outbound email cap blocks non-priority sends but never security alerts.
"""
import json

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.base import Base
from app.models import SecurityEvent
from app.services import security_service
from app.services.email_service import EmailService


@pytest.fixture()
def db():
    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()


@pytest.fixture()
def sent_alerts(monkeypatch):
    """Capture security alert emails instead of touching SMTP."""
    calls: list[dict] = []

    def _fake_alert(subject: str, title: str, lines: list[str]) -> bool:
        calls.append({"subject": subject, "title": title, "lines": lines})
        return True

    monkeypatch.setattr(EmailService, "send_security_alert_email", staticmethod(_fake_alert))
    return calls


def test_record_security_event_persists_row(db):
    event = security_service.record_security_event(
        db, event_type="failed_login", severity="low",
        email="Victim@Example.com", ip_address="1.2.3.4", user_agent="curl/8",
        details={"reason": "bad password"},
    )
    assert event is not None
    row = db.query(SecurityEvent).one()
    assert row.event_type == "failed_login"
    assert row.email == "victim@example.com"  # normalised
    assert row.ip_address == "1.2.3.4"
    assert json.loads(row.details)["reason"] == "bad password"


def test_record_security_event_never_raises(db, monkeypatch):
    monkeypatch.setattr(db, "commit", lambda: (_ for _ in ()).throw(RuntimeError("db down")))
    assert security_service.record_security_event(db, event_type="failed_login") is None


def test_failed_logins_below_threshold_do_not_alert(db, sent_alerts, monkeypatch):
    monkeypatch.setattr(security_service.settings, "SECURITY_FAILED_LOGIN_BURST_THRESHOLD", 5)
    for _ in range(4):
        security_service.record_failed_login(
            db, email="a@b.com", ip_address="9.9.9.9", user_agent="x", reason="bad pw",
        )
    assert sent_alerts == []
    assert db.query(SecurityEvent).filter(SecurityEvent.event_type == "login_burst").count() == 0


def test_failed_login_burst_records_event_and_alerts_once(db, sent_alerts, monkeypatch):
    monkeypatch.setattr(security_service.settings, "SECURITY_FAILED_LOGIN_BURST_THRESHOLD", 5)
    for _ in range(7):
        security_service.record_failed_login(
            db, email="victim@example.com", ip_address="9.9.9.9", user_agent="x", reason="bad pw",
        )
    # Burst events recorded (per email and per IP dimension)...
    assert db.query(SecurityEvent).filter(SecurityEvent.event_type == "login_burst").count() >= 1
    # ...but the cooldown means alerts are NOT re-sent on attempts 6 and 7.
    email_alerts = [a for a in sent_alerts if "victim@example.com" in " ".join(a["lines"])]
    assert len(email_alerts) == 1
    # And the alert dispatch itself is recorded as an event.
    assert db.query(SecurityEvent).filter(SecurityEvent.event_type == "alert_sent").count() >= 1


def test_burst_detection_by_ip_across_many_accounts(db, sent_alerts, monkeypatch):
    """Credential-stuffing pattern: one IP, a different account per attempt."""
    monkeypatch.setattr(security_service.settings, "SECURITY_FAILED_LOGIN_BURST_THRESHOLD", 5)
    for i in range(5):
        security_service.record_failed_login(
            db, email=f"user{i}@example.com", ip_address="6.6.6.6", user_agent="bot", reason="bad pw",
        )
    ip_alerts = [a for a in sent_alerts if "6.6.6.6" in " ".join(a["lines"])]
    assert len(ip_alerts) == 1


def test_record_failed_login_swallows_alert_failures(db, monkeypatch):
    monkeypatch.setattr(security_service.settings, "SECURITY_FAILED_LOGIN_BURST_THRESHOLD", 1)
    monkeypatch.setattr(
        EmailService, "send_security_alert_email",
        staticmethod(lambda **kw: (_ for _ in ()).throw(RuntimeError("smtp down"))),
    )
    # Must not raise even though the alert path explodes.
    security_service.record_failed_login(
        db, email="a@b.com", ip_address="1.1.1.1", user_agent="x", reason="bad pw",
    )
    assert db.query(SecurityEvent).filter(SecurityEvent.event_type == "failed_login").count() == 1


class _FakeRedis:
    def __init__(self, start: int = 0):
        self.count = start
        self.expired = False

    def incr(self, key):
        self.count += 1
        return self.count

    def expire(self, key, ttl):
        self.expired = True


def test_outbound_cap_allows_under_limit(monkeypatch):
    from app.services import email_service as es
    monkeypatch.setattr(es.settings, "EMAIL_MAX_PER_HOUR", 10)
    fake = _FakeRedis(start=3)
    monkeypatch.setattr(
        "redis.Redis", type("R", (), {"from_url": staticmethod(lambda *a, **k: fake)})
    )
    assert EmailService._check_outbound_rate_limit("x@y.com") is True


def test_outbound_cap_blocks_over_limit_and_records_event(monkeypatch):
    from app.services import email_service as es
    monkeypatch.setattr(es.settings, "EMAIL_MAX_PER_HOUR", 10)
    recorded = []
    monkeypatch.setattr(
        security_service, "record_email_rate_limit_hit",
        lambda **kw: recorded.append(kw),
    )
    fake = _FakeRedis(start=10)  # next incr -> 11 (first over the cap)
    monkeypatch.setattr(
        "redis.Redis", type("R", (), {"from_url": staticmethod(lambda *a, **k: fake)})
    )
    assert EmailService._check_outbound_rate_limit("x@y.com") is False
    assert recorded and recorded[0]["sent_this_hour"] == 11


def test_outbound_cap_fails_open_when_redis_unreachable(monkeypatch):
    from app.services import email_service as es
    monkeypatch.setattr(es.settings, "EMAIL_MAX_PER_HOUR", 10)
    monkeypatch.setattr(
        "redis.Redis",
        type("R", (), {"from_url": staticmethod(
            lambda *a, **k: (_ for _ in ()).throw(ConnectionError("no redis"))
        )}),
    )
    assert EmailService._check_outbound_rate_limit("x@y.com") is True


def test_outbound_cap_disabled_when_zero(monkeypatch):
    from app.services import email_service as es
    monkeypatch.setattr(es.settings, "EMAIL_MAX_PER_HOUR", 0)
    assert EmailService._check_outbound_rate_limit("x@y.com") is True


def test_priority_send_skips_rate_limit(monkeypatch):
    """Security alerts must never be suppressed by the cap they report on."""
    from app.services import email_service as es
    monkeypatch.setattr(es.settings, "EMAIL_MAX_PER_HOUR", 10)
    monkeypatch.setattr(
        EmailService, "_check_outbound_rate_limit",
        staticmethod(lambda to: (_ for _ in ()).throw(AssertionError("must not be called"))),
    )
    # Provider path: force resend + capture the payload.
    monkeypatch.setattr(es.settings, "EMAIL_PROVIDER", "resend")
    monkeypatch.setattr(es.settings, "RESEND_API_KEY", "test-key")
    sent = {}

    def _fake_resend(to_email, subject, html, cc=None):
        sent.update({"to": to_email, "cc": cc})
        return True

    monkeypatch.setattr(EmailService, "_send_via_resend", staticmethod(_fake_resend))
    assert EmailService._send_email("a@b.com", "s", "<p>x</p>", cc="c@d.com", priority=True) is True
    assert sent == {"to": "a@b.com", "cc": "c@d.com"}


def test_security_alert_email_goes_to_admin_cc_support(monkeypatch):
    from app.services import email_service as es
    monkeypatch.setattr(es.settings, "SECURITY_ALERT_EMAIL", "admin@parvagas.pt")
    monkeypatch.setattr(es.settings, "SECURITY_ALERT_CC", "support@parvagas.pt")
    monkeypatch.setattr(EmailService, "_email_enabled", staticmethod(lambda: True))
    captured = {}

    def _fake_send(to_email, subject, html, cc=None, priority=False):
        captured.update({"to": to_email, "cc": cc, "priority": priority, "subject": subject})
        return True

    monkeypatch.setattr(EmailService, "_send_email", staticmethod(_fake_send))
    ok = EmailService.send_security_alert_email(
        subject="teste", title="Título", lines=["linha um", "linha dois"],
    )
    assert ok is True
    assert captured["to"] == "admin@parvagas.pt"
    assert captured["cc"] == "support@parvagas.pt"
    assert captured["priority"] is True
