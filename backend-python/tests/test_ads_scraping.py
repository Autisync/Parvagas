"""Unit tests for ads delivery logic + scraper normalisation/dedup (pure, no DB)."""
from datetime import datetime, timedelta
from types import SimpleNamespace

from app.api.v1.ads import ad_spent, budget_exhausted, _is_live, _matches_target
from app.services.scraper_service import content_hash, JSONFeedAdapter, RSSAdapter


def _ad(**over):
    base = dict(
        active=True, flagged=False, start_date=None, end_date=None,
        budget=None, cost_per_click=0, cost_per_impression=0,
        clicks=0, impressions=0, target_category=None, target_location=None,
    )
    base.update(over)
    return SimpleNamespace(**base)


# ---- budget / spend ----

def test_ad_spent_uses_cost_model():
    ad = _ad(clicks=10, impressions=1000, cost_per_click=2, cost_per_impression=0.01)
    assert ad_spent(ad) == 10 * 2 + 1000 * 0.01


def test_budget_exhausted_only_when_budget_set_and_reached():
    assert budget_exhausted(_ad(budget=0, clicks=100, cost_per_click=1)) is False  # 0 = unlimited
    assert budget_exhausted(_ad(budget=100, clicks=50, cost_per_click=1)) is False
    assert budget_exhausted(_ad(budget=100, clicks=100, cost_per_click=1)) is True


# ---- liveness ----

def test_is_live_respects_active_flag_dates_and_budget():
    now = datetime(2026, 6, 1)
    assert _is_live(_ad(), now) is True
    assert _is_live(_ad(active=False), now) is False
    assert _is_live(_ad(flagged=True), now) is False
    assert _is_live(_ad(start_date=now + timedelta(days=1)), now) is False  # scheduled
    assert _is_live(_ad(end_date=now - timedelta(days=1)), now) is False    # expired
    assert _is_live(_ad(budget=10, clicks=10, cost_per_click=1), now) is False  # exhausted


# ---- targeting ----

def test_matches_target_empty_targets_match_everything():
    assert _matches_target(_ad(), "Tecnologia", "Luanda") is True


def test_matches_target_category_and_location():
    ad = _ad(target_category="Tecnologia", target_location="Luanda")
    assert _matches_target(ad, "tecnologia", "Luanda Centro") is True   # case-insensitive + substring
    assert _matches_target(ad, "Saúde", "Luanda") is False
    assert _matches_target(ad, "Tecnologia", "Benguela") is False
    # No request context still allowed (placement-level fallback)
    assert _matches_target(ad, None, None) is True


# ---- scraper dedup hash ----

def test_content_hash_is_stable_and_case_insensitive():
    a = content_hash("Engenheiro Backend", "Acme", "Luanda")
    b = content_hash("  engenheiro backend ", "ACME", "luanda")
    assert a == b
    assert a != content_hash("Engenheiro Frontend", "Acme", "Luanda")


# ---- scraper adapters normalisation ----

def test_json_adapter_normalises(monkeypatch):
    import app.services.scraper_service as svc
    payload = '{"jobs":[{"title":"Dev","company":"X","location":"Luanda","url":"http://x/1"},{"title":""}]}'
    monkeypatch.setattr(
        svc, "_conditional_get",
        lambda url, retries=3, timeout=None, user_agent=None, prev_etag=None, prev_last_modified=None, prev_body_hash=None: svc.FetchOutcome(body=payload, unchanged=False),
    )
    out = JSONFeedAdapter(name="X", url="http://x", category="Tech").fetch()
    assert len(out) == 1  # blank-title row dropped
    assert out[0]["title"] == "Dev"
    assert out[0]["category"] == "Tech"       # falls back to adapter category
    assert out[0]["source"] == "X"
    assert out[0]["sourceUrl"] == "http://x/1"


def test_rss_adapter_parses_items(monkeypatch):
    import app.services.scraper_service as svc
    rss = """<rss><channel>
      <item><title>Vaga A</title><description>d</description><link>http://a/1</link></item>
      <item><title></title></item>
    </channel></rss>"""
    monkeypatch.setattr(
        svc, "_conditional_get",
        lambda url, retries=3, timeout=None, user_agent=None, prev_etag=None, prev_last_modified=None, prev_body_hash=None: svc.FetchOutcome(body=rss, unchanged=False),
    )
    out = RSSAdapter(name="Feed", url="http://f").fetch()
    assert len(out) == 1
    assert out[0]["title"] == "Vaga A"
    assert out[0]["sourceUrl"] == "http://a/1"


