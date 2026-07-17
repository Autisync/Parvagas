"""Heartbeat ledger for scheduled (celery-beat) tasks — generalizes the
ScraperSource.last_run_* pattern (scoped to one model) to every periodic
task via a shared TaskRun table, so the admin portal can show a real
last-run-status view instead of having to infer health from Celery logs.

track_task_run() is a decorator, applied between @celery.task(...) and the
task function, so it wraps the actual function body (not the Celery task
object). It never lets heartbeat bookkeeping break the task it's tracking
— every DB write here is best-effort and swallows its own exceptions.
"""
from __future__ import annotations

import functools
import json
from datetime import datetime
from typing import Callable

from app.core.logging import get_logger

logger = get_logger(__name__)

_DETAIL_MAX_CHARS = 2000


def _truncate(text: str) -> str:
    return text if len(text) <= _DETAIL_MAX_CHARS else text[:_DETAIL_MAX_CHARS] + "..."


def _is_test_env() -> bool:
    from app.core.config import get_settings
    return get_settings().APP_ENV == "test"


def track_task_run(task_name: str) -> Callable:
    """Records one TaskRun row per call: `running` on entry, then
    `success`/`failed` on exit. Several tasks in this module catch their
    own exceptions and return `{"success": False, "error": ...}` instead
    of raising — that shape is classified as `failed` too, not just a
    genuinely raised exception."""

    def decorator(func: Callable) -> Callable:
        @functools.wraps(func)
        def wrapper(*args, **kwargs):
            # Tests monkeypatch app.workers.tasks.SessionLocal to a single
            # shared in-memory session and rely on closing it exactly once
            # (see test_scraped_jobs_digest.py) — a separate heartbeat
            # session opening/closing against that same mock would break
            # it. Heartbeat tracking is a production-only concern; skip it
            # entirely in tests rather than try to detect/avoid the clash.
            if _is_test_env():
                return func(*args, **kwargs)

            from app.db.session import SessionLocal
            from app.models import TaskRun

            run_id = None
            try:
                session = SessionLocal()
                try:
                    run = TaskRun(task_name=task_name, started_at=datetime.utcnow(), status="running")
                    session.add(run)
                    session.commit()
                    run_id = run.id
                finally:
                    session.close()
            except Exception as exc:  # noqa: BLE001
                logger.warning("track_task_run(%s): failed to record start: %s", task_name, exc)

            run_status = "success"
            detail: str | None = None
            try:
                result = func(*args, **kwargs)
                if isinstance(result, dict) and result.get("success") is False:
                    run_status = "failed"
                    detail = _truncate(str(result.get("error") or result))
                elif result is not None:
                    try:
                        detail = _truncate(json.dumps(result, default=str))
                    except Exception:  # noqa: BLE001
                        detail = _truncate(str(result))
                return result
            except Exception as exc:  # noqa: BLE001
                run_status = "failed"
                detail = _truncate(str(exc))
                raise
            finally:
                if run_id:
                    try:
                        session = SessionLocal()
                        try:
                            run = session.query(TaskRun).filter(TaskRun.id == run_id).first()
                            if run:
                                run.finished_at = datetime.utcnow()
                                run.status = run_status
                                run.detail = detail
                                session.commit()
                        finally:
                            session.close()
                    except Exception as exc:  # noqa: BLE001
                        logger.warning("track_task_run(%s): failed to record finish: %s", task_name, exc)

        return wrapper

    return decorator
