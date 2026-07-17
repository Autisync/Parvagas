"""Tests for app.services.task_heartbeat.track_task_run — the decorator
that backs the TaskRun ledger. Runs with APP_ENV forced away from "test"
(the pytest default) since the decorator intentionally no-ops in the test
environment to avoid clashing with tasks.py's own SessionLocal mocking
pattern (see track_task_run's docstring/comment for why).
"""
import uuid

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.base import Base
from app.models import TaskRun
from app.services.task_heartbeat import track_task_run


@pytest.fixture()
def db():
    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()


@pytest.fixture()
def non_test_env(monkeypatch, db):
    """Forces settings.APP_ENV away from 'test' and makes
    app.db.session.SessionLocal return a fresh session bound to the same
    in-memory engine as `db`, so track_task_run's real (non-bypassed) path
    runs against an inspectable database."""
    import app.core.config as config_module
    import app.db.session as db_session_module

    monkeypatch.setattr(config_module.get_settings(), "APP_ENV", "production")
    # track_task_run opens a NEW session per DB write, so bind a fresh
    # sessionmaker to the same in-memory engine `db` already uses.
    Session = sessionmaker(bind=db.get_bind())
    monkeypatch.setattr(db_session_module, "SessionLocal", Session)
    yield db


def test_records_success_run(non_test_env):
    @track_task_run("my_task")
    def my_task():
        return {"ok": True}

    result = my_task()

    assert result == {"ok": True}
    run = non_test_env.query(TaskRun).filter(TaskRun.task_name == "my_task").first()
    assert run is not None
    assert run.status == "success"
    assert run.finished_at is not None
    assert run.started_at is not None


def test_records_failed_run_on_raised_exception(non_test_env):
    @track_task_run("failing_task")
    def failing_task():
        raise RuntimeError("boom")

    with pytest.raises(RuntimeError):
        failing_task()

    run = non_test_env.query(TaskRun).filter(TaskRun.task_name == "failing_task").first()
    assert run is not None
    assert run.status == "failed"
    assert "boom" in (run.detail or "")


def test_records_failed_run_when_result_signals_failure(non_test_env):
    """Several tasks in this codebase catch their own exceptions and
    return {"success": False, "error": ...} instead of raising."""
    @track_task_run("soft_failing_task")
    def soft_failing_task():
        return {"success": False, "error": "could not connect"}

    result = soft_failing_task()

    assert result == {"success": False, "error": "could not connect"}
    run = non_test_env.query(TaskRun).filter(TaskRun.task_name == "soft_failing_task").first()
    assert run.status == "failed"
    assert "could not connect" in run.detail


def test_heartbeat_failure_never_breaks_the_wrapped_task(non_test_env, monkeypatch):
    """If the heartbeat DB write itself blows up, the wrapped task must
    still run and return normally."""
    import app.db.session as db_session_module

    def _broken_session_local():
        raise RuntimeError("db unreachable")

    monkeypatch.setattr(db_session_module, "SessionLocal", _broken_session_local)

    @track_task_run("resilient_task")
    def resilient_task():
        return {"did": "work"}

    assert resilient_task() == {"did": "work"}
