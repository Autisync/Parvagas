"""Tests for LLM usage metering — llm_service.py previously recorded
nothing about which feature/provider/model was called or whether it
succeeded. _log_llm_call() (invoked from chat_json_request, the single
low-level HTTP path every caller funnels through) now writes one
LlmCallLog row per call.

Runs with APP_ENV forced away from "test" since _log_llm_call() no-ops in
the test environment by design (mirrors track_task_run's reasoning: no
SessionLocal mocking convention exists for this direct-call code path,
so an unpatched write would hit the real, unreachable-in-tests database).
"""
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.base import Base
from app.models import LlmCallLog
from app.services import llm_service


class _FakeResponse:
    def __init__(self, status_code=200, json_data=None, raise_exc=None):
        self.status_code = status_code
        self._json_data = json_data
        self._raise_exc = raise_exc

    def raise_for_status(self):
        if self._raise_exc:
            raise self._raise_exc

    def json(self):
        return self._json_data


class _FakeClient:
    def __init__(self, response=None, raise_on_post=None, **kwargs):
        self._response = response
        self._raise_on_post = raise_on_post

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False

    def post(self, *args, **kwargs):
        if self._raise_on_post:
            raise self._raise_on_post
        return self._response


def _patch_client(monkeypatch, response=None, raise_on_post=None):
    monkeypatch.setattr(
        llm_service.httpx, "Client",
        lambda *a, **k: _FakeClient(response=response, raise_on_post=raise_on_post),
    )


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
    import app.core.config as config_module
    import app.db.session as db_session_module

    monkeypatch.setattr(config_module.get_settings(), "APP_ENV", "production")
    Session = sessionmaker(bind=db.get_bind())
    monkeypatch.setattr(db_session_module, "SessionLocal", Session)
    yield db


def test_successful_call_logs_success(non_test_env, monkeypatch):
    response = _FakeResponse(json_data={"choices": [{"message": {"content": '{"ok": true}'}}]})
    _patch_client(monkeypatch, response=response)

    result = llm_service.chat_json_request(
        "https://x/chat/completions", {}, {"model": "llama3.2:3b"},
        fallback={}, timeout=5, feature="test_feature", provider="ollama",
    )

    assert result == {"ok": True}
    log = non_test_env.query(LlmCallLog).filter(LlmCallLog.feature == "test_feature").first()
    assert log is not None
    assert log.success is True
    assert log.provider == "ollama"
    assert log.model == "llama3.2:3b"


def test_network_failure_logs_failure(non_test_env, monkeypatch):
    _patch_client(monkeypatch, raise_on_post=ConnectionError("refused"))

    result = llm_service.chat_json_request(
        "https://x/chat/completions", {}, {"model": "llama3.2:3b"},
        fallback={"fell": "back"}, timeout=5, feature="test_feature_fail", provider="ollama",
    )

    assert result == {"fell": "back"}
    log = non_test_env.query(LlmCallLog).filter(LlmCallLog.feature == "test_feature_fail").first()
    assert log is not None
    assert log.success is False


def test_invalid_json_content_logs_failure(non_test_env, monkeypatch):
    response = _FakeResponse(json_data={"choices": [{"message": {"content": "not json"}}]})
    _patch_client(monkeypatch, response=response)

    llm_service.chat_json_request(
        "https://x/chat/completions", {}, {"model": "llama3.2:3b"},
        fallback={}, timeout=5, feature="test_feature_badjson", provider="ollama",
    )

    log = non_test_env.query(LlmCallLog).filter(LlmCallLog.feature == "test_feature_badjson").first()
    assert log.success is False


def test_defaults_feature_and_provider_to_unknown(non_test_env, monkeypatch):
    response = _FakeResponse(json_data={"choices": [{"message": {"content": "{}"}}]})
    _patch_client(monkeypatch, response=response)

    llm_service.chat_json_request("https://x/chat/completions", {}, {}, fallback={}, timeout=5)

    log = non_test_env.query(LlmCallLog).order_by(LlmCallLog.created_at.desc()).first()
    assert log.feature == "unknown"
    assert log.provider == "unknown"


def test_logging_failure_never_breaks_the_caller(monkeypatch):
    """Even without the non_test_env fixture (so APP_ENV stays 'test' and
    _log_llm_call is skipped by design), a broken heartbeat path must not
    matter — verified here by leaving SessionLocal entirely unpatched."""
    response = _FakeResponse(json_data={"choices": [{"message": {"content": '{"ok": true}'}}]})
    _patch_client(monkeypatch, response=response)

    result = llm_service.chat_json_request(
        "https://x/chat/completions", {}, {}, fallback={}, timeout=5, feature="whatever",
    )

    assert result == {"ok": True}
