"""Celery configuration and app setup."""
from celery import Celery
from celery.schedules import crontab
from kombu import Exchange, Queue
from app.core.config import get_settings

settings = get_settings()

# Create Celery app and eagerly import task modules for registration.
celery = Celery(__name__, include=['app.workers.tasks'])

# Configure Celery
celery.conf.update(
    broker_url=settings.CELERY_BROKER_URL,
    result_backend=settings.CELERY_RESULT_BACKEND,
    task_serializer='json',
    accept_content=['json'],
    result_serializer='json',
    timezone='UTC',
    enable_utc=True,
    task_track_started=True,
    task_time_limit=30 * 60,  # 30 minutes
    task_soft_time_limit=25 * 60,  # 25 minutes
)

# Define default queue
default_exchange = Exchange('parvagas', type='direct')
default_queue = Queue('default', exchange=default_exchange, routing_key='default')

celery.conf.task_queues = (
    default_queue,
    Queue('emails', exchange=default_exchange, routing_key='emails'),
    Queue('parsing', exchange=default_exchange, routing_key='parsing'),
    Queue('cleanup', exchange=default_exchange, routing_key='cleanup'),
    # Isolated from the queues above on purpose: scraping is the one workload
    # here with unbounded external-network variance (slow/hanging sources,
    # bursty volume). A dedicated low-concurrency worker consumes only this
    # queue (see docker-compose.prod.yml) so it can never starve web-facing
    # email/CV-parsing capacity — see task-level rate/time limits in tasks.py.
    Queue('scraping', exchange=default_exchange, routing_key='scraping'),
)

# Default routing
celery.conf.task_routes = {
    'app.workers.tasks.send_verification_email': {'queue': 'emails'},
    'app.workers.tasks.send_password_reset_email': {'queue': 'emails'},
    'app.workers.tasks.send_welcome_email': {'queue': 'emails'},
    'app.workers.tasks.send_application_received_email': {'queue': 'emails'},
    'app.workers.tasks.send_application_status_email': {'queue': 'emails'},
    'app.workers.tasks.send_newsletter_confirmation_email': {'queue': 'emails'},
    'app.workers.tasks.dispatch_scraped_jobs_digest': {'queue': 'emails'},
    'app.workers.tasks.send_templated_email': {'queue': 'emails'},
    'app.workers.tasks.parse_cv': {'queue': 'parsing'},
    'app.workers.tasks.cleanup_expired_tokens': {'queue': 'cleanup'},
    'app.workers.tasks.scrape_external_jobs': {'queue': 'scraping'},
    'app.workers.tasks.expire_stale_aggregated_jobs': {'queue': 'scraping'},
    'app.workers.tasks.publish_scheduled_scraped_jobs': {'queue': 'scraping'},
}

# Periodic schedules (run a `celery beat` process alongside the worker).
celery.conf.beat_schedule = {
    'job-alert-digests-daily': {
        'task': 'app.workers.tasks.dispatch_job_alert_digests',
        'schedule': crontab(hour=7, minute=0),  # 07:00 UTC daily
    },
    'scraped-jobs-digest-daily': {
        'task': 'app.workers.tasks.dispatch_scraped_jobs_digest',
        'schedule': crontab(hour=7, minute=30),  # 07:30 UTC daily
    },
    'subscription-expiry-reminders-daily': {
        'task': 'app.workers.tasks.dispatch_subscription_expiry_reminders',
        'schedule': crontab(hour=8, minute=0),  # 08:00 UTC daily
    },
    # Job aggregation: fetch external sources every 2h (was 6h) for higher
    # daily volume; each run is still budget-capped (SCRAPER_MAX_INGEST_PER_RUN
    # / SCRAPER_RUN_BUDGET_SECONDS) and isolated to its own low-priority
    # worker, so more frequent runs don't add host resource risk.
    'scrape-external-jobs': {
        'task': 'app.workers.tasks.scrape_external_jobs',
        'schedule': crontab(minute=0, hour='*/2'),
    },
    'expire-stale-aggregated-jobs': {
        'task': 'app.workers.tasks.expire_stale_aggregated_jobs',
        'schedule': crontab(hour=4, minute=30),  # 04:30 UTC daily
    },
    # Sweep for admin-scheduled scraped jobs whose publish time has arrived.
    'publish-scheduled-scraped-jobs': {
        'task': 'app.workers.tasks.publish_scheduled_scraped_jobs',
        'schedule': crontab(minute='*/15'),
    },
    # Auto-apply: score new jobs for opted-in candidates into a review queue.
    # Every 6h — frequent enough to surface fresh postings quickly without
    # scanning the whole job table on every worker tick.
    'generate-auto-apply-proposals': {
        'task': 'app.workers.tasks.generate_auto_apply_proposals',
        'schedule': crontab(minute=0, hour='*/6'),
    },
}
