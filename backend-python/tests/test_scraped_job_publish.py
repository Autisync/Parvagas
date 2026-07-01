"""Tests for scraped-job publish logic (pure, no DB)."""
from datetime import datetime, timedelta

from app.api.v1.admin import _resolve_scraped_job_expiry


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
