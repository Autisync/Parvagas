"""Gunicorn configuration for the Parvagas backend.

Uses uvicorn workers for ASGI. Worker count defaults to (2*CPU)+1 but can be
pinned via WEB_CONCURRENCY (recommended in containers with CPU limits).
"""
import multiprocessing
import os

bind = f"0.0.0.0:{os.getenv('PORT', '8000')}"

_default_workers = multiprocessing.cpu_count() * 2 + 1
workers = int(os.getenv("WEB_CONCURRENCY", _default_workers))
worker_class = "uvicorn.workers.UvicornWorker"

# Recycle workers periodically to bound memory leaks.
max_requests = int(os.getenv("GUNICORN_MAX_REQUESTS", "1000"))
max_requests_jitter = int(os.getenv("GUNICORN_MAX_REQUESTS_JITTER", "100"))

timeout = int(os.getenv("GUNICORN_TIMEOUT", "60"))
graceful_timeout = int(os.getenv("GUNICORN_GRACEFUL_TIMEOUT", "30"))
keepalive = int(os.getenv("GUNICORN_KEEPALIVE", "5"))

accesslog = "-"
errorlog = "-"
loglevel = os.getenv("LOG_LEVEL", "info")
