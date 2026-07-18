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
    # Greenhouse's `content` field is HTML — stripped to plain text so it
    # doesn't render literal tags downstream (rendered as plain JSX text).
    assert job["description"] == "We are hiring."


def test_greenhouse_adapter_unescapes_html_entities_before_stripping_tags(monkeypatch):
    fixture = {
        "jobs": [
            {
                "id": 125,
                "title": "Data Analyst",
                "content": "&lt;p&gt;We need a &quot;great&quot; analyst.&lt;/p&gt;",
            },
        ]
    }
    monkeypatch.setattr(
        svc, "_conditional_get",
        lambda url, retries=3, timeout=None, user_agent=None, prev_etag=None, prev_last_modified=None, prev_body_hash=None: svc.FetchOutcome(body=json.dumps(fixture), unchanged=False),
    )
    jobs = GreenhouseAdapter(name="Acme", url="acme").fetch()
    assert jobs[0]["description"] == 'We need a "great" analyst.'


def test_greenhouse_adapter_leaves_plain_text_description_untouched(monkeypatch):
    fixture = {"jobs": [{"id": 126, "title": "Recruiter", "content": "A perfectly plain description."}]}
    monkeypatch.setattr(
        svc, "_conditional_get",
        lambda url, retries=3, timeout=None, user_agent=None, prev_etag=None, prev_last_modified=None, prev_body_hash=None: svc.FetchOutcome(body=json.dumps(fixture), unchanged=False),
    )
    jobs = GreenhouseAdapter(name="Acme", url="acme").fetch()
    assert jobs[0]["description"] == "A perfectly plain description."


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


# ── Jobartis (Angola general-market board — HTML listing pages, no API/feed;
# card structure verified live 2026-07 against jobartis.com/vagas-emprego) ───

def _jobartis_card(title, company, location, details, description, href, category="Categoria X"):
    detail_items = "".join(f"<li>{d}</li>" for d in details)
    return f"""<div class="job"><p class="panel-prefix"><span>x</span></p>
      <div class="panel panel-default">
        <a class="job-link" href="{href}">
          <div class="panel-heading"><div class="w-100">
            <h2 class="job__title">{title}</h2>
            <div><h5 class="job__company d-ib">{company}</h5></div>
          </div></div>
          <div class="panel-body"><div class="row"><div class="col-md-4">
            <ul class="list-unstyled job__details"><li>{location}</li>{detail_items}</ul>
          </div><div class="col-md-8">
            <div class="job__description">{description}</div>
          </div></div></div>
        </a>
        <div class="panel-footer"><ul class="list-inline"><li><a href="/vagas-emprego/x">{category}</a></li></ul></div>
      </div></div>"""


JOBARTIS_PAGE_1 = f"""<html><body><div id="jobs_search_container">
  {_jobartis_card(
      "Logística e transporte", "Empresa líder em Logística", "Luanda, Luanda",
      ["Estágio", "1 anos de experiência exigido"],
      "Trabalhei como assistente estagiária de logística.",
      "https://www.jobartis.com/emprego-logistica-abc123",
  )}
  {_jobartis_card(
      "Contabilista Sénior", "Empresa líder em Finanças", "Benguela, Benguela",
      ["Tempo indeterminado"],
      "Procuramos contabilista com experiência em SAP.",
      "https://www.jobartis.com/emprego-contabilista-def456",
      category="Contabilidade e finanças",
  )}
  <div class="job"><div class="panel panel-default">
    <!-- malformed: no a.job-link at all -->
    <div class="panel-body"><h2 class="job__title">Vaga sem link</h2></div>
  </div></div>
  {_jobartis_card(
      "Vaga com link perigoso", "Empresa X", "Luanda, Luanda", [], "desc",
      "javascript:alert(1)",
  )}
</div></body></html>"""


