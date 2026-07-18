"""Pluggable job aggregation (scraping) service.

Fetches job listings from external sources and normalises them into dicts the
ScrapedJob ingestion pipeline understands. Safe by default: no sources exist
until an admin adds one on the Scraper Config board, and every adapter sends
a polite User-Agent, respects robots.txt, and backs off on errors.

Sources and runtime tuning (timeout, per-source cap, user agent, overall
run budget) are admin-managed DB rows — ScraperSource and ScraperSettings
(app/models/__init__.py) — editable from /Portal/Admin without a redeploy.
This replaced the old SCRAPER_SOURCES/SCRAPER_* env vars; the module-level
_FALLBACK_* constants below only cover the case where ScraperSettings hasn't
been seeded yet (defensive — the migration seeds a default row).

ScraperSource.type selects the adapter: "json" expects a list of objects (or
{"jobs":[...]}) with keys like title/company/location/category/description/
url. "rss" reads item title/description/link. "greenhouse"/"lever" talk to
each platform's public job-board API directly — `url` can be a bare board
token/company slug, or a full API URL — and are relevant to the Angola
market via the multinational employers who post through them, not because
the platforms are Angola-native (see GreenhouseAdapter's docstring).

"careerjet" is deliberately NOT a selectable type (see CareerjetAdapter's
docstring and get_adapters() below): it's a live search proxy, not a
bulk-export feed, and using it to republish listings onto our own board
wasn't confirmed to comply with Careerjet's partner terms.

Angola-native boards (Jobartis, emprego.co.ao, angolaemprego.com's listing
pages) were checked and do NOT currently expose a discoverable public
API/JSON-LD/RSS feed for their job listings (angolaemprego.com's own
/feed/ endpoint exists but publishes daily-roundup articles, not one item
per job, so the generic RSS adapter above can point at it but won't produce
clean per-job records) — building a scraper for those would mean fragile
HTML-selector scraping that needs to be verified against their live markup
by someone with browser access, which this module doesn't attempt.
"""
from __future__ import annotations

import hashlib
import json
import re
import time
from typing import TYPE_CHECKING, Any
from urllib.parse import urlparse
from urllib.robotparser import RobotFileParser
from xml.etree import ElementTree as ET

from app.core.logging import get_logger

if TYPE_CHECKING:
    from sqlalchemy.orm import Session

logger = get_logger(__name__)

# Only used when no ScraperSettings row exists yet (the migration seeds one,
# so this is a defensive fallback, not the normal path).
_FALLBACK_USER_AGENT = "Parvagas-Bot/1.0 (+https://parvagas.pt/robots.txt)"
_FALLBACK_TIMEOUT = 12.0
_FALLBACK_MAX_PER_SOURCE = 100


def get_scraper_settings(db: "Session"):
    """Load the singleton ScraperSettings row, creating it with defaults if
    the migration's seed row is somehow missing (defensive — never let a
    missing settings row block scraping)."""
    from app.models import ScraperSettings

    settings = db.query(ScraperSettings).filter(ScraperSettings.id == "default").first()
    if settings is None:
        settings = ScraperSettings(id="default")
        db.add(settings)
        db.commit()
        db.refresh(settings)
    return settings


def content_hash(title: str | None, company: str | None, location: str | None) -> str:
    """Stable dedup key from the identifying fields."""
    basis = "|".join([(title or "").strip().lower(), (company or "").strip().lower(), (location or "").strip().lower()])
    return hashlib.sha256(basis.encode("utf-8")).hexdigest()


def safe_http_url(value: str | None) -> str | None:
    """Reject anything that isn't a real http(s) URL — a scraped feed is
    third-party content with no scheme guarantee, and a stored `javascript:`
    (or `data:`, `vbscript:`, ...) URL rendered later as an <a href> is
    click-to-execute XSS. Applied at every point an external URL enters the
    pipeline (adapter normalisation, publish-to-live-Job, admin edit) so a
    bad value can't survive any single gap."""
    value = (value or "").strip()
    if not value:
        return None
    try:
        parsed = urlparse(value)
    except Exception:  # noqa: BLE001
        return None
    if parsed.scheme not in ("http", "https") or not parsed.netloc:
        return None
    return value


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


