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
)

# Default routing
celery.conf.task_routes = {
    'app.workers.tasks.send_verification_email': {'queue': 'emails'},
    'app.workers.tasks.send_password_reset_email': {'queue': 'emails'},
    'app.workers.tasks.send_welcome_email': {'queue': 'emails'},
    'app.workers.tasks.send_application_received_email': {'queue': 'emails'},
    'app.workers.tasks.send_application_status_email': {'queue': 'emails'},
    'app.workers.tasks.send_newsletter_confirmation_email': {'queue': 'emails'},
    'app.workers.tasks.send_templated_email': {'queue': 'emails'},
    'app.workers.tasks.parse_cv': {'queue': 'parsing'},
    'app.workers.tasks.cleanup_expired_tokens': {'queue': 'cleanup'},
}

# Periodic schedules (run a `celery beat` process alongside the worker).
celery.conf.beat_schedule = {
    'job-alert-digests-daily': {
        'task': 'app.workers.tasks.dispatch_job_alert_digests',
        'schedule': crontab(hour=7, minute=0),  # 07:00 UTC daily
    },
    'subscription-expiry-reminders-daily': {
        'task': 'app.workers.tasks.dispatch_subscription_expiry_reminders',
        'schedule': crontab(hour=8, minute=0),  # 08:00 UTC daily
    },
    # Job aggregation: fetch external sources every 6h, expire stale daily.
    'scrape-external-jobs': {
        'task': 'app.workers.tasks.scrape_external_jobs',
        'schedule': crontab(minute=0, hour='*/6'),
    },
    'expire-stale-aggregated-jobs': {
        'task': 'app.workers.tasks.expire_stale_aggregated_jobs',
        'schedule': crontab(hour=4, minute=30),  # 04:30 UTC daily
    },
}
