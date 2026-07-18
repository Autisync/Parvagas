"""Tests for the Greenhouse/Lever/Careerjet scraper adapters (Phase 3,
TEST_PLAN_CAREER_OPS.md). Fixture-driven — no live network, matching the
existing JSON/RSS adapter test pattern in test_ads_scraping.py.

Greenhouse/Lever field shapes are hand-authored from each platform's
documented public API (no live verification was possible when written —
see their docstrings in scraper_service.py). The Careerjet fixture is built
from the response schema documented at careerjet.com/partners/api (verified
via their official docs + Python client, not memory) — see
CareerjetAdapter's docstring for the important caveat about using it as a
scraping source at all.
"""
import json
import uuid

import app.services.scraper_service as svc
from app.db.base import Base
from app.db.session import engine, SessionLocal
from app.models import ScraperSettings, ScraperSource
from app.services.scraper_service import CareerjetAdapter, GreenhouseAdapter, LeverAdapter, get_adapters

Base.metadata.create_all(engine)


def _make_source(db, **over):
    base = dict(id=str(uuid.uuid4()), name="Acme GH", type="greenhouse", url="acme", enabled=True)
    base.update(over)
    row = ScraperSource(**base)
    db.add(row)
    db.flush()
    return row


# ── Greenhouse ───────────────────────────────────────────────────────────────

GREENHOUSE_FIXTURE = {
    "jobs": [
        {
            "id": 123,
            "title": "Software Engineer",
            "location": {"name": "Luanda, Angola"},
            "departments": [{"name": "Engineering"}],
            "content": "<p>We are hiring.</p>",
            "absolute_url": "https://boards.greenhouse.io/acme/jobs/123",
        },
        {"id": 124, "title": "", "location": {"name": "Remote"}},  # no title -> dropped
    ]
}


def test_greenhouse_adapter_normalises(monkeypatch):
    monkeypatch.setattr(
        svc, "_conditional_get",
        lambda url, retries=3, timeout=None, user_agent=None, prev_etag=None, prev_last_modified=None, prev_body_hash=None: svc.FetchOutcome(body=json.dumps(GREENHOUSE_FIXTURE), unchanged=False),
    )
    adapter = GreenhouseAdapter(name="Acme", url="acme")
    jobs = adapter.fetch()
    assert len(jobs) == 1
    job = jobs[0]
    assert job["title"] == "Software Engineer"
    assert job["location"] == "Luanda, Angola"
    assert job["category"] == "Engineering"
    assert job["sourceUrl"] == "https://boards.greenhouse.io/acme/jobs/123"
    assert job["source"] == "Acme"


def test_greenhouse_adapter_expands_bare_token_to_api_url():
    adapter = GreenhouseAdapter(name="Acme", url="acme")
    assert adapter._api_url() == "https://boards-api.greenhouse.io/v1/boards/acme/jobs?content=true"


def test_greenhouse_adapter_accepts_full_url_unchanged():
    full = "https://boards-api.greenhouse.io/v1/boards/acme/jobs?content=true"
    adapter = GreenhouseAdapter(name="Acme", url=full)
    assert adapter._api_url() == full


def test_greenhouse_adapter_malformed_json_returns_empty(monkeypatch):
    monkeypatch.setattr(
        svc, "_conditional_get",
        lambda url, retries=3, timeout=None, user_agent=None, prev_etag=None, prev_last_modified=None, prev_body_hash=None: svc.FetchOutcome(body="not json", unchanged=False),
    )
    assert GreenhouseAdapter(name="Acme", url="acme").fetch() == []


def test_greenhouse_adapter_unreachable_returns_empty(monkeypatch):
    monkeypatch.setattr(
        svc, "_conditional_get",
        lambda url, retries=3, timeout=None, user_agent=None, prev_etag=None, prev_last_modified=None, prev_body_hash=None: svc.FetchOutcome(body=None, unchanged=False),
    )
    assert GreenhouseAdapter(name="Acme", url="acme").fetch() == []


# ── Lever ────────────────────────────────────────────────────────────────────