# robots.txt cache — previously every single GET re-downloaded the target
# host's robots.txt (RobotFileParser.read() is itself an HTTP request),
# literally doubling outbound requests for single-feed adapters. Parsers are
# cached per (scheme, host) with a TTL; module-level is fine because each
# scrape run is one worker process.
_ROBOTS_CACHE: dict[str, tuple[float, RobotFileParser | None]] = {}
_ROBOTS_CACHE_TTL_SECONDS = 24 * 3600


def _robots_ok(url: str, user_agent: str) -> bool:
    try:
        parts = urlparse(url)
        cache_key = f"{parts.scheme}://{parts.netloc}"
        cached = _ROBOTS_CACHE.get(cache_key)
        if cached and (time.time() - cached[0]) < _ROBOTS_CACHE_TTL_SECONDS:
            rp = cached[1]
        else:
            try:
                rp = RobotFileParser()
                rp.set_url(f"{cache_key}/robots.txt")
                rp.read()
            except Exception:
                # Unreadable robots caches as None (= permissive) too, so a
                # host with no robots.txt isn't re-fetched on every item.
                rp = None
            _ROBOTS_CACHE[cache_key] = (time.time(), rp)

        if rp is None:
            logger.info("robots.txt unreadable for %s; proceeding", url)
            return True
        return rp.can_fetch(user_agent, url)
    except Exception:
        # If robots can't be read, be permissive but log it.
        logger.info("robots.txt unreadable for %s; proceeding", url)
        return True


def _get(url: str, retries: int = 3, timeout: float | None = None, user_agent: str | None = None) -> str | None:
    """GET with polite UA + exponential backoff. Returns text or None."""
    outcome = _conditional_get(url, retries=retries, timeout=timeout, user_agent=user_agent)
    return None if outcome.unchanged else outcome.body


class FetchOutcome:
    """Result of a (possibly conditional) GET. `unchanged` means the source's
    content hasn't changed since last run — either a 304 or an identical body
    hash — so the caller can skip parsing and dedup entirely. `etag`,
    `last_modified` and `body_hash` are the fresh validators to persist for
    next run's conditional request."""

    __slots__ = ("body", "unchanged", "etag", "last_modified", "body_hash")

    def __init__(self, body=None, unchanged=False, etag=None, last_modified=None, body_hash=None):
        self.body = body
        self.unchanged = unchanged
        self.etag = etag
        self.last_modified = last_modified
        self.body_hash = body_hash


