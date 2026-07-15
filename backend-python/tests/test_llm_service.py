"""Tests for the shared LLM service (Phase 0 of TEST_PLAN_CAREER_OPS.md).

The one hard requirement every Llama-backed feature depends on: chat_json
must NEVER raise, and must fall back cleanly on every failure mode.
"""
import pytest

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


@pytest.fixture(autouse=True)
def _enable_llm(monkeypatch):
    monkeypatch.setattr(llm_service.settings, "LLM_ENABLED", True)
    monkeypatch.setattr(llm_service.settings, "LLM_PROVIDER", "ollama")
    monkeypatch.setattr(llm_service.settings, "LLM_MODEL", "llama3.2:3b")
    monkeypatch.setattr(llm_service.settings, "LLM_API_KEY", "")


def test_llm_enabled_true_for_ollama_without_api_key():
    assert llm_service.llm_enabled() is True


def test_llm_disabled_when_flag_off(monkeypatch):
    monkeypatch.setattr(llm_service.settings, "LLM_ENABLED", False)
    assert llm_service.llm_enabled() is False


def test_llm_disabled_for_non_ollama_provider_without_api_key(monkeypatch):
    monkeypatch.setattr(llm_service.settings, "LLM_PROVIDER", "openai")
    monkeypatch.setattr(llm_service.settings, "LLM_API_KEY", "")
    assert llm_service.llm_enabled() is False


def test_llm_enabled_for_non_ollama_provider_with_api_key(monkeypatch):
    monkeypatch.setattr(llm_service.settings, "LLM_PROVIDER", "openai")
    monkeypatch.setattr(llm_service.settings, "LLM_API_KEY", "sk-test")
    assert llm_service.llm_enabled() is True


def test_chat_json_returns_fallback_when_disabled(monkeypatch):
    monkeypatch.setattr(llm_service.settings, "LLM_ENABLED", False)
    fallback = {"score": 0}
    result = llm_service.chat_json("sys", "user", fallback=fallback)
    assert result is fallback


def test_chat_json_success_path(monkeypatch):
    response = _FakeResponse(json_data={
        "choices": [{"message": {"content": '{"score": 87, "reasons": ["boa correspondencia"]}'}}]
    })
    _patch_client(monkeypatch, response=response)
    result = llm_service.chat_json("sys", "user", fallback={"score": 0})
    assert result == {"score": 87, "reasons": ["boa correspondencia"]}


def test_chat_json_falls_back_on_network_error(monkeypatch):
    _patch_client(monkeypatch, raise_on_post=ConnectionError("refused"))
    fallback = {"score": 0, "reasons": []}
    result = llm_service.chat_json("sys", "user", fallback=fallback)
    assert result == fallback


def test_chat_json_falls_back_on_timeout(monkeypatch):
    import httpx as real_httpx
    _patch_client(monkeypatch, raise_on_post=real_httpx.TimeoutException("timed out"))
    fallback = {"score": 0}
    result = llm_service.chat_json("sys", "user", fallback=fallback, timeout=0.01)
    assert result == fallback


def test_chat_json_falls_back_on_http_error_status(monkeypatch):
    import httpx as real_httpx
    response = _FakeResponse(status_code=500, raise_exc=real_httpx.HTTPStatusError("boom", request=None, response=None))
    _patch_client(monkeypatch, response=response)
    fallback = {"score": 0}
    result = llm_service.chat_json("sys", "user", fallback=fallback)
    assert result == fallback


def test_chat_json_falls_back_on_malformed_json_content(monkeypatch):
    response = _FakeResponse(json_data={"choices": [{"message": {"content": "not json at all"}}]})
    _patch_client(monkeypatch, response=response)
    fallback = {"score": 0}
    result = llm_service.chat_json("sys", "user", fallback=fallback)
    assert result == fallback


def test_chat_json_falls_back_on_missing_choices_key(monkeypatch):
    response = _FakeResponse(json_data={"unexpected": "shape"})
    _patch_client(monkeypatch, response=response)
    fallback = {"score": 0}
    result = llm_service.chat_json("sys", "user", fallback=fallback)
    assert result == fallback


def test_chat_json_falls_back_when_response_is_not_a_json_object(monkeypatch):
    response = _FakeResponse(json_data={"choices": [{"message": {"content": "[1, 2, 3]"}}]})
    _patch_client(monkeypatch, response=response)
    fallback = {"score": 0}
    result = llm_service.chat_json("sys", "user", fallback=fallback)
    assert result == fallback


