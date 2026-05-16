"""Celery configuration and app setup."""
from celery import Celery
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
    'app.workers.tasks.parse_cv': {'queue': 'parsing'},
    'app.workers.tasks.cleanup_expired_tokens': {'queue': 'cleanup'},
}
