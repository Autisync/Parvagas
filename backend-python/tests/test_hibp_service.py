"""Tests for the Have I Been Pwned integration.

API shapes verified against https://haveibeenpwned.com/API/v3 (breachedaccount:
404 = clean, truncated response = [{"Name": ...}]; Pwned Passwords range:
SHA-1 k-anonymity, "SUFFIX:COUNT" lines). Load-bearing guarantees:
- no API key -> breach check returns None and the daily scan no-ops,
- API errors return None (callers treat as "couldn't check", never "safe"),
- the daily scan only records/alerts breaches NOT already recorded,
- password check is off by default and a FAILED check never blocks signup.
"""
import hashlib
import json
import uuid

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.base import Base
from app.models import SecurityEvent, User, UserRole
from app.services import hibp_service


class _FakeResponse:
    def __init__(self, status_code: int, json_data=None, text: str = "", headers=None):
        self.status_code = status_code
        self._json = json_data
        self.text = text
        self.headers = headers or {}

    def json(self):
        return self._json


@pytest.fixture()
def db():
    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()


def _user(db, email: str) -> User:
    user = User(
        email=email, full_name="T", password_hash="x",
        role=UserRole.candidate, email_verified=True,
    )
    db.add(user)
    db.commit()
    return user


# ------------------------- check_email_breaches ------------------------- #

def test_breach_check_none_without_api_key(monkeypatch):
    monkeypatch.setattr(hibp_service.settings, "HIBP_API_KEY", "")
    assert hibp_service.check_email_breaches("a@b.com") is None


def test_breach_check_404_means_clean(monkeypatch):
    monkeypatch.setattr(hibp_service.settings, "HIBP_API_KEY", "k")
    monkeypatch.setattr(hibp_service.httpx, "get", lambda *a, **k: _FakeResponse(404))
    assert hibp_service.check_email_breaches("a@b.com") == []


def test_breach_check_returns_sorted_names(monkeypatch):
    monkeypatch.setattr(hibp_service.settings, "HIBP_API_KEY", "k")
    monkeypatch.setattr(
        hibp_service.httpx, "get",
        lambda *a, **k: _FakeResponse(200, json_data=[{"Name": "LinkedIn"}, {"Name": "Adobe"}]),
    )
    assert hibp_service.check_email_breaches("a@b.com") == ["Adobe", "LinkedIn"]


def test_breach_check_sends_required_headers(monkeypatch):
    monkeypatch.setattr(hibp_service.settings, "HIBP_API_KEY", "secret-key")
    captured = {}

    def _get(url, headers=None, timeout=None):
        captured.update({"url": url, "headers": headers})
        return _FakeResponse(404)

    monkeypatch.setattr(hibp_service.httpx, "get", _get)
    hibp_service.check_email_breaches("a@b.com")
    assert captured["headers"]["hibp-api-key"] == "secret-key"
    assert captured["headers"]["user-agent"]  # 403 without it, per the docs
    assert captured["url"].endswith("/breachedaccount/a@b.com")


def test_breach_check_rate_limit_and_errors_return_none(monkeypatch):
    monkeypatch.setattr(hibp_service.settings, "HIBP_API_KEY", "k")
    monkeypatch.setattr(
        hibp_service.httpx, "get",
        lambda *a, **k: _FakeResponse(429, headers={"retry-after": "10"}),
    )
    assert hibp_service.check_email_breaches("a@b.com") is None
    monkeypatch.setattr(
        hibp_service.httpx, "get",
        lambda *a, **k: (_ for _ in ()).throw(ConnectionError("down")),
    )
    assert hibp_service.check_email_breaches("a@b.com") is None


# --------------------------- password_is_pwned -------------------------- #

def test_password_check_disabled_by_default(monkeypatch):
    monkeypatch.setattr(hibp_service.settings, "HIBP_PASSWORD_CHECK_ENABLED", False)
    assert hibp_service.password_is_pwned("hunter2") is None


def test_password_check_detects_pwned_via_k_anonymity(monkeypatch):
    monkeypatch.setattr(hibp_service.settings, "HIBP_PASSWORD_CHECK_ENABLED", True)
    sha1 = hashlib.sha1(b"password123").hexdigest().upper()
    prefix, suffix = sha1[:5], sha1[5:]
    captured = {}

    def _get(url, headers=None, timeout=None):
        captured["url"] = url
        return _FakeResponse(200, text=f"AAAA:1\n{suffix}:9000\nBBBB:2")

    monkeypatch.setattr(hibp_service.httpx, "get", _get)
    assert hibp_service.password_is_pwned("password123") is True
    # k-anonymity: only the 5-char prefix in the URL, never the full hash.
    assert captured["url"].endswith(f"/range/{prefix}")
    assert suffix not in captured["url"]