def test_rss_adapter_ingests_angoemprego_feed_shape_including_roundup_articles(monkeypatch):
    """Ango Emprego (angoemprego.com/feed) is a live, scoutable RSS 2.0
    feed the existing RSSAdapter already handles — no new adapter code
    needed, just a ScraperSource row of type "rss" pointed at it. Its
    items are mostly one-per-job, but it occasionally mixes in daily
    roundup articles ("🔥 30 Vagas..."). The adapter deliberately does NOT
    try to filter those out — they land in the pending curation queue like
    everything else, where an admin recognises and rejects them by eye;
    building title-pattern heuristics into the scraper itself would be
    fragile and just move the false-negative risk somewhere less visible.
    """
    import app.services.scraper_service as svc

    rss = """<rss version="2.0"><channel>
      <title>Ango Emprego</title>
      <item>
        <title>Coordenador(a) Técnico(a) de Farmácia</title>
        <link>https://angoemprego.com/vagas/coordenador-tecnico-farmacia/</link>
        <description>Empresa do setor farmacêutico procura coordenador... Continue Lendo</description>
        <pubDate>Fri, 17 Jul 2026 08:00:00 +0000</pubDate>
      </item>
      <item>
        <title>Mecânico de Veículos Sénior</title>
        <link>https://angoemprego.com/vagas/mecanico-veiculos-senior/</link>
        <description>Oficina em Luanda contrata mecânico com experiência... Continue Lendo</description>
        <pubDate>Fri, 17 Jul 2026 07:30:00 +0000</pubDate>
      </item>
      <item>
        <title>🔥 30 Vagas de Emprego em Angola Hoje – 17/07/2026</title>
        <link>https://angoemprego.com/2026/07/17/30-vagas-hoje/</link>
        <description>Confira as 30 vagas selecionadas para hoje... Continue Lendo</description>
        <pubDate>Fri, 17 Jul 2026 06:00:00 +0000</pubDate>
      </item>
    </channel></rss>"""
    monkeypatch.setattr(
        svc, "_conditional_get",
        lambda url, retries=3, timeout=None, user_agent=None, prev_etag=None, prev_last_modified=None, prev_body_hash=None: svc.FetchOutcome(body=rss, unchanged=False),
    )

    out = RSSAdapter(name="Ango Emprego", url="https://angoemprego.com/feed").fetch()

    assert len(out) == 3
    titles = {item["title"] for item in out}
    assert "Coordenador(a) Técnico(a) de Farmácia" in titles
    assert "Mecânico de Veículos Sénior" in titles
    assert "🔥 30 Vagas de Emprego em Angola Hoje – 17/07/2026" in titles
    for item in out:
        assert item["sourceUrl"].startswith("https://angoemprego.com/")
        assert item["source"] == "Ango Emprego"


# ---- scraper hiring-deadline normalisation ----

def test_json_adapter_normalises_deadline_field(monkeypatch):
    import app.services.scraper_service as svc
    payload = '{"jobs":[{"title":"Dev","company":"X","deadline":"2026-08-01"}]}'
    monkeypatch.setattr(
        svc, "_conditional_get",
        lambda url, retries=3, timeout=None, user_agent=None, prev_etag=None, prev_last_modified=None, prev_body_hash=None: svc.FetchOutcome(body=payload, unchanged=False),
    )
    out = JSONFeedAdapter(name="X", url="http://x").fetch()
    assert out[0]["deadline"] == "2026-08-01"


def test_json_adapter_accepts_deadline_field_aliases(monkeypatch):
    import app.services.scraper_service as svc
    for key in ("closingDate", "applicationDeadline", "expiresAt"):
        payload = f'{{"jobs":[{{"title":"Dev","{key}":"2026-09-15"}}]}}'
        monkeypatch.setattr(
        svc, "_conditional_get",
        lambda url, retries=3, timeout=None, user_agent=None, prev_etag=None, prev_last_modified=None, prev_body_hash=None: svc.FetchOutcome(body=payload, unchanged=False),
    )
        out = JSONFeedAdapter(name="X", url="http://x").fetch()
        assert out[0]["deadline"] == "2026-09-15", f"alias {key} not picked up"


def test_json_adapter_deadline_absent_is_none(monkeypatch):
    import app.services.scraper_service as svc
    payload = '{"jobs":[{"title":"Dev"}]}'
    monkeypatch.setattr(
        svc, "_conditional_get",
        lambda url, retries=3, timeout=None, user_agent=None, prev_etag=None, prev_last_modified=None, prev_body_hash=None: svc.FetchOutcome(body=payload, unchanged=False),
    )
    out = JSONFeedAdapter(name="X", url="http://x").fetch()
    assert out[0]["deadline"] is None


# ---- scraper -> ScrapedJob ingestion deadline parsing ----

def test_parse_scraped_deadline_handles_date_and_datetime():
    from app.workers.tasks import _parse_scraped_deadline

    assert _parse_scraped_deadline("2026-08-01") == datetime(2026, 8, 1)
    assert _parse_scraped_deadline("2026-08-01T10:00:00Z") == datetime(2026, 8, 1, 10, 0, 0)


def test_parse_scraped_deadline_handles_blank_and_garbage():
    from app.workers.tasks import _parse_scraped_deadline

    assert _parse_scraped_deadline(None) is None
    assert _parse_scraped_deadline("") is None
    assert _parse_scraped_deadline("not-a-date") is None
