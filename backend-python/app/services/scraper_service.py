"""Pluggable job aggregation (scraping) service.

Fetches job listings from external sources and normalises them into dicts the
ScrapedJob ingestion pipeline understands. Safe by default: no sources are
configured unless SCRAPER_SOURCES is set, and every adapter sends a polite
User-Agent, respects robots.txt, and backs off on errors.

Configure via env SCRAPER_SOURCES — a JSON array, e.g.:
  [{"type":"json","name":"MyBoard","url":"https://api.board.com/jobs","category":"Tech"},
   {"type":"rss","name":"FeedX","url":"https://feedx.com/jobs.rss"},
   {"type":"greenhouse","name":"Acme","url":"acme"},
   {"type":"lever","name":"Acme","url":"acme"},
   {"type":"ashby","name":"Acme","url":"acme"}]

JSON adapter expects a list of objects (or {"jobs":[...]}) with keys like
title/company/location/category/description/url. RSS adapter reads item
title/description/link. Greenhouse/Lever/Ashby adapters talk to each
platform's public job-board API directly — `url` can be a bare board
token/company slug/board name, or a full API URL (see each adapter's
docstring for the exact endpoint and expected shape).
"""
from __future__ import annotations

import hashlib
import json
import os
import re
import time
from typing import Any
from urllib.parse import urlparse
from urllib.robotparser import RobotFileParser
from xml.etree import ElementTree as ET

from app.core.logging import get_logger

logger = get_logger(__name__)

USER_AGENT = os.getenv("SCRAPER_USER_AGENT", "Parvagas-Bot/1.0 (+https://parvagas.pt/robots.txt)")
_REQUEST_TIMEOUT = float(os.getenv("SCRAPER_TIMEOUT", "12"))
# Per-source cap — raised from the original 50 now that ingestion is bounded
# by an overall per-run budget (see tasks.scrape_external_jobs), not just this.
_MAX_PER_SOURCE = int(os.getenv("SCRAPER_MAX_PER_SOURCE", "100"))


def content_hash(title: str | None, company: str | None, location: str | None) -> str:
    """Stable dedup key from the identifying fields."""
    basis = "|".join([(title or "").strip().lower(), (company or "").strip().lower(), (location or "").strip().lower()])
    return hashlib.sha256(basis.encode("utf-8")).hexdigest()


# Ordered so the first lane whose keywords match wins — professional/remote
# terms take priority over generic entry-level phrasing that can co-occur
# (e.g. "estágio para engenheiro" should read as professional, not entry).
_AUDIENCE_LANE_KEYWORDS: list[tuple[str, tuple[str, ...]]] = [
    ("remote", ("remoto", "remote", "trabalho a partir de casa", "home office", "teletrabalho")),
    ("professional", (
        "licenciatura", "mestrado", "engenheiro", "engenheira", "gestor", "gestora",
        "diretor", "diretora", "advogado", "advogada", "contabilista", "arquiteto",
        "médico", "médica", "analista", "consultor", "consultora",
    )),
    ("skilled_trade", (
        "eletricista", "canalizador", "soldador", "mecânico", "mecânica", "carpinteiro",
        "pedreiro", "pintor", "técnico de", "técnica de", "motorista", "condutor",
    )),
    ("entry_level", (
        "sem experiência", "auxiliar", "operário", "operária", "ajudante", "estágio",
        "estagiário", "aprendiz", "servente", "empacotador",
    )),
]


def classify_audience_lane(title: str | None, category: str | None, description: str | None) -> str | None:
    """Best-effort audience-segment tag from free text — lets admins see
    whether daily intake actually spans different audiences instead of
    clustering on whichever source happened to publish that day. Returns
    None (unclassified) rather than guessing when nothing matches."""
    haystack = " ".join(filter(None, [title, category, description])).lower()
    if not haystack.strip():
        return None
    for lane, keywords in _AUDIENCE_LANE_KEYWORDS:
        if any(kw in haystack for kw in keywords):
            return lane
    return None


# Same fraud-signal patterns companies._spam_assessment uses for
# company-submitted jobs — scraped content is exposed to the same regional
# scam patterns (WhatsApp-only contact, upfront "registration fees", etc).
_SCAM_PATTERNS = [
    (r"whatsapp|telegram|\+?\d{9,}", "contacto direto fora da plataforma"),
    (r"taxa|pagamento adiantado|deposito|inscri[çc][aã]o paga|pague", "pede pagamento ao candidato"),
    (r"ganhe .* (kz|usd|\$)|renda (rapida|extra|garantida)", "promessa de renda irrealista"),
    (r"trabalh[ae] (em )?casa sem experiencia", "isco genérico de trabalho em casa"),
]

MIN_QUALITY_DESCRIPTION_CHARS = 60