LEVER_FIXTURE = [
    {
        "id": "abc",
        "text": "Backend Engineer",
        "categories": {"location": "Luanda", "team": "Engineering", "commitment": "Full-time"},
        "descriptionPlain": "Join our backend team.",
        "hostedUrl": "https://jobs.lever.co/acme/abc",
        "applicationDeadline": "2026-12-31",
    },
    {"id": "def", "text": ""},  # no title -> dropped
]


def test_lever_adapter_normalises(monkeypatch):
    monkeypatch.setattr(
        svc, "_conditional_get",
        lambda url, retries=3, timeout=None, user_agent=None, prev_etag=None, prev_last_modified=None, prev_body_hash=None: svc.FetchOutcome(body=json.dumps(LEVER_FIXTURE), unchanged=False),
    )
    jobs = LeverAdapter(name="Acme", url="acme").fetch()
    assert len(jobs) == 1
    job = jobs[0]
    assert job["title"] == "Backend Engineer"
    assert job["location"] == "Luanda"
    assert job["category"] == "Engineering"
    assert job["sourceUrl"] == "https://jobs.lever.co/acme/abc"
    assert job["deadline"] == "2026-12-31"


def test_lever_adapter_expands_bare_slug_to_api_url():
    adapter = LeverAdapter(name="Acme", url="acme")
    assert adapter._api_url() == "https://api.lever.co/v0/postings/acme?mode=json"


def test_lever_adapter_non_list_response_returns_empty(monkeypatch):
    monkeypatch.setattr(
        svc, "_conditional_get",
        lambda url, retries=3, timeout=None, user_agent=None, prev_etag=None, prev_last_modified=None, prev_body_hash=None: svc.FetchOutcome(body=json.dumps({"unexpected": "shape"}), unchanged=False),
    )
    assert LeverAdapter(name="Acme", url="acme").fetch() == []


# ── Careerjet (Angola-market-verified — see module docstring) ────────────────

CAREERJET_FIXTURE = {
    "type": "JOBS",
    "hits": 2,
    "jobs": [
        {
            "title": "Python Developer",
            "company": "NBC",
            "locations": "Luanda",
            "description": "Backend role using Python and SQL.",
            "url": "https://www.careerjet.co.ao/jobview/12345",
            "salary": "$30000 - 33000",
            "site": "careerjet.co.ao",
        },
        {"title": "", "company": "Empty Co"},  # no title -> dropped
    ],
}


def test_careerjet_adapter_normalises(monkeypatch):
    monkeypatch.setattr(
        svc, "_conditional_get",
        lambda url, retries=3, timeout=None, user_agent=None, prev_etag=None, prev_last_modified=None, prev_body_hash=None: svc.FetchOutcome(body=json.dumps(CAREERJET_FIXTURE), unchanged=False),
    )
    adapter = CareerjetAdapter(name="Careerjet Angola", url="test-affid", category="Tecnologia")
    jobs = adapter.fetch()
    assert len(jobs) == 1
    job = jobs[0]
    assert job["title"] == "Python Developer"
    assert job["company"] == "NBC"
    assert job["location"] == "Luanda"
    assert job["sourceUrl"] == "https://www.careerjet.co.ao/jobview/12345"


def test_careerjet_adapter_without_affid_skips_request(monkeypatch):
    calls = []
    monkeypatch.setattr(
        svc, "_conditional_get",
        lambda url, retries=3, timeout=None, user_agent=None, prev_etag=None, prev_last_modified=None, prev_body_hash=None: svc.FetchOutcome(body=calls.append(url) or json.dumps(CAREERJET_FIXTURE), unchanged=False),
    )
    assert CareerjetAdapter(name="Careerjet Angola", url="").fetch() == []
    assert calls == []  # never even attempted the request without an affid


def test_careerjet_adapter_request_includes_affid_and_angola_location(monkeypatch):
    captured = {}

    def _fake_get(url, retries=3, timeout=None, user_agent=None, prev_etag=None, prev_last_modified=None, prev_body_hash=None):
        captured["url"] = url
        return svc.FetchOutcome(body=json.dumps(CAREERJET_FIXTURE), unchanged=False)

    monkeypatch.setattr(svc, "_conditional_get", _fake_get)
    CareerjetAdapter(name="Careerjet Angola", url="my-affid").fetch()
    assert "affid=my-affid" in captured["url"]
    assert "location=Angola" in captured["url"]
    assert captured["url"].startswith(svc.CareerjetAdapter._ENDPOINT)


