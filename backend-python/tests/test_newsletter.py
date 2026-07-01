"""Tests for the newsletter signup input validation (pure, no DB)."""
from app.api.v1.newsletter import EMAIL_RE


def test_email_regex_accepts_valid_addresses():
    assert EMAIL_RE.match("person@example.com")
    assert EMAIL_RE.match("first.last+tag@sub.example.co.ao")


def test_email_regex_rejects_invalid_addresses():
    assert not EMAIL_RE.match("")
    assert not EMAIL_RE.match("not-an-email")
    assert not EMAIL_RE.match("missing-domain@")
    assert not EMAIL_RE.match("@missing-local.com")
    assert not EMAIL_RE.match("has spaces@example.com")