def assess_scraped_job_quality(
    title: str | None,
    description: str | None,
    company_name: str | None,
    has_responsibilities: bool = False,
    has_requirements: bool = False,
) -> tuple[int, list[str]]:
    """Quality/completeness gate for scraped jobs — thin content (a 1-2
    sentence blurb, no company, no structured content) is flagged for admins
    instead of silently looking identical to a fully-curated listing.
    Non-destructive: this scores and flags, it never blocks ingestion —
    admins still make the call, same as the existing Job moderation queue.
    """
    score, flags = 0, []
    haystack = " ".join(filter(None, [title, description])).lower()
    for pattern, label in _SCAM_PATTERNS:
        if re.search(pattern, haystack):
            score += 25
            flags.append(label)

    if not (company_name or "").strip():
        score += 20
        flags.append("sem nome de empresa")

    desc = (description or "").strip()
    if not desc:
        score += 30
        flags.append("sem descrição")
    elif len(desc) < MIN_QUALITY_DESCRIPTION_CHARS:
        score += 20
        flags.append("descrição muito curta")

    if not has_responsibilities and not has_requirements:
        score += 10
        flags.append("sem responsabilidades/requisitos")

    return min(score, 100), flags


def _robots_ok(url: str) -> bool:
    try:
        parts = urlparse(url)
        rp = RobotFileParser()
        rp.set_url(f"{parts.scheme}://{parts.netloc}/robots.txt")
        rp.read()
        return rp.can_fetch(USER_AGENT, url)
    except Exception:
        # If robots can't be read, be permissive but log it.
        logger.info("robots.txt unreadable for %s; proceeding", url)
        return True


def _get(url: str, retries: int = 3) -> str | None:
    """GET with polite UA + exponential backoff. Returns text or None."""
    import httpx

    if not _robots_ok(url):
        logger.warning("robots.txt disallows scraping %s", url)
        return None
    delay = 1.0
    for attempt in range(retries):
        try:
            resp = httpx.get(url, headers={"User-Agent": USER_AGENT}, timeout=_REQUEST_TIMEOUT, follow_redirects=True)
            if resp.status_code == 200:
                return resp.text
            if resp.status_code in (429, 503):
                time.sleep(delay)
                delay *= 2
                continue
            logger.warning("scrape GET %s -> HTTP %s", url, resp.status_code)
            return None
        except Exception as exc:  # pragma: no cover - network
            logger.warning("scrape GET %s failed (attempt %s): %s", url, attempt + 1, exc)
            time.sleep(delay)
            delay *= 2
    return None


class SourceAdapter:
    """Base adapter. Subclasses implement fetch() -> list of normalised job dicts."""

    def __init__(self, name: str, url: str, category: str | None = None):
        self.name = name
        self.url = url
        self.category = category

    def fetch(self) -> list[dict[str, Any]]:  # pragma: no cover - interface
        raise NotImplementedError

    def _normalise(self, raw: dict[str, Any]) -> dict[str, Any]:
        deadline_raw = (
            raw.get("deadline") or raw.get("closingDate") or raw.get("applicationDeadline")
            or raw.get("expiresAt") or raw.get("expires_at") or ""
        )
        return {
            "title": (raw.get("title") or "").strip(),
            "company": (raw.get("company") or raw.get("companyName") or "").strip() or None,
            "location": (raw.get("location") or "").strip() or None,
            "category": (raw.get("category") or self.category or "").strip() or None,
            "description": (raw.get("description") or "").strip() or None,
            "deadline": str(deadline_raw).strip() or None,
            "source": self.name,
            "sourceUrl": (raw.get("url") or raw.get("link") or raw.get("sourceUrl") or "").strip() or None,
        }


class JSONFeedAdapter(SourceAdapter):
    def fetch(self) -> list[dict[str, Any]]:
        body = _get(self.url)
        if not body:
            return []
        try:
            data = json.loads(body)
        except Exception:
            logger.warning("JSON parse failed for %s", self.url)
            return []
        items = data.get("jobs", data) if isinstance(data, dict) else data
        if not isinstance(items, list):
            return []
        out = [self._normalise(it) for it in items[: _MAX_PER_SOURCE] if isinstance(it, dict)]
        return [o for o in out if o["title"]]


class RSSAdapter(SourceAdapter):
    def fetch(self) -> list[dict[str, Any]]:
        body = _get(self.url)
        if not body:
            return []
        try:
            root = ET.fromstring(body)
        except Exception:
            logger.warning("RSS parse failed for %s", self.url)
            return []
        out: list[dict[str, Any]] = []
        for item in root.iter("item"):
            title = (item.findtext("title") or "").strip()
            if not title:
                continue
            out.append(self._normalise({
                "title": title,
                "description": (item.findtext("description") or "").strip(),
                "link": (item.findtext("link") or "").strip(),
            }))
            if len(out) >= _MAX_PER_SOURCE:
                break
        return out


