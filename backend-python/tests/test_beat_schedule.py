"""Tests that every task meant to run periodically actually has a
beat_schedule entry — cleanup_expired_tokens was routed to the cleanup
queue but never scheduled, so expired verification/reset tokens
accumulated in the DB forever until this was caught.
"""
import app.workers.tasks  # noqa: F401 — forces task registration
import app.workers.celery_app as celery_app


EXPECTED_SCHEDULED_TASKS = {
    "app.workers.tasks.dispatch_job_alert_digests",
    "app.workers.tasks.dispatch_scraped_jobs_digest",
    "app.workers.tasks.dispatch_subscription_expiry_reminders",
    "app.workers.tasks.process_lapsed_subscriptions",
    "app.workers.tasks.check_breach_notification_deadlines",
    "app.workers.tasks.scrape_external_jobs",
    "app.workers.tasks.expire_stale_aggregated_jobs",
    "app.workers.tasks.publish_scheduled_scraped_jobs",
    "app.workers.tasks.generate_auto_apply_proposals",
    "app.workers.tasks.run_hibp_breach_scan",
    "app.workers.tasks.cleanup_expired_tokens",
}


def test_every_expected_task_is_scheduled():
    scheduled = {entry["task"] for entry in celery_app.celery.conf.beat_schedule.values()}
    missing = EXPECTED_SCHEDULED_TASKS - scheduled
    assert not missing, f"tasks routed but never scheduled: {missing}"


def test_cleanup_expired_tokens_is_scheduled():
    """Regression test for the specific gap: this task existed and was
    routed to the cleanup queue, but had no beat_schedule entry at all."""
    scheduled = {entry["task"] for entry in celery_app.celery.conf.beat_schedule.values()}
    assert "app.workers.tasks.cleanup_expired_tokens" in scheduled


def test_no_duplicate_beat_entries_for_the_same_task():
    tasks = [entry["task"] for entry in celery_app.celery.conf.beat_schedule.values()]
    assert len(tasks) == len(set(tasks))