class _FakeInflightRedis:
    """In-memory stand-in for redis.Redis supporting only incr/expire/decr,
    what ollama_concurrency_guard uses."""

    def __init__(self):
        self.store: dict[str, int] = {}

    def incr(self, key):
        self.store[key] = self.store.get(key, 0) + 1
        return self.store[key]

    def decr(self, key):
        self.store[key] = self.store.get(key, 0) - 1
        return self.store[key]

    def expire(self, key, ttl):
        pass


def _patch_fake_redis(monkeypatch, fake):
    monkeypatch.setattr(
        "redis.Redis", type("R", (), {"from_url": staticmethod(lambda *a, **k: fake)})
    )


class _BrokenRedis:
    @staticmethod
    def from_url(*a, **k):
        raise ConnectionError("redis unreachable")


def test_ollama_guard_grants_slot_under_the_cap(monkeypatch):
    monkeypatch.setattr(llm_service.settings, "OLLAMA_MAX_CONCURRENT", 4)
    _patch_fake_redis(monkeypatch, _FakeInflightRedis())
    with llm_service.ollama_concurrency_guard() as has_slot:
        assert has_slot is True


def test_ollama_guard_denies_slot_once_cap_is_reached(monkeypatch):
    monkeypatch.setattr(llm_service.settings, "OLLAMA_MAX_CONCURRENT", 2)
    fake_redis = _FakeInflightRedis()
    _patch_fake_redis(monkeypatch, fake_redis)

    with llm_service.ollama_concurrency_guard() as slot_1:
        assert slot_1 is True
        with llm_service.ollama_concurrency_guard() as slot_2:
            assert slot_2 is True
            with llm_service.ollama_concurrency_guard() as slot_3:
                assert slot_3 is False  # 3rd concurrent call, cap is 2


def test_ollama_guard_releases_slot_on_exit_for_next_caller(monkeypatch):
    monkeypatch.setattr(llm_service.settings, "OLLAMA_MAX_CONCURRENT", 1)
    fake_redis = _FakeInflightRedis()
    _patch_fake_redis(monkeypatch, fake_redis)

    with llm_service.ollama_concurrency_guard() as slot_1:
        assert slot_1 is True
    # First call released its slot on exit, so a second, later call succeeds.
    with llm_service.ollama_concurrency_guard() as slot_2:
        assert slot_2 is True


def test_ollama_guard_fails_open_when_redis_is_unreachable(monkeypatch):
    monkeypatch.setattr(llm_service.settings, "OLLAMA_MAX_CONCURRENT", 1)
    _patch_fake_redis(monkeypatch, _BrokenRedis())
    with llm_service.ollama_concurrency_guard() as has_slot:
        assert has_slot is True


def test_ollama_guard_disabled_when_max_concurrent_is_zero(monkeypatch):
    monkeypatch.setattr(llm_service.settings, "OLLAMA_MAX_CONCURRENT", 0)
    _patch_fake_redis(monkeypatch, _BrokenRedis())  # never touched
    with llm_service.ollama_concurrency_guard() as has_slot:
        assert has_slot is True


def test_chat_json_returns_fallback_when_ollama_is_at_capacity(monkeypatch):
    monkeypatch.setattr(llm_service.settings, "OLLAMA_MAX_CONCURRENT", 1)
    fake_redis = _FakeInflightRedis()
    _patch_fake_redis(monkeypatch, fake_redis)
    calls = []

    def fake_chat_json_request(*a, **k):
        calls.append(1)
        return {"score": 99}

    monkeypatch.setattr(llm_service, "chat_json_request", fake_chat_json_request)

    with llm_service.ollama_concurrency_guard():  # occupies the only slot
        result = llm_service.chat_json("sys", "user", fallback={"score": 0})

    assert result == {"score": 0}
    assert calls == []  # never even attempted the HTTP call


def test_chat_json_skips_guard_for_non_ollama_provider(monkeypatch):
    monkeypatch.setattr(llm_service.settings, "LLM_PROVIDER", "openai")
    monkeypatch.setattr(llm_service.settings, "LLM_API_KEY", "sk-test")
    monkeypatch.setattr(llm_service.settings, "OLLAMA_MAX_CONCURRENT", 1)

    def _boom(*a, **k):
        raise AssertionError("guard should not be consulted for non-ollama providers")

    monkeypatch.setattr(llm_service, "ollama_concurrency_guard", _boom)

    response = _FakeResponse(json_data={
        "choices": [{"message": {"content": '{"score": 5}'}}]
    })
    _patch_client(monkeypatch, response=response)
    result = llm_service.chat_json("sys", "user", fallback={"score": 0})
    assert result == {"score": 5}
