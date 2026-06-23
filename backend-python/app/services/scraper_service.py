"""Pluggable job aggregation (scraping) service.

Fetches job listings from external sources and normalises them into dicts the
ScrapedJob ingestion pipeline understands. Safe by default: no sources are
configured unless SCRAPER_SOURCES is set, and every adapter sends a polite
User-Agent, respects robots.txt, and backs off on errors.

Configure via env SCRAPER_SOURCES — a JSON array, e.g.:
  [{"type":"json","name":"MyBoard","url":"https://api.board.com/jobs","category":"Tech"},
   {"type":"rss","name":"FeedX","url":"https://feedx.com/jobs.rss"}]

JSON adapter expects a list of objects (or {"jobs":[...]}) with keys like
title/company/location/category/description/url. RSS adapter reads item
title/description/link.
"""
from __future__ import annotations

import hashlib
import json
import os
import time
from typing import Any
from urllib.parse import urlparse
from urllib.robotparser import RobotFileParser
from xml.etree import ElementTree as ET

from app.core.logging import get_logger

logger = get_logger(__name__)

USER_AGENT = os.getenv("SCRAPER_USER_AGENT", "Parvagas-Bot/1.0 (+https://parvagas.pt/robots.txt)")
_REQUEST_TIMEOUT = float(os.getenv("SCRAPER_TIMEOUT", "12"))
_MAX_PER_SOURCE = int(os.getenv("SCRAPER_MAX_PER_SOURCE", "50"))


def content_hash(title: str | None, company: str | None, location: str | None) -> str:
    """Stable dedup key from the identifying fields."""
    basis = "|".join([(title or "").strip().lower(), (company or "").strip().lower(), (location or "").strip().lower()])
    return hashlib.sha256(basis.encode("utf-8")).hexdigest()


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
        return {
            "title": (raw.get("title") or "").strip(),
            "company": (raw.get("company") or raw.get("companyName") or "").strip() or None,
            "location": (raw.get("location") or "").strip() or None,
            "category": (raw.get("category") or self.category or "").strip() or None,
            "description": (raw.get("description") or "").strip() or None,
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


_ADAPTERS = {"json": JSONFeedAdapter, "rss": RSSAdapter}


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
