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
    monkeypatch.setattr(svc, "_get", lambda url, retries=3: payload)
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
    monkeypatch.setattr(svc, "_get", lambda url, retries=3: rss)
    out = RSSAdapter(name="Feed", url="http://f").fetch()
    assert len(out) == 1
    assert out[0]["title"] == "Vaga A"
    assert out[0]["sourceUrl"] == "http://a/1"
