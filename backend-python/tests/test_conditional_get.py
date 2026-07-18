"""Tests for scraper_service._conditional_get — the conditional-GET layer
that lets a 2-hourly scrape run skip re-parsing a feed that hasn't changed
(304 response, or a 200 whose body hashes identically to last run).
"""
import httpx

import app.services.scraper_service as svc


class _FakeResponse:
    def __init__(self, status_code=200, text="", headers=None):
        self.status_code = status_code
        self.text = text
        self.headers = headers or {}


def _patch_get(monkeypatch, response):
    # _conditional_get does `import httpx` inside its own function body
    # (not a module-level import on scraper_service), so patching a
    # `scraper_service.httpx` attribute wouldn't reach it — that local
    # import still resolves to the same real httpx module object in
    # sys.modules, so patching httpx.get directly is what actually works.
    monkeypatch.setattr(httpx, "get", lambda *a, **k: response)


def _patch_robots_permissive(monkeypatch):
    monkeypatch.setattr(svc, "_robots_ok", lambda url, ua: True)


def test_first_fetch_returns_body_and_validators(monkeypatch):
    _patch_robots_permissive(monkeypatch)
    _patch_get(monkeypatch, _FakeResponse(200, text="hello world", headers={"ETag": '"abc"', "Last-Modified": "Mon, 01 Jan 2026 00:00:00 GMT"}))

    outcome = svc._conditional_get("http://example.com/feed.json")

    assert outcome.unchanged is False
    assert outcome.body == "hello world"
    assert outcome.etag == '"abc"'
    assert outcome.last_modified == "Mon, 01 Jan 2026 00:00:00 GMT"
    assert outcome.body_hash == svc._body_hash("hello world")


def test_304_response_is_unchanged(monkeypatch):
    _patch_robots_permissive(monkeypatch)
    _patch_get(monkeypatch, _FakeResponse(304))

    outcome = svc._conditional_get(
        "http://example.com/feed.json",
        prev_etag='"abc"', prev_last_modified="Mon, 01 Jan 2026 00:00:00 GMT", prev_body_hash="deadbeef",
    )

    assert outcome.unchanged is True
    assert outcome.body is None
    # Prior validators are preserved through a 304.
    assert outcome.etag == '"abc"'
    assert outcome.body_hash == "deadbeef"


def test_200_with_identical_body_hash_is_treated_as_unchanged(monkeypatch):
    """Some servers don't honor conditional headers and always return 200 —
    the body-hash comparison catches that case too."""
    _patch_robots_permissive(monkeypatch)
    body = "same content every time"
    _patch_get(monkeypatch, _FakeResponse(200, text=body))

    outcome = svc._conditional_get("http://example.com/feed.json", prev_body_hash=svc._body_hash(body))

    assert outcome.unchanged is True
    assert outcome.body is None


def test_200_with_different_body_hash_is_changed(monkeypatch):
    _patch_robots_permissive(monkeypatch)
    _patch_get(monkeypatch, _FakeResponse(200, text="new content"))

    outcome = svc._conditional_get("http://example.com/feed.json", prev_body_hash=svc._body_hash("old content"))

    assert outcome.unchanged is False
    assert outcome.body == "new content"


def test_request_sends_prior_validators_as_conditional_headers(monkeypatch):
    _patch_robots_permissive(monkeypatch)
    captured = {}

    def _fake_get(url, headers=None, timeout=None, follow_redirects=True):
        captured["headers"] = headers
        return _FakeResponse(304)

    monkeypatch.setattr(httpx, "get", _fake_get)

    svc._conditional_get(
        "http://example.com/feed.json",
        prev_etag='"abc"', prev_last_modified="Mon, 01 Jan 2026 00:00:00 GMT",
    )

    assert captured["headers"]["If-None-Match"] == '"abc"'
    assert captured["headers"]["If-Modified-Since"] == "Mon, 01 Jan 2026 00:00:00 GMT"


def test_robots_disallowed_returns_unchanged_false_and_no_body(monkeypatch):
    monkeypatch.setattr(svc, "_robots_ok", lambda url, ua: False)

    outcome = svc._conditional_get("http://example.com/feed.json")

    assert outcome.unchanged is False
    assert outcome.body is None


def test_legacy_get_wrapper_still_returns_plain_body_text(monkeypatch):
    """_get() is the backward-compatible string-returning wrapper other
    call sites (and adapter tests that monkeypatch _conditional_get
    directly) rely on — confirm the plain pass-through still works."""
    _patch_robots_permissive(monkeypatch)
    _patch_get(monkeypatch, _FakeResponse(200, text="plain body"))

    assert svc._get("http://example.com/feed.json") == "plain body"