def test_jobartis_adapter_normalises_real_card_shape(monkeypatch):
    monkeypatch.setattr(
        svc, "_conditional_get",
        lambda url, retries=3, timeout=None, user_agent=None, prev_etag=None, prev_last_modified=None, prev_body_hash=None: svc.FetchOutcome(body=JOBARTIS_PAGE_1, unchanged=False),
    )
    # max_results=3 caps at exactly page 1's ingestable cards (2 valid + the
    # dangerous-href one, which still ingests with sourceUrl nulled) — keeps
    # this test about field-shape correctness, not pagination behaviour.
    jobs = svc.JobartisAdapter(name="Jobartis", url="https://www.jobartis.com/vagas-emprego", max_results=3).fetch()

    # The malformed (no-link) card is dropped; the dangerous-href card's
    # sourceUrl is nulled by safe_http_url() inside _normalise but the item
    # itself still ingests (title/company/etc. are still useful to a curator).
    assert len(jobs) == 3
    first = jobs[0]
    assert first["title"] == "Logística e transporte"
    assert first["company"] == "Empresa líder em Logística"
    assert first["location"] == "Luanda, Luanda"
    assert first["category"] == "Categoria X"
    assert "Estágio" in first["description"]
    assert "assistente estagiária" in first["description"]
    assert first["sourceUrl"] == "https://www.jobartis.com/emprego-logistica-abc123"

    second = jobs[1]
    assert second["category"] == "Contabilidade e finanças"

    dangerous = next(j for j in jobs if j["title"] == "Vaga com link perigoso")
    assert dangerous["sourceUrl"] is None


def test_jobartis_adapter_drops_malformed_card_without_link(monkeypatch):
    monkeypatch.setattr(
        svc, "_conditional_get",
        lambda url, retries=3, timeout=None, user_agent=None, prev_etag=None, prev_last_modified=None, prev_body_hash=None: svc.FetchOutcome(body=JOBARTIS_PAGE_1, unchanged=False),
    )
    jobs = svc.JobartisAdapter(name="Jobartis", url="https://www.jobartis.com/vagas-emprego").fetch()
    assert "Vaga sem link" not in [j["title"] for j in jobs]


def test_jobartis_adapter_stops_once_limit_reached_without_extra_pages(monkeypatch):
    calls = []

    def fake_get(url, retries=3, timeout=None, user_agent=None, prev_etag=None, prev_last_modified=None, prev_body_hash=None):
        calls.append(url)
        return svc.FetchOutcome(body=JOBARTIS_PAGE_1, unchanged=False)

    monkeypatch.setattr(svc, "_conditional_get", fake_get)
    jobs = svc.JobartisAdapter(name="Jobartis", url="https://www.jobartis.com/vagas-emprego", max_results=2).fetch()
    assert len(jobs) == 2
    assert len(calls) == 1  # page 1 alone already had enough valid cards


def test_jobartis_adapter_paginates_when_more_results_wanted(monkeypatch):
    calls = []

    def fake_get(url, retries=3, timeout=None, user_agent=None, prev_etag=None, prev_last_modified=None, prev_body_hash=None):
        calls.append(url)
        return svc.FetchOutcome(body=JOBARTIS_PAGE_1, unchanged=False)

    monkeypatch.setattr(svc, "_conditional_get", fake_get)
    svc.JobartisAdapter(name="Jobartis", url="https://www.jobartis.com/vagas-emprego", max_results=100).fetch()
    # 3 valid cards per page < 100 requested -> keeps paging up to the cap.
    assert len(calls) == svc.JobartisAdapter._MAX_PAGES
    assert any("page=2" in u for u in calls)
    assert any("page=3" in u for u in calls)


def test_jobartis_adapter_unreachable_returns_empty(monkeypatch):
    monkeypatch.setattr(
        svc, "_conditional_get",
        lambda url, retries=3, timeout=None, user_agent=None, prev_etag=None, prev_last_modified=None, prev_body_hash=None: svc.FetchOutcome(body=None, unchanged=False),
    )
    assert svc.JobartisAdapter(name="Jobartis", url="https://www.jobartis.com/vagas-emprego").fetch() == []