def test_password_check_clean_and_error_paths(monkeypatch):
    monkeypatch.setattr(hibp_service.settings, "HIBP_PASSWORD_CHECK_ENABLED", True)
    monkeypatch.setattr(hibp_service.httpx, "get", lambda *a, **k: _FakeResponse(200, text="AAAA:1"))
    assert hibp_service.password_is_pwned("unique-passphrase-xyz") is False
    monkeypatch.setattr(
        hibp_service.httpx, "get",
        lambda *a, **k: (_ for _ in ()).throw(ConnectionError("down")),
    )
    assert hibp_service.password_is_pwned("whatever") is None


def test_reject_pwned_password_blocks_only_confirmed_pwned(monkeypatch):
    from app.core.errors import ValidationError
    from app.services.auth_service import AuthService

    monkeypatch.setattr("app.services.hibp_service.password_is_pwned", lambda p: True)
    with pytest.raises(ValidationError):
        AuthService._reject_pwned_password("leaked")

    # None (check failed / disabled) must NOT block the flow.
    monkeypatch.setattr("app.services.hibp_service.password_is_pwned", lambda p: None)
    AuthService._reject_pwned_password("anything")
    monkeypatch.setattr("app.services.hibp_service.password_is_pwned", lambda p: False)
    AuthService._reject_pwned_password("clean")


# ---------------------------- daily scan task --------------------------- #

def test_scan_noop_without_api_key(monkeypatch):
    from app.workers import tasks as worker_tasks

    monkeypatch.setattr(hibp_service.settings, "HIBP_API_KEY", "")
    result = worker_tasks.run_hibp_breach_scan.run()
    assert result.get("skipped") is True


def test_scan_records_new_breaches_and_alerts_once(db, monkeypatch):
    from app.services.email_service import EmailService
    from app.workers import tasks as worker_tasks

    monkeypatch.setattr(hibp_service.settings, "HIBP_API_KEY", "k")
    monkeypatch.setattr(hibp_service.settings, "HIBP_REQUEST_INTERVAL_SECONDS", 0.0)
    monkeypatch.setattr(worker_tasks, "SessionLocal", lambda: db)
    monkeypatch.setattr(db, "close", lambda: None)  # task closes; fixture reuses

    user = _user(db, f"breached-{uuid.uuid4()}@example.com")
    _user(db, f"clean-{uuid.uuid4()}@example.com")

    def _fake_check(email):
        return ["Adobe", "LinkedIn"] if email == user.email else []

    monkeypatch.setattr(hibp_service, "check_email_breaches", _fake_check)
    alerts = []
    monkeypatch.setattr(
        EmailService, "send_security_alert_email",
        staticmethod(lambda **kw: alerts.append(kw) or True),
    )

    result = worker_tasks.run_hibp_breach_scan.run()
    assert result["checked"] == 2
    assert result["newlyBreached"] == 1
    events = db.query(SecurityEvent).filter(SecurityEvent.event_type == "hibp_breach").all()
    assert len(events) == 1
    assert json.loads(events[0].details)["breaches"] == ["Adobe", "LinkedIn"]
    assert len(alerts) == 1 and user.email in " ".join(alerts[0]["lines"])
    assert user.hibp_checked_at is not None

    # Second run: same breaches already known -> no new event, no new alert.
    result2 = worker_tasks.run_hibp_breach_scan.run()
    assert result2["newlyBreached"] == 0
    assert db.query(SecurityEvent).filter(SecurityEvent.event_type == "hibp_breach").count() == 1
    assert len(alerts) == 1


def test_scan_api_error_leaves_user_unmarked_for_retry(db, monkeypatch):
    from app.workers import tasks as worker_tasks

    monkeypatch.setattr(hibp_service.settings, "HIBP_API_KEY", "k")
    monkeypatch.setattr(hibp_service.settings, "HIBP_REQUEST_INTERVAL_SECONDS", 0.0)
    monkeypatch.setattr(worker_tasks, "SessionLocal", lambda: db)
    monkeypatch.setattr(db, "close", lambda: None)

    user = _user(db, f"err-{uuid.uuid4()}@example.com")
    monkeypatch.setattr(hibp_service, "check_email_breaches", lambda email: None)

    result = worker_tasks.run_hibp_breach_scan.run()
    assert result["checked"] == 0
    assert user.hibp_checked_at is None  # will be retried next run
