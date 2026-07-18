"""Tests for safe_http_url() — a scraped feed is third-party content with
no scheme guarantee, and a stored `javascript:`/`data:` URL rendered later
as an <a href> is click-to-execute XSS. Covers the guard function directly,
its application inside SourceAdapter._normalise (ingestion), and its
application at every point an admin-facing endpoint writes an external URL
onto a ScrapedJob or publishes one onto a live Job.
"""
import asyncio
import json
import uuid

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

import app.services.scraper_service as svc
from app.db.base import Base
from app.models import Job, ScrapedJob, User, UserRole
from app.services.scraper_service import JSONFeedAdapter, safe_http_url
from app.api.v1.admin import _publish_scraped_job, admin_create_scraped, admin_update_scraped


@pytest.fixture()
def db():
    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()


def _make_admin(db):
    admin = User(id=str(uuid.uuid4()), email=f"admin-{uuid.uuid4()}@parvagas.pt", full_name="Admin", password_hash="x", role=UserRole.admin)
    db.add(admin)
    db.commit()
    return admin


# ── safe_http_url() unit coverage ────────────────────────────────────────────

@pytest.mark.parametrize("bad", [
    "javascript:alert(1)",
    "javascript:alert(document.cookie)",
    "data:text/html,<script>alert(1)</script>",
    "vbscript:msgbox(1)",
    "  javascript:alert(1)  ",  # whitespace shouldn't defeat the scheme check
    "//evil.example.com/x",  # protocol-relative, no explicit scheme
    "not a url at all",
    "",
    None,
])
def test_safe_http_url_rejects_dangerous_or_invalid_values(bad):
    assert safe_http_url(bad) is None


@pytest.mark.parametrize("good", [
    "https://boards.greenhouse.io/acme/jobs/1",
    "http://example.com/vaga/123",
    "https://example.com/path?query=1#frag",
])
def test_safe_http_url_passes_through_http_and_https(good):
    assert safe_http_url(good) == good


# ── Ingestion (SourceAdapter._normalise via JSONFeedAdapter) ─────────────────

def test_javascript_source_url_dropped_at_ingestion(monkeypatch):
    fixture = {"jobs": [{"title": "Vaga X", "company": "Acme", "url": "javascript:alert(1)"}]}
    monkeypatch.setattr(
        svc, "_conditional_get",
        lambda url, retries=3, timeout=None, user_agent=None, prev_etag=None, prev_last_modified=None, prev_body_hash=None: svc.FetchOutcome(body=json.dumps(fixture), unchanged=False),
    )
    adapter = JSONFeedAdapter(name="Test Feed", url="http://example.com/feed.json")
    jobs = adapter.fetch()
    assert len(jobs) == 1
    assert jobs[0]["sourceUrl"] is None


def test_legitimate_source_url_survives_ingestion(monkeypatch):
    fixture = {"jobs": [{"title": "Vaga X", "company": "Acme", "url": "https://example.com/vaga/123"}]}
    monkeypatch.setattr(
        svc, "_conditional_get",
        lambda url, retries=3, timeout=None, user_agent=None, prev_etag=None, prev_last_modified=None, prev_body_hash=None: svc.FetchOutcome(body=json.dumps(fixture), unchanged=False),
    )
    adapter = JSONFeedAdapter(name="Test Feed", url="http://example.com/feed.json")
    jobs = adapter.fetch()
    assert jobs[0]["sourceUrl"] == "https://example.com/vaga/123"


# ── _publish_scraped_job (admin.py) ───────────────────────────────────────────

def test_publish_scraped_job_nulls_dangerous_source_url_and_logo(db):
    admin = _make_admin(db)
    s = ScrapedJob(
        title="Vaga X", company_name="Acme", status="pending",
        source_url="javascript:alert(1)",
        company_logo_url="javascript:alert(document.cookie)",
    )
    db.add(s)
    db.commit()

    job = _publish_scraped_job(db, s, admin)

    assert job.source_url is None
    assert job.external_company_logo_url is None


def test_publish_scraped_job_keeps_safe_source_url_and_logo(db):
    admin = _make_admin(db)
    s = ScrapedJob(
        title="Vaga Y", company_name="Acme", status="pending",
        source_url="https://example.com/vaga/456",
        company_logo_url="https://example.com/logo.png",
    )
    db.add(s)
    db.commit()

    job = _publish_scraped_job(db, s, admin)

    assert job.source_url == "https://example.com/vaga/456"
    assert job.external_company_logo_url == "https://example.com/logo.png"


# ── admin_create_scraped / admin_update_scraped ──────────────────────────────

def test_admin_create_scraped_nulls_dangerous_urls(db):
    admin = _make_admin(db)
    payload = {
        "title": "Vaga Z", "company": "Acme",
        "sourceUrl": "javascript:alert(1)",
        "companyLogoUrl": "javascript:alert(1)",
        "companyWebsite": "javascript:alert(1)",
    }

    result = asyncio.run(admin_create_scraped(payload, db=db, current_user=admin))

    row = db.query(ScrapedJob).filter(ScrapedJob.id == result["scraped"]["_id"]).first()
    assert row.source_url is None
    assert row.company_logo_url is None
    assert row.company_website is None


def test_admin_create_scraped_keeps_safe_urls(db):
    admin = _make_admin(db)
    payload = {
        "title": "Vaga W", "company": "Acme",
        "sourceUrl": "https://example.com/w",
        "companyLogoUrl": "https://example.com/logo.png",
        "companyWebsite": "https://acme.example.com",
    }

    result = asyncio.run(admin_create_scraped(payload, db=db, current_user=admin))

    row = db.query(ScrapedJob).filter(ScrapedJob.id == result["scraped"]["_id"]).first()
    assert row.source_url == "https://example.com/w"
    assert row.company_logo_url == "https://example.com/logo.png"
    assert row.company_website == "https://acme.example.com"


def test_admin_update_scraped_nulls_dangerous_urls_including_on_published_job(db):
    admin = _make_admin(db)
    from app.models import Company
    owner = User(id=str(uuid.uuid4()), email=f"owner-{uuid.uuid4()}@x.com", full_name="Owner", password_hash="x", role=UserRole.company)
    db.add(owner)
    db.flush()
    company = Company(owner_user_id=owner.id, name="Parvagas Aggregator", status="active")
    db.add(company)
    db.flush()
    job = Job(company_id=company.id, title="Vaga V", status="approved", visibility="public", external_company_logo_url="https://example.com/old-logo.png")
    db.add(job)
    db.flush()
    s = ScrapedJob(title="Vaga V", status="approved", published_job_id=job.id)
    db.add(s)
    db.commit()

    asyncio.run(admin_update_scraped(
        s.id,
        {"sourceUrl": "javascript:alert(1)", "companyLogoUrl": "javascript:alert(1)"},
        db=db, current_user=admin,
    ))

    refreshed_s = db.query(ScrapedJob).filter(ScrapedJob.id == s.id).first()
    refreshed_job = db.query(Job).filter(Job.id == job.id).first()
    assert refreshed_s.source_url is None
    assert refreshed_s.company_logo_url is None
    # _sync_scraped_edit_to_job mirrors the (now-nulled) logo onto the live Job too.
    assert refreshed_job.external_company_logo_url is None