def test_jobartis_adapter_malformed_html_returns_empty(monkeypatch):
    monkeypatch.setattr(
        svc, "_conditional_get",
        lambda url, retries=3, timeout=None, user_agent=None, prev_etag=None, prev_last_modified=None, prev_body_hash=None: svc.FetchOutcome(body="not html at all, no job cards here", unchanged=False),
    )
    assert svc.JobartisAdapter(name="Jobartis", url="https://www.jobartis.com/vagas-emprego").fetch() == []


def test_jobartis_adapter_defaults_url_when_source_row_url_is_not_absolute(monkeypatch):
    calls = []

    def fake_get(url, retries=3, timeout=None, user_agent=None, prev_etag=None, prev_last_modified=None, prev_body_hash=None):
        calls.append(url)
        return svc.FetchOutcome(body=JOBARTIS_PAGE_1, unchanged=False)

    monkeypatch.setattr(svc, "_conditional_get", fake_get)
    svc.JobartisAdapter(name="Jobartis", url="", max_results=3).fetch()
    assert calls[0] == "https://www.jobartis.com/vagas-emprego"


# ── Airswift (international energy/engineering recruiter, Angola-market
# postings — card structure verified live 2026-07 against airswift.com/jobs) ─

def _airswift_card(title, location, employment_type, summary, href):
    return f"""<article class="c-card-job-item">
      <div class="c-card-job-item__top">
        <p class="c-card-job-item__top-cell c-card-job-item__top-cell--left">{employment_type}</p>
        <p class="c-card-job-item__top-cell c-card-job-item__top-cell--right">17 Jul 2026</p>
      </div>
      <div>
        <p class="c-card-job-item__location">{location}</p>
        <p class="c-card-job-item__title"><a href="{href}">{title}</a></p>
        <p class="c-card-job-item__summary">{summary}</p>
      </div>
      <div class="c-card-job-item__bottom"><a class="c-button c-button--alpha" href="{href}">View Job and Apply</a></div>
    </article>"""


AIRSWIFT_PAGE_1 = f"""<html><body><div class="jobs-list">
  {_airswift_card(
      "Project Information Consultant", "Houston, Texas, United States", "Contract",
      "Duration: Initially 1-year. Location: Houston, TX.",
      "/jobs/project-information-consultant-1277208",
  )}
  {_airswift_card(
      "Commissioning Engineer", "Luanda, Angola", "Permanent",
      "Airswift is partnering with a major operator to recruit a commissioning engineer.",
      "/jobs/commissioning-engineer-1277300",
  )}
  {_airswift_card(
      "HSE Advisor", "Soyo, Angola", "Contract",
      "Support HSE compliance for an offshore project.",
      "/jobs/hse-advisor-1277301",
  )}
  <article class="c-card-job-item">
    <div><p class="c-card-job-item__location">Luanda, Angola</p></div>
    <!-- malformed: no title link -->
  </article>
</div></body></html>"""


def test_airswift_adapter_filters_out_non_angola_listings(monkeypatch):
    monkeypatch.setattr(
        svc, "_conditional_get",
        lambda url, retries=3, timeout=None, user_agent=None, prev_etag=None, prev_last_modified=None, prev_body_hash=None: svc.FetchOutcome(body=AIRSWIFT_PAGE_1, unchanged=False),
    )
    # Caps at exactly page 1's 2 Angola-matching cards — this test is about
    # the location filter, not pagination (covered separately below).
    jobs = svc.AirswiftAdapter(name="Airswift", url="https://www.airswift.com/jobs", max_results=2).fetch()

    titles = {j["title"] for j in jobs}
    assert "Project Information Consultant" not in titles  # Houston, not Angola — dropped
    assert "Commissioning Engineer" in titles
    assert "HSE Advisor" in titles
    assert len(jobs) == 2  # the malformed (no-link) card is also dropped


