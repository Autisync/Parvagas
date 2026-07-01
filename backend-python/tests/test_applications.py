"""Tests for candidate-application field resolution (pure, no DB)."""
from app.api.v1.applications import _resolve_applicant_field


def test_prefers_submitted_value_over_fallback():
    assert _resolve_applicant_field("+244 900 000 000", "+244 911 111 111") == "+244 900 000 000"


def test_falls_back_when_submitted_is_blank_or_whitespace():
    assert _resolve_applicant_field("", "profile-phone") == "profile-phone"
    assert _resolve_applicant_field("   ", "profile-phone") == "profile-phone"
    assert _resolve_applicant_field(None, "profile-phone") == "profile-phone"


def test_returns_none_when_neither_submitted_nor_fallback_present():
    assert _resolve_applicant_field(None, None) is None


def test_trims_submitted_value():
    assert _resolve_applicant_field("  Luanda  ", None) == "Luanda"