class GreenhouseAdapter(SourceAdapter):
    """Greenhouse Job Board public API (no auth). `url` may be either a bare
    board token (e.g. "acme") or the full API URL — bare tokens are expanded
    to https://boards-api.greenhouse.io/v1/boards/{token}/jobs?content=true.

    NOTE: field shape is based on Greenhouse's documented public job-board
    API, not a live-verified response (no network access when this adapter
    was written) — verify against a real board once one is configured in
    SCRAPER_SOURCES, per TEST_PLAN_CAREER_OPS.md Phase 3.
    """

    def _api_url(self) -> str:
        if self.url.startswith("http"):
            return self.url
        return f"https://boards-api.greenhouse.io/v1/boards/{self.url}/jobs?content=true"

    def fetch(self) -> list[dict[str, Any]]:
        body = _get(self._api_url())
        if not body:
            return []
        try:
            data = json.loads(body)
        except Exception:
            logger.warning("Greenhouse JSON parse failed for %s", self.url)
            return []
        jobs = data.get("jobs") if isinstance(data, dict) else None
        if not isinstance(jobs, list):
            return []
        out = []
        for job in jobs[:_MAX_PER_SOURCE]:
            if not isinstance(job, dict):
                continue
            location = job.get("location")
            location_name = location.get("name") if isinstance(location, dict) else location
            departments = job.get("departments")
            dept_name = departments[0].get("name") if isinstance(departments, list) and departments and isinstance(departments[0], dict) else None
            out.append(self._normalise({
                "title": job.get("title"),
                "company": job.get("company_name"),
                "location": location_name,
                "category": dept_name,
                "description": job.get("content"),
                "url": job.get("absolute_url"),
            }))
        return [o for o in out if o["title"]]


class LeverAdapter(SourceAdapter):
    """Lever Postings public API (no auth). `url` may be either a bare
    company slug (e.g. "acme") or the full API URL — bare slugs are expanded
    to https://api.lever.co/v0/postings/{slug}?mode=json.

    NOTE: field shape based on Lever's documented public postings API, not
    live-verified (see GreenhouseAdapter docstring for the same caveat).
    """

    def _api_url(self) -> str:
        if self.url.startswith("http"):
            return self.url
        return f"https://api.lever.co/v0/postings/{self.url}?mode=json"

    def fetch(self) -> list[dict[str, Any]]:
        body = _get(self._api_url())
        if not body:
            return []
        try:
            data = json.loads(body)
        except Exception:
            logger.warning("Lever JSON parse failed for %s", self.url)
            return []
        if not isinstance(data, list):
            return []
        out = []
        for posting in data[:_MAX_PER_SOURCE]:
            if not isinstance(posting, dict):
                continue
            categories = posting.get("categories") or {}
            out.append(self._normalise({
                "title": posting.get("text"),
                "location": categories.get("location") if isinstance(categories, dict) else None,
                "category": categories.get("team") if isinstance(categories, dict) else None,
                "description": posting.get("descriptionPlain") or posting.get("description"),
                "deadline": posting.get("applicationDeadline"),
                "url": posting.get("hostedUrl"),
            }))
        return [o for o in out if o["title"]]


class AshbyAdapter(SourceAdapter):
    """Ashby Job Board public API (no auth). `url` may be either a bare
    board name (e.g. "acme") or the full API URL — bare names are expanded
    to https://api.ashbyhq.com/posting-api/job-board/{name}.

    NOTE: field shape based on Ashby's documented public job-board API, not
    live-verified (see GreenhouseAdapter docstring for the same caveat).
    """

    def _api_url(self) -> str:
        if self.url.startswith("http"):
            return self.url
        return f"https://api.ashbyhq.com/posting-api/job-board/{self.url}"

    def fetch(self) -> list[dict[str, Any]]:
        body = _get(self._api_url())
        if not body:
            return []
        try:
            data = json.loads(body)
        except Exception:
            logger.warning("Ashby JSON parse failed for %s", self.url)
            return []
        jobs = data.get("jobs") if isinstance(data, dict) else None
        if not isinstance(jobs, list):
            return []
        out = []
        for job in jobs[:_MAX_PER_SOURCE]:
            if not isinstance(job, dict):
                continue
            out.append(self._normalise({
                "title": job.get("title"),
                "location": job.get("location"),
                "category": job.get("department"),
                "description": job.get("descriptionPlain") or job.get("descriptionHtml"),
                "url": job.get("jobUrl") or job.get("applyUrl"),
            }))
        return [o for o in out if o["title"]]


_ADAPTERS = {
    "json": JSONFeedAdapter,
    "rss": RSSAdapter,
    "greenhouse": GreenhouseAdapter,
    "lever": LeverAdapter,
    "ashby": AshbyAdapter,
}


def get_adapters() -> list[SourceAdapter]:
    """Build adapters from SCRAPER_SOURCES env (empty list when unconfigured)."""
    raw = os.getenv("SCRAPER_SOURCES", "").strip()
    if not raw:
        return []
    try:
        specs = json.loads(raw)
    except Exception:
        logger.warning("SCRAPER_SOURCES is not valid JSON; ignoring")
        return []
    adapters: list[SourceAdapter] = []
    for spec in specs if isinstance(specs, list) else []:
        cls = _ADAPTERS.get(str(spec.get("type", "")).lower())
        if cls and spec.get("url") and spec.get("name"):
            adapters.append(cls(name=spec["name"], url=spec["url"], category=spec.get("category")))
    return adapters
