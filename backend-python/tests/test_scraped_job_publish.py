"""Tests for scraped-job publish logic (pure, no DB)."""
from datetime import datetime, timedelta

from app.api.v1.admin import _resolve_scraped_job_expiry, _json_list, _list_to_json


def test_prefers_future_application_deadline_over_shelf_life():
    now = datetime(2026, 7, 1)
    deadline = datetime(2026, 8, 15)
    assert _resolve_scraped_job_expiry(deadline, now) == deadline


def test_falls_back_to_shelf_life_when_deadline_already_passed():
    now = datetime(2026, 7, 1)
    deadline = datetime(2026, 6, 1)  # already in the past
    assert _resolve_scraped_job_expiry(deadline, now) == now + timedelta(days=45)


def test_falls_back_to_shelf_life_when_no_deadline_provided():
    now = datetime(2026, 7, 1)
    assert _resolve_scraped_job_expiry(None, now) == now + timedelta(days=45)


def test_custom_shelf_life_days_respected():
    now = datetime(2026, 7, 1)
    assert _resolve_scraped_job_expiry(None, now, shelf_life_days=30) == now + timedelta(days=30)


# ---- structured content: newline-textarea <-> JSON array round-trip ----

def test_list_to_json_splits_newline_separated_text():
    result = _list_to_json("Realizar análises...\nDesenvolver modelos...\n\nAvaliar risco...")
    assert _json_list(result) == ["Realizar análises...", "Desenvolver modelos...", "Avaliar risco..."]


def test_list_to_json_accepts_a_plain_list():
    result = _list_to_json(["Item A", " Item B ", "", "Item C"])
    assert _json_list(result) == ["Item A", "Item B", "Item C"]


def test_list_to_json_blank_input_returns_none():
    assert _list_to_json("") is None
    assert _list_to_json("   \n  \n") is None
    assert _list_to_json(None) is None
    assert _list_to_json([]) is None


def test_json_list_handles_malformed_or_missing_data():
    assert _json_list(None) == []
    assert _json_list("not json") == []
    assert _json_list('["a", "b"]') == ["a", "b"]
