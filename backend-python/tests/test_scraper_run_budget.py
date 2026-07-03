"""Tests for the scrape-run resource budget (pure, no DB/network)."""
from datetime import datetime, timedelta

import app.workers.tasks as tasks


def test_not_exhausted_when_under_both_limits():
    started = datetime(2026, 7, 1, 12, 0, 0)
    now = started + timedelta(seconds=10)
    assert tasks._scrape_budget_exhausted(ingested=5, started_at=started, now=now) is False


def test_exhausted_when_ingest_count_reaches_cap():
    started = datetime(2026, 7, 1, 12, 0, 0)
    now = started + timedelta(seconds=1)
    assert tasks._scrape_budget_exhausted(
        ingested=tasks.SCRAPER_MAX_INGEST_PER_RUN, started_at=started, now=now
    ) is True


def test_exhausted_when_wall_clock_budget_elapses():
    started = datetime(2026, 7, 1, 12, 0, 0)
    now = started + timedelta(seconds=tasks.SCRAPER_RUN_BUDGET_SECONDS)
    assert tasks._scrape_budget_exhausted(ingested=1, started_at=started, now=now) is True


def test_budgets_are_finite_positive_numbers():
    # Guards against SCRAPER_MAX_INGEST_PER_RUN/SCRAPER_RUN_BUDGET_SECONDS
    # ever being misconfigured to 0/negative, which would make every run a
    # no-op, or unset, which would make the "budget" meaningless.
    assert tasks.SCRAPER_MAX_INGEST_PER_RUN > 0
    assert tasks.SCRAPER_RUN_BUDGET_SECONDS > 0