def _body_hash(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8", errors="ignore")).hexdigest()


def _conditional_get(
    url: str,
    retries: int = 3,
    timeout: float | None = None,
    user_agent: str | None = None,
    prev_etag: str | None = None,
    prev_last_modified: str | None = None,
    prev_body_hash: str | None = None,
) -> FetchOutcome:
    """GET with polite UA + exponential backoff + conditional-request support.

    Sends If-None-Match / If-Modified-Since when prior validators are known.
    A 304, or a 200 whose body hashes identically to last run, both resolve
    to unchanged=True (body=None) so the caller skips parse+dedup. On a real
    network/robots failure returns unchanged=False, body=None — indistinguish-
    able from an empty source, exactly as the old _get contract behaved."""
    import httpx

    effective_timeout = timeout if timeout is not None else _FALLBACK_TIMEOUT
    effective_ua = user_agent or _FALLBACK_USER_AGENT

    if not _robots_ok(url, effective_ua):
        logger.warning("robots.txt disallows scraping %s", url)
        return FetchOutcome(body=None, unchanged=False)

    headers = {"User-Agent": effective_ua}
    if prev_etag:
        headers["If-None-Match"] = prev_etag
    if prev_last_modified:
        headers["If-Modified-Since"] = prev_last_modified

    delay = 1.0
    for attempt in range(retries):
        try:
            resp = httpx.get(url, headers=headers, timeout=effective_timeout, follow_redirects=True)
            if resp.status_code == 304:
                # Server confirms nothing changed — keep prior validators.
                return FetchOutcome(
                    body=None, unchanged=True,
                    etag=prev_etag, last_modified=prev_last_modified, body_hash=prev_body_hash,
                )
            if resp.status_code == 200:
                text = resp.text
                digest = _body_hash(text)
                new_etag = resp.headers.get("ETag")
                new_last_modified = resp.headers.get("Last-Modified")
                if prev_body_hash and digest == prev_body_hash:
                    # Server didn't honor conditional headers, but the content
                    # is byte-identical — treat as unchanged all the same.
                    return FetchOutcome(
                        body=None, unchanged=True,
                        etag=new_etag or prev_etag,
                        last_modified=new_last_modified or prev_last_modified,
                        body_hash=digest,
                    )
                return FetchOutcome(
                    body=text, unchanged=False,
                    etag=new_etag, last_modified=new_last_modified, body_hash=digest,
                )
            if resp.status_code in (429, 503):
                time.sleep(delay)
                delay *= 2
                continue
            logger.warning("scrape GET %s -> HTTP %s", url, resp.status_code)
            return FetchOutcome(body=None, unchanged=False)
        except Exception as exc:  # pragma: no cover - network
            logger.warning("scrape GET %s failed (attempt %s): %s", url, attempt + 1, exc)
            time.sleep(delay)
            delay *= 2
    return FetchOutcome(body=None, unchanged=False)


class SourceAdapter:
    """Base adapter. Subclasses implement fetch() -> list of normalised job dicts."""

    def __init__(
        self,
        name: str,
        url: str,
        category: str | None = None,
        max_results: int | None = None,
        timeout: float | None = None,
        user_agent: str | None = None,
    ):
        self.name = name
        self.url = url
        self.category = category
        # None means "use the admin-configured global default" (per-source
        # override wins when set) — get_adapters() rebuilds adapters fresh
        # from ScraperSource/ScraperSettings on every run, so this always
        # reflects the latest admin config.
        self.max_results = max_results
        self.timeout = timeout
        self.user_agent = user_agent
        # Set by get_adapters() to the originating ScraperSource.id, so the
        # worker task can write last_run_* stats back onto the right row.
        self.source_id: str | None = None
        # Conditional-GET validators from the previous run (set by
        # get_adapters); `last_fetch` is populated during _get_url so the
        # task can persist fresh validators and detect an unchanged source.
        self.prev_etag: str | None = None
        self.prev_last_modified: str | None = None
        self.prev_body_hash: str | None = None
        self.last_fetch: FetchOutcome | None = None
        # Set by get_adapters() from ScraperSource.trusted_auto_approve —
        # gates the (default-off) auto-publish path in tasks.py.
        self.trusted_auto_approve: bool = False

    def _limit(self) -> int:
        return self.max_results if self.max_results is not None else _FALLBACK_MAX_PER_SOURCE

    def host_key(self) -> str:
        """Grouping key for per-host fetch politeness (parallel fetch never
        runs two sources against the same host concurrently). `self.url` is
        a bare token/slug for Greenhouse/Lever, not a real URL — subclasses
        that build their request URL elsewhere override this; falling back
        to the adapter name just means "never parallelize with itself",
        which is always safe even if imprecise."""
        try:
            netloc = urlparse(self.url).netloc
            return netloc or self.name
        except Exception:
            return self.name

    def _get_url(self, url: str, retries: int = 3) -> str | None:
        outcome = _conditional_get(
            url, retries=retries, timeout=self.timeout, user_agent=self.user_agent,
            prev_etag=self.prev_etag, prev_last_modified=self.prev_last_modified,
            prev_body_hash=self.prev_body_hash,
        )
        self.last_fetch = outcome
        return None if outcome.unchanged else outcome.body

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
            "sourceUrl": safe_http_url(raw.get("url") or raw.get("link") or raw.get("sourceUrl")),
        }