def test_careerjet_adapter_malformed_json_returns_empty(monkeypatch):
    monkeypatch.setattr(
        svc, "_conditional_get",
        lambda url, retries=3, timeout=None, user_agent=None, prev_etag=None, prev_last_modified=None, prev_body_hash=None: svc.FetchOutcome(body="not json", unchanged=False),
    )
    assert CareerjetAdapter(name="Careerjet Angola", url="test-affid").fetch() == []


def test_careerjet_adapter_unreachable_returns_empty(monkeypatch):
    monkeypatch.setattr(
        svc, "_conditional_get",
        lambda url, retries=3, timeout=None, user_agent=None, prev_etag=None, prev_last_modified=None, prev_body_hash=None: svc.FetchOutcome(body=None, unchanged=False),
    )
    assert CareerjetAdapter(name="Careerjet Angola", url="test-affid").fetch() == []


# ── get_adapters() wiring — admin-managed ScraperSource/ScraperSettings ──────

def test_get_adapters_builds_new_portal_types():
    db = SessionLocal()
    try:
        _make_source(db, name="Acme GH", type="greenhouse", url="acme")
        _make_source(db, id=str(uuid.uuid4()), name="Acme Lever", type="lever", url="acme")
        db.commit()

        adapters = get_adapters(db)
        assert [type(a).__name__ for a in adapters] == ["GreenhouseAdapter", "LeverAdapter"]
    finally:
        db.query(ScraperSource).delete()
        db.commit()
        db.close()


def test_get_adapters_skips_disabled_sources():
    db = SessionLocal()
    try:
        _make_source(db, name="Acme GH", type="greenhouse", url="acme", enabled=False)
        db.commit()
        assert get_adapters(db) == []
    finally:
        db.query(ScraperSource).delete()
        db.commit()
        db.close()


def test_get_adapters_skips_careerjet_even_if_row_exists():
    """Belt-and-suspenders: the admin API rejects creating a 'careerjet' row
    at all, but get_adapters() must never build one even if a row somehow
    exists (e.g. restored from an old backup)."""
    db = SessionLocal()
    try:
        _make_source(db, name="Careerjet Angola", type="careerjet", url="my-affid")
        db.commit()
        assert get_adapters(db) == []
    finally:
        db.query(ScraperSource).delete()
        db.commit()
        db.close()


def test_get_adapters_ignores_unknown_type():
    db = SessionLocal()
    try:
        _make_source(db, name="X", type="carrier-pigeon", url="https://example.com")
        db.commit()
        assert get_adapters(db) == []
    finally:
        db.query(ScraperSource).delete()
        db.commit()
        db.close()


def test_get_adapters_respects_master_kill_switch():
    db = SessionLocal()
    try:
        _make_source(db, name="Acme GH", type="greenhouse", url="acme")
        db.commit()

        settings = svc.get_scraper_settings(db)
        settings.enabled = False
        db.commit()

        assert get_adapters(db) == []
    finally:
        db.query(ScraperSource).delete()
        db.query(ScraperSettings).delete()
        db.commit()
        db.close()


def test_get_adapters_per_source_max_results_overrides_global_default():
    db = SessionLocal()
    try:
        settings = svc.get_scraper_settings(db)
        settings.default_max_per_source = 5
        db.commit()

        _make_source(db, name="Acme GH", type="greenhouse", url="acme", max_results=2)
        _make_source(db, id=str(uuid.uuid4()), name="Acme Lever", type="lever", url="acme")
        db.commit()

        adapters = get_adapters(db)
        by_name = {a.name: a for a in adapters}
        assert by_name["Acme GH"]._limit() == 2  # per-source override wins
        assert by_name["Acme Lever"]._limit() == 5  # falls back to global default
    finally:
        db.query(ScraperSource).delete()
        db.query(ScraperSettings).delete()
        db.commit()
        db.close()