def test_airswift_adapter_normalises_matching_cards(monkeypatch):
    monkeypatch.setattr(
        svc, "_conditional_get",
        lambda url, retries=3, timeout=None, user_agent=None, prev_etag=None, prev_last_modified=None, prev_body_hash=None: svc.FetchOutcome(body=AIRSWIFT_PAGE_1, unchanged=False),
    )
    jobs = svc.AirswiftAdapter(name="Airswift", url="https://www.airswift.com/jobs", max_results=2).fetch()
    job = next(j for j in jobs if j["title"] == "Commissioning Engineer")

    assert job["company"] == "Airswift"  # fixed — the card never names the real hiring company
    assert job["location"] == "Luanda, Angola"
    assert job["sourceUrl"] == "https://www.airswift.com/jobs/commissioning-engineer-1277300"
    assert "Permanent" in job["description"]
    assert "commissioning engineer" in job["description"]


def test_airswift_adapter_case_insensitive_angola_match(monkeypatch):
    page = f"""<html><body>{_airswift_card("Field Tech", "ANGOLA (Cabinda)", "Contract", "desc", "/jobs/field-tech-1")}</body></html>"""
    monkeypatch.setattr(
        svc, "_conditional_get",
        lambda url, retries=3, timeout=None, user_agent=None, prev_etag=None, prev_last_modified=None, prev_body_hash=None: svc.FetchOutcome(body=page, unchanged=False),
    )
    jobs = svc.AirswiftAdapter(name="Airswift", url="https://www.airswift.com/jobs", max_results=1).fetch()
    assert len(jobs) == 1


def test_airswift_adapter_unreachable_returns_empty(monkeypatch):
    monkeypatch.setattr(
        svc, "_conditional_get",
        lambda url, retries=3, timeout=None, user_agent=None, prev_etag=None, prev_last_modified=None, prev_body_hash=None: svc.FetchOutcome(body=None, unchanged=False),
    )
    assert svc.AirswiftAdapter(name="Airswift", url="https://www.airswift.com/jobs").fetch() == []


def test_airswift_adapter_paginates_using_page_num_param(monkeypatch):
    calls = []

    def fake_get(url, retries=3, timeout=None, user_agent=None, prev_etag=None, prev_last_modified=None, prev_body_hash=None):
        calls.append(url)
        return svc.FetchOutcome(body=AIRSWIFT_PAGE_1, unchanged=False)

    monkeypatch.setattr(svc, "_conditional_get", fake_get)
    svc.AirswiftAdapter(name="Airswift", url="https://www.airswift.com/jobs", max_results=100).fetch()
    assert len(calls) == svc.AirswiftAdapter._MAX_PAGES
    assert any("page_num=2" in u for u in calls)


def test_airswift_adapter_defaults_url_when_source_row_url_is_not_absolute(monkeypatch):
    calls = []

    def fake_get(url, retries=3, timeout=None, user_agent=None, prev_etag=None, prev_last_modified=None, prev_body_hash=None):
        calls.append(url)
        return svc.FetchOutcome(body=AIRSWIFT_PAGE_1, unchanged=False)

    monkeypatch.setattr(svc, "_conditional_get", fake_get)
    svc.AirswiftAdapter(name="Airswift", url="not-a-url", max_results=2).fetch()
    assert calls[0] == "https://www.airswift.com/jobs"


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


# ── strip_html() direct unit coverage ────────────────────────────────────────

def test_strip_html_removes_tags_and_collapses_whitespace():
    assert svc.strip_html("<p>Hello   <b>world</b>.</p>") == "Hello world ."


def test_strip_html_returns_none_for_empty_or_none_input():
    assert svc.strip_html(None) is None
    assert svc.strip_html("") is None
    assert svc.strip_html("   ") is None
    assert svc.strip_html("<br/>") is None


def test_strip_html_leaves_plain_text_untouched():
    assert svc.strip_html("Just plain text, no markup.") == "Just plain text, no markup."


def test_strip_html_unescapes_common_entities():
    assert svc.strip_html("Tom &amp; Jerry") == "Tom & Jerry"
    assert svc.strip_html("&quot;quoted&quot;") == '"quoted"'