class JSONFeedAdapter(SourceAdapter):
    def fetch(self) -> list[dict[str, Any]]:
        body = self._get_url(self.url)
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
        out = [self._normalise(it) for it in items[: self._limit()] if isinstance(it, dict)]
        return [o for o in out if o["title"]]


class RSSAdapter(SourceAdapter):
    def fetch(self) -> list[dict[str, Any]]:
        body = self._get_url(self.url)
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
            if len(out) >= self._limit():
                break
        return out


class GreenhouseAdapter(SourceAdapter):
    """Greenhouse Job Board public API (no auth). `url` may be either a bare
    board token (e.g. "acme") or the full API URL — bare tokens are expanded
    to https://boards-api.greenhouse.io/v1/boards/{token}/jobs?content=true.

    Relevant to the Angola market via the MULTINATIONAL employers who post
    through it (oil & gas majors, global consultancies, tech companies with
    Angola offices) — not an Angola-native platform itself. See
    CareerjetAdapter's docstring below for what was actually verified as
    Angola-local, and the module docstring for what wasn't.

    NOTE: field shape is based on Greenhouse's documented public job-board
    API, not a live-verified response (no network access when this adapter
    was written) — verify against a real board once one is configured in
    SCRAPER_SOURCES, per TEST_PLAN_CAREER_OPS.md Phase 3.
    """

    def _api_url(self) -> str:
        if self.url.startswith("http"):
            return self.url
        return f"https://boards-api.greenhouse.io/v1/boards/{self.url}/jobs?content=true"

    def host_key(self) -> str:
        return urlparse(self._api_url()).netloc or self.name

    def fetch(self) -> list[dict[str, Any]]:
        body = self._get_url(self._api_url())
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
        for job in jobs[:self._limit()]:
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

    Same "multinational employer, not Angola-native" note as GreenhouseAdapter.

    NOTE: field shape based on Lever's documented public postings API, not
    live-verified (see GreenhouseAdapter docstring for the same caveat).
    """

    def _api_url(self) -> str:
        if self.url.startswith("http"):
            return self.url
        return f"https://api.lever.co/v0/postings/{self.url}?mode=json"

    def host_key(self) -> str:
        return urlparse(self._api_url()).netloc or self.name

    def fetch(self) -> list[dict[str, Any]]:
        body = self._get_url(self._api_url())
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
        for posting in data[:self._limit()]:
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


class CareerjetAdapter(SourceAdapter):
    """Careerjet public search API — verified against official docs
    (https://www.careerjet.com/partners/api/, official Python client at
    github.com/careerjet/careerjet-api-client-python) rather than guessed
    from memory. Careerjet operates a dedicated Angola site
    (careerjet.co.ao), making this the one adapter in this module that's
    actually confirmed to serve the Angola job market specifically.

    IMPORTANT — read before enabling: Careerjet's API is a live SEARCH
    PROXY meant for embedding a search box on a partner's site (it requires
    the end-visitor's own IP/user-agent per request), not a bulk-export
    feed meant for harvesting-and-republishing listings onto a third-party
    board. Using it to populate Parvagas's own catalogue may not comply
    with Careerjet's partner terms — that wasn't reviewed here. Get an
    affiliate ID and read their actual partner agreement before adding
    "careerjet" back as a selectable ScraperSource type; it's provided
    verified-and-ready, not pre-approved for this use case.

    `url` holds the affiliate ID (`affid`) issued by Careerjet on partner
    signup — required, there is no anonymous/keyless access. `category`
    doubles as the search keywords (e.g. "Tecnologia"); results are always
    scoped to location=Angola.
    """

    _ENDPOINT = "https://search.api.careerjet.net/v4/query"

    def host_key(self) -> str:
        return urlparse(self._ENDPOINT).netloc

    def fetch(self) -> list[dict[str, Any]]:
        if not self.url:
            logger.warning("CareerjetAdapter %s has no affid configured; skipping", self.name)
            return []
        params = {
            "affid": self.url,
            "user_ip": "127.0.0.1",
            "user_agent": self.user_agent or _FALLBACK_USER_AGENT,
            "url": "https://parvagas.pt/Vagas-Disponiveis",
            "location": "Angola",
            "keywords": self.category or "",
            "pagesize": str(self._limit()),
        }
        query = "&".join(f"{k}={v}" for k, v in params.items() if v)
        body = self._get_url(f"{self._ENDPOINT}?{query}")
        if not body:
            return []
        try:
            data = json.loads(body)
        except Exception:
            logger.warning("Careerjet JSON parse failed for %s", self.name)
            return []
        jobs = data.get("jobs") if isinstance(data, dict) else None
        if not isinstance(jobs, list):
            return []
        out = []
        for job in jobs[:self._limit()]:
            if not isinstance(job, dict):
                continue
            out.append(self._normalise({
                "title": job.get("title"),
                "company": job.get("company"),
                "location": job.get("locations"),
                "description": job.get("description"),
                "url": job.get("url"),
            }))
        return [o for o in out if o["title"]]


_ADAPTERS = {
    "json": JSONFeedAdapter,
    "rss": RSSAdapter,
    "greenhouse": GreenhouseAdapter,
    "lever": LeverAdapter,
    # "careerjet" intentionally omitted — disabled pending confirmation that
    # republishing Careerjet's live-search results onto our own board
    # complies with their partner terms (see CareerjetAdapter docstring).
    # Re-add once that's confirmed; the adapter class below still works. The
    # admin API also rejects "careerjet" at ScraperSource create/update time
    # (see admin.py) so this can't be worked around from the admin board.
}

# The set of source types selectable from the admin board — single source of
# truth shared with the admin API's create/update validation.
VALID_SCRAPER_SOURCE_TYPES = frozenset(_ADAPTERS.keys())


def get_adapters(db: "Session") -> list[SourceAdapter]:
    """Build adapters from admin-managed ScraperSource rows (empty list when
    none are configured, or when the ScraperSettings master switch is off)."""
    from app.models import ScraperSource

    settings = get_scraper_settings(db)
    if not settings.enabled:
        logger.info("get_adapters: scraping disabled via ScraperSettings.enabled=False")
        return []

    # Least-recently-run first (never-run before everything): when a run
    # exhausts its ingest/time budget mid-way, iteration order decides who
    # gets skipped — DB row order would starve the *same* tail sources on
    # every single run, whereas this rotates the pain fairly.
    rows = (
        db.query(ScraperSource)
        .filter(ScraperSource.enabled.is_(True))
        .order_by(ScraperSource.last_run_at.asc().nulls_first(), ScraperSource.created_at.asc())
        .all()
    )
    adapters: list[SourceAdapter] = []
    for row in rows:
        source_type = str(row.type or "").lower()
        if source_type == "careerjet":
            logger.warning(
                "ScraperSource %s requests 'careerjet' but that adapter is disabled "
                "pending partner-terms confirmation; skipping", row.name
            )
            continue
        cls = _ADAPTERS.get(source_type)
        if not cls or not row.url or not row.name:
            continue
        adapter = cls(
            name=row.name,
            url=row.url,
            category=row.category,
            max_results=row.max_results if row.max_results is not None else settings.default_max_per_source,
            timeout=float(settings.default_timeout_seconds),
            user_agent=settings.user_agent or None,
        )
        adapter.source_id = row.id
        # Conditional-GET validators from the previous run — lets the fetch
        # short-circuit to "unchanged" instead of re-parsing an identical feed.
        adapter.prev_etag = row.http_etag
        adapter.prev_last_modified = row.http_last_modified
        adapter.prev_body_hash = row.last_body_hash
        # Gate for the (default-off) trusted-auto-approve path — see tasks.py.
        adapter.trusted_auto_approve = bool(row.trusted_auto_approve)
        adapters.append(adapter)
    return adapters
