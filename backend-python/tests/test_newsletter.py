"""Tests for the newsletter signup input validation (pure, no DB)."""
import asyncio
import uuid

import pytest
from fastapi import HTTPException, Request
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core.security import has_leading_formula_char, is_valid_email_format
from app.db.base import Base
from app.models import NewsletterSubscriber
from app.api.v1.newsletter import subscribe_newsletter, unsubscribe_newsletter, NewsletterSubscribeRequest, NewsletterUnsubscribeRequest


def test_email_regex_accepts_valid_addresses():
    assert is_valid_email_format("person@example.com")
    assert is_valid_email_format("first.last+tag@sub.example.co.ao")


def test_email_regex_rejects_invalid_addresses():
    assert not is_valid_email_format("")
    assert not is_valid_email_format("not-an-email")
    assert not is_valid_email_format("missing-domain@")
    assert not is_valid_email_format("@missing-local.com")
    assert not is_valid_email_format("has spaces@example.com")


@pytest.mark.parametrize("trigger", ["=", "+", "-", "@", "\t", "\r", "\n"])
def test_has_leading_formula_char_flags_every_trigger(trigger):
    assert has_leading_formula_char(f"{trigger}cmd|'/c calc'!A0") is True


def test_has_leading_formula_char_allows_ordinary_text():
    assert has_leading_formula_char("Ana Sousa") is False
    assert has_leading_formula_char("") is False
    assert has_leading_formula_char(None) is False


# ── POST /newsletter/subscribe — endpoint-level validation ────────────────

@pytest.fixture()
def db():
    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()


class _FakeClient:
    host = "127.0.0.1"


class _FakeRequest:
    client = _FakeClient()
    headers = {}


@pytest.fixture(autouse=True)
def _pass_captcha_and_stub_email(monkeypatch):
    async def _ok(*args, **kwargs):
        return True

    monkeypatch.setattr("app.core.captcha.verify_captcha", _ok)
    # No Celery broker in the test environment — Celery's own eager-mode
    # setting isn't configured here, so `.delay()` would try (and fail) to
    # reach Redis. This isn't what these tests are exercising.
    monkeypatch.setattr("app.workers.tasks.send_newsletter_confirmation_email.delay", lambda *a, **kw: None)


def test_subscribe_rejects_formula_shaped_email(db):
    """A local part like '=2+2' still matches the basic email-shape regex
    (no '@'/whitespace inside it), so the formula-injection check is the
    only thing standing between this and landing unescaped in a CSV export."""
    payload = NewsletterSubscribeRequest(email="=2+2@x.com", source=None)
    with pytest.raises(HTTPException) as exc:
        asyncio.run(subscribe_newsletter(payload, _FakeRequest(), db=db))
    assert exc.value.status_code == 400
    assert db.query(NewsletterSubscriber).count() == 0


def test_subscribe_rejects_formula_shaped_source(db):
    payload = NewsletterSubscribeRequest(email="real@x.com", source="+SUM(A1:A9)")
    with pytest.raises(HTTPException) as exc:
        asyncio.run(subscribe_newsletter(payload, _FakeRequest(), db=db))
    assert exc.value.status_code == 400
    assert db.query(NewsletterSubscriber).count() == 0


def test_subscribe_accepts_legitimate_signup(db):
    payload = NewsletterSubscribeRequest(email="real@x.com", source="footer")
    result = asyncio.run(subscribe_newsletter(payload, _FakeRequest(), db=db))
    assert result["message"]
    row = db.query(NewsletterSubscriber).filter(NewsletterSubscriber.email == "real@x.com").first()
    assert row is not None
    assert row.source == "footer"


def test_subscribe_assigns_a_unique_unsubscribe_token(db):
    asyncio.run(subscribe_newsletter(NewsletterSubscribeRequest(email="one@x.com"), _FakeRequest(), db=db))
    asyncio.run(subscribe_newsletter(NewsletterSubscribeRequest(email="two@x.com"), _FakeRequest(), db=db))
    rows = db.query(NewsletterSubscriber).all()
    tokens = {r.unsubscribe_token for r in rows}
    assert len(tokens) == 2
    assert all(t and len(t) > 10 for t in tokens)


# ── POST /newsletter/unsubscribe ───────────────────────────────────────────

def test_unsubscribe_with_valid_token_sets_unsubscribed_at(db):
    asyncio.run(subscribe_newsletter(NewsletterSubscribeRequest(email="leaving@x.com"), _FakeRequest(), db=db))
    subscriber = db.query(NewsletterSubscriber).filter(NewsletterSubscriber.email == "leaving@x.com").first()
    assert subscriber.unsubscribed_at is None

    result = asyncio.run(unsubscribe_newsletter(NewsletterUnsubscribeRequest(token=subscriber.unsubscribe_token), db=db))
    assert result["message"]
    db.refresh(subscriber)
    assert subscriber.unsubscribed_at is not None


def test_unsubscribe_is_idempotent(db):
    asyncio.run(subscribe_newsletter(NewsletterSubscribeRequest(email="twice@x.com"), _FakeRequest(), db=db))
    subscriber = db.query(NewsletterSubscriber).filter(NewsletterSubscriber.email == "twice@x.com").first()

    asyncio.run(unsubscribe_newsletter(NewsletterUnsubscribeRequest(token=subscriber.unsubscribe_token), db=db))
    db.refresh(subscriber)
    first_timestamp = subscriber.unsubscribed_at

    asyncio.run(unsubscribe_newsletter(NewsletterUnsubscribeRequest(token=subscriber.unsubscribe_token), db=db))
    db.refresh(subscriber)
    assert subscriber.unsubscribed_at == first_timestamp


def test_unsubscribe_rejects_unknown_token(db):
    with pytest.raises(HTTPException) as exc:
        asyncio.run(unsubscribe_newsletter(NewsletterUnsubscribeRequest(token="not-a-real-token"), db=db))
    assert exc.value.status_code == 404


def test_resubscribing_clears_unsubscribed_at(db):
    """Confirms the existing re-subscribe flow (subscribe_newsletter's
    'existing' branch) still works alongside the new unsubscribe token."""
    asyncio.run(subscribe_newsletter(NewsletterSubscribeRequest(email="backagain@x.com"), _FakeRequest(), db=db))
    subscriber = db.query(NewsletterSubscriber).filter(NewsletterSubscriber.email == "backagain@x.com").first()
    asyncio.run(unsubscribe_newsletter(NewsletterUnsubscribeRequest(token=subscriber.unsubscribe_token), db=db))
    db.refresh(subscriber)
    assert subscriber.unsubscribed_at is not None

    asyncio.run(subscribe_newsletter(NewsletterSubscribeRequest(email="backagain@x.com"), _FakeRequest(), db=db))
    db.refresh(subscriber)
    assert subscriber.unsubscribed_at is None
