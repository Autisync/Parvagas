#!/bin/sh
set -e

# Alembic is the single source of truth for schema (see docs/adr/ADR-001).
# The root migration guards every CREATE with has_table, so it is idempotent.
run_migrations() {
  echo "[entrypoint] Running alembic upgrade head..."
  alembic upgrade head
}

# No args → default API server path. Run migrations here (once), then serve.
# This is the ONLY service that migrates by default, avoiding races with the
# celery worker/beat containers that share this image.
if [ "$#" -eq 0 ]; then
  if [ "${RUN_MIGRATIONS:-true}" = "true" ]; then
    run_migrations
  fi
  echo "[entrypoint] Starting Gunicorn..."
  exec gunicorn app.main:app -c gunicorn_conf.py
fi

# Explicit command (e.g. celery worker/beat): do NOT migrate unless asked.
if [ "${RUN_MIGRATIONS:-false}" = "true" ]; then
  run_migrations
fi
exec "$@"
