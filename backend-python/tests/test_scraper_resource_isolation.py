"""Tests that scraping is isolated onto its own low-priority Celery queue
with bounded resource usage, so it can never starve web-facing tasks
(emails, CV parsing) of worker capacity — see the resource-exhaustion
incident this guards against in the project history."""
import app.workers.tasks  # noqa: F401 — forces task registration
import app.workers.celery_app as celery_app


def test_scraping_queue_exists():
    names = {q.name for q in celery_app.celery.conf.task_queues}
    assert "scraping" in names


def test_scrape_external_jobs_routed_to_scraping_queue():
    route = celery_app.celery.conf.task_routes["app.workers.tasks.scrape_external_jobs"]
    assert route == {"queue": "scraping"}


def test_expire_stale_aggregated_jobs_routed_to_scraping_queue():
    route = celery_app.celery.conf.task_routes["app.workers.tasks.expire_stale_aggregated_jobs"]
    assert route == {"queue": "scraping"}


def test_publish_scheduled_scraped_jobs_routed_to_scraping_queue():
    route = celery_app.celery.conf.task_routes["app.workers.tasks.publish_scheduled_scraped_jobs"]
    assert route == {"queue": "scraping"}


def test_scrape_external_jobs_has_bounded_time_limits():
    task = celery_app.celery.tasks["app.workers.tasks.scrape_external_jobs"]
    assert task.soft_time_limit is not None
    assert task.time_limit is not None
    assert task.soft_time_limit < task.time_limit


def test_scrape_external_jobs_has_a_rate_limit():
    task = celery_app.celery.tasks["app.workers.tasks.scrape_external_jobs"]
    assert task.rate_limit is not None


def test_email_and_parsing_tasks_are_not_on_the_scraping_queue():
    routes = celery_app.celery.conf.task_routes
    for name, route in routes.items():
        if "email" in name or name.endswith("parse_cv"):
            assert route["queue"] != "scraping", f"{name} must stay off the scraping queue"
