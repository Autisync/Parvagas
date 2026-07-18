"""Tests for the admin-managed scraper config (sources + global settings)
that replaced the old SCRAPER_SOURCES/SCRAPER_* env vars, and for the
audit-trail bugfixes that came with it:

- /admin-actions and /audit-logs/export.csv used to read from process-memory
  lists that were wiped on every restart/redeploy — both now read the same
  durable AuditLog table /audit-logs already used.
- _require_admin (undefined name — a NameError bug) is now _ensure_admin
  everywhere, including the CV-builder readiness endpoint this session wired
  up on the frontend.
"""
import asyncio
import uuid

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

import app.api.v1.admin as admin_module
from app.db.base import Base
from app.models import AuditLog, ScraperSettings, ScraperSource, User, UserRole
from app.api.v1.admin import (
    admin_actions,
    admin_audit_logs_csv,
    admin_create_scraper_source,
    admin_delete_scraper_source,
    admin_get_scraper_settings,
    admin_list_scraper_sources,
    admin_update_scraper_settings,
    admin_update_scraper_source,
)
from app.services.scraper_service import get_adapters, is_public_scraper_url


@pytest.fixture()
def db():
    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()


@pytest.fixture(autouse=True)
def _allow_any_scraper_url(monkeypatch):
    """Most tests below exercise CRUD/validation logic unrelated to the SSRF
    guard — real DNS resolution has no place in a unit test, and the
    `.example` fixture URLs used throughout this file are RFC 2606
    documentation-reserved (they don't resolve). The guard itself is
    exercised directly against the real function in
    test_create_scraper_source_rejects_non_public_url below, which restores
    the real implementation just for that one test."""
    monkeypatch.setattr(admin_module, "is_public_scraper_url", lambda url: True)


def _make_admin(db, admin_level=None):
    user = User(
        id=str(uuid.uuid4()), email=f"admin-{uuid.uuid4()}@parvagas.pt",
        full_name="Admin", password_hash="x", role=UserRole.admin,
        **({"admin_level": admin_level} if admin_level else {}),
    )
    db.add(user)
    db.commit()
    return user


def _make_super_admin(db):
    """Scraper-source create/update require super-admin (SSRF-capable —
    the URL is fetched by the backend itself on every scrape run)."""
    return _make_admin(db, admin_level="super-admin")


# ── Scraper sources CRUD ─────────────────────────────────────────────────

def test_create_scraper_source(db):
    admin = _make_super_admin(db)
    result = asyncio.run(admin_create_scraper_source(
        {"name": "Acme GH", "type": "greenhouse", "url": "acme", "category": "Tech"},
        db=db, current_user=admin,
    ))
    assert result["name"] == "Acme GH"
    assert result["type"] == "greenhouse"
    assert result["enabled"] is True
    assert db.query(ScraperSource).count() == 1


def test_create_scraper_source_rejects_careerjet(db):
    admin = _make_super_admin(db)
    with pytest.raises(HTTPException) as exc:
        asyncio.run(admin_create_scraper_source(
            {"name": "Careerjet Angola", "type": "careerjet", "url": "my-affid"},
            db=db, current_user=admin,
        ))
    assert exc.value.status_code == 400
    assert db.query(ScraperSource).count() == 0


def test_create_scraper_source_rejects_unknown_type(db):
    admin = _make_super_admin(db)
    with pytest.raises(HTTPException) as exc:
        asyncio.run(admin_create_scraper_source(
            {"name": "X", "type": "carrier-pigeon", "url": "https://x.example"},
            db=db, current_user=admin,
        ))
    assert exc.value.status_code == 400


def test_create_scraper_source_requires_name_and_url(db):
    admin = _make_super_admin(db)
    with pytest.raises(HTTPException):
        asyncio.run(admin_create_scraper_source(
            {"name": "", "type": "rss", "url": "https://x.example/feed"},
            db=db, current_user=admin,
        ))


def test_update_scraper_source_toggles_enabled(db):
    admin = _make_super_admin(db)
    created = asyncio.run(admin_create_scraper_source(
        {"name": "Acme GH", "type": "greenhouse", "url": "acme"}, db=db, current_user=admin,
    ))
    updated = asyncio.run(admin_update_scraper_source(
        created["_id"], {"enabled": False}, db=db, current_user=admin,
    ))
    assert updated["enabled"] is False
    # Disabled sources must not produce an active adapter.
    assert get_adapters(db) == []


def test_update_scraper_source_rejects_careerjet(db):
    admin = _make_super_admin(db)
    created = asyncio.run(admin_create_scraper_source(
        {"name": "Acme GH", "type": "greenhouse", "url": "acme"}, db=db, current_user=admin,
    ))
    with pytest.raises(HTTPException):
        asyncio.run(admin_update_scraper_source(
            created["_id"], {"type": "careerjet"}, db=db, current_user=admin,
        ))


def test_create_scraper_source_rejects_trusted_auto_approve_for_any_current_type(db):
    """TRUSTED_AUTO_APPROVE_TYPES is deliberately empty — every real source
    today is HTML-scraped or a generic feed, none schema-vouchable — so
    this must reject regardless of which otherwise-valid type is chosen."""
    admin = _make_super_admin(db)
    for source_type in ("json", "rss", "greenhouse", "lever"):
        with pytest.raises(HTTPException) as exc:
            asyncio.run(admin_create_scraper_source(
                {"name": f"X-{source_type}", "type": source_type, "url": "https://x.example", "trustedAutoApprove": True},
                db=db, current_user=admin,
            ))
        assert exc.value.status_code == 400
    assert db.query(ScraperSource).count() == 0


def test_create_scraper_source_allows_trusted_auto_approve_false(db):
    admin = _make_super_admin(db)
    result = asyncio.run(admin_create_scraper_source(
        {"name": "Acme GH", "type": "greenhouse", "url": "acme", "trustedAutoApprove": False},
        db=db, current_user=admin,
    ))
    assert result["trustedAutoApprove"] is False


def test_update_scraper_source_rejects_trusted_auto_approve(db):
    admin = _make_super_admin(db)
    created = asyncio.run(admin_create_scraper_source(
        {"name": "Acme GH", "type": "greenhouse", "url": "acme"}, db=db, current_user=admin,
    ))
    with pytest.raises(HTTPException) as exc:
        asyncio.run(admin_update_scraper_source(
            created["_id"], {"trustedAutoApprove": True}, db=db, current_user=admin,
        ))
    assert exc.value.status_code == 400
    # The handler mutates row.trusted_auto_approve in memory before the
    # validation raises (never committed) — roll back so the re-query
    # below reflects actual persisted state, not the discarded in-memory
    # attribute still sitting on the identity-mapped object.
    db.rollback()
    row = db.query(ScraperSource).filter(ScraperSource.id == created["_id"]).first()
    assert row.trusted_auto_approve is False


def test_get_adapters_never_trusts_a_hand_edited_row_regardless_of_type(db):
    """Even if trusted_auto_approve=True somehow ends up set on the DB row
    (bypassing the admin API validation entirely — e.g. a direct DB edit),
    get_adapters() is the independent choke point that must still refuse
    to mark the resulting adapter as trusted."""
    admin = _make_super_admin(db)
    created = asyncio.run(admin_create_scraper_source(
        {"name": "Acme GH", "type": "greenhouse", "url": "acme"}, db=db, current_user=admin,
    ))
    row = db.query(ScraperSource).filter(ScraperSource.id == created["_id"]).first()
    row.trusted_auto_approve = True  # bypass the API layer entirely
    db.commit()

    adapters = get_adapters(db)
    assert len(adapters) == 1
    assert adapters[0].trusted_auto_approve is False


def test_delete_scraper_source(db):
    admin = _make_super_admin(db)
    created = asyncio.run(admin_create_scraper_source(
        {"name": "Acme GH", "type": "greenhouse", "url": "acme"}, db=db, current_user=admin,
    ))
    asyncio.run(admin_delete_scraper_source(created["_id"], db=db, current_user=admin))
    assert db.query(ScraperSource).count() == 0


def test_list_scraper_sources(db):
    admin = _make_super_admin(db)
    asyncio.run(admin_create_scraper_source({"name": "A", "type": "rss", "url": "https://a.example/feed"}, db=db, current_user=admin))
    asyncio.run(admin_create_scraper_source({"name": "B", "type": "json", "url": "https://b.example/jobs"}, db=db, current_user=admin))
    result = asyncio.run(admin_list_scraper_sources(db=db, current_user=admin))
    assert len(result["scraperSources"]) == 2


def test_create_scraper_source_requires_super_admin(db):
    """A plain (moderator-level) admin can view scraper sources but must not
    be able to set an arbitrary fetch URL — the backend fetches that URL
    itself on every scrape run, so this is an SSRF-capable action gated the
    same way as this file's other outbound-URL-adjacent admin actions."""
    moderator = _make_admin(db, admin_level="moderator")
    with pytest.raises(HTTPException) as exc:
        asyncio.run(admin_create_scraper_source(
            {"name": "Acme GH", "type": "greenhouse", "url": "acme"}, db=db, current_user=moderator,
        ))
    assert exc.value.status_code == 403
    assert db.query(ScraperSource).count() == 0


def test_update_scraper_source_requires_super_admin(db):
    super_admin = _make_super_admin(db)
    created = asyncio.run(admin_create_scraper_source(
        {"name": "Acme GH", "type": "greenhouse", "url": "acme"}, db=db, current_user=super_admin,
    ))
    moderator = _make_admin(db, admin_level="moderator")
    with pytest.raises(HTTPException) as exc:
        asyncio.run(admin_update_scraper_source(
            created["_id"], {"enabled": False}, db=db, current_user=moderator,
        ))
    assert exc.value.status_code == 403


def test_create_scraper_source_rejects_non_public_url(db, monkeypatch):
    """Restores the real is_public_scraper_url (this file's autouse fixture
    stubs it to True for the CRUD tests above, which aren't testing the SSRF
    guard) and confirms a URL resolving to a loopback address is rejected."""
    monkeypatch.setattr(admin_module, "is_public_scraper_url", is_public_scraper_url)
    admin = _make_super_admin(db)
    with pytest.raises(HTTPException) as exc:
        asyncio.run(admin_create_scraper_source(
            {"name": "Evil", "type": "json", "url": "http://127.0.0.1:9999/internal-feed"},
            db=db, current_user=admin,
        ))
    assert exc.value.status_code == 400
    assert db.query(ScraperSource).count() == 0


def test_create_scraper_source_allows_bare_greenhouse_token_without_url_check(db, monkeypatch):
    """A bare Greenhouse/Lever board token (not a URL) is never the literal
    fetch target — GreenhouseAdapter interpolates it into a fixed, trusted
    host template — so it must be accepted without going through
    is_public_scraper_url at all."""
    calls = []
    monkeypatch.setattr(admin_module, "is_public_scraper_url", lambda url: calls.append(url) or True)
    admin = _make_super_admin(db)
    result = asyncio.run(admin_create_scraper_source(
        {"name": "Acme GH", "type": "greenhouse", "url": "acme"}, db=db, current_user=admin,
    ))
    assert result["name"] == "Acme GH"
    assert calls == []


# ── Scraper settings ──────────────────────────────────────────────────────

def test_get_scraper_settings_seeds_defaults(db):
    admin = _make_admin(db)
    result = asyncio.run(admin_get_scraper_settings(db=db, current_user=admin))
    assert result["enabled"] is True
    assert result["defaultTimeoutSeconds"] == 12
    assert result["defaultMaxPerSource"] == 100


def test_update_scraper_settings_master_switch(db):
    admin = _make_super_admin(db)
    asyncio.run(admin_create_scraper_source({"name": "A", "type": "rss", "url": "https://a.example/feed"}, db=db, current_user=admin))
    asyncio.run(admin_update_scraper_settings({"enabled": False}, db=db, current_user=admin))
    assert get_adapters(db) == []


def test_update_scraper_settings_rejects_non_positive_timeout(db):
    admin = _make_admin(db)
    with pytest.raises(HTTPException):
        asyncio.run(admin_update_scraper_settings({"defaultTimeoutSeconds": 0}, db=db, current_user=admin))


def test_update_scraper_settings_partial_update_preserves_other_fields(db):
    admin = _make_admin(db)
    asyncio.run(admin_update_scraper_settings({"defaultMaxPerSource": 50}, db=db, current_user=admin))
    result = asyncio.run(admin_update_scraper_settings({"userAgent": "MyBot/2.0"}, db=db, current_user=admin))
    assert result["defaultMaxPerSource"] == 50
    assert result["userAgent"] == "MyBot/2.0"


# ── Audit trail durability (was in-memory, now DB-backed) ────────────────

def test_admin_actions_reads_from_durable_audit_log_not_memory(db):
    """Regression test for the in-memory _ADMIN_ACTIONS bug: write an
    AuditLog row directly (simulating a prior process having recorded it)
    and confirm a *fresh* call still sees it — proving persistence doesn't
    depend on any process-local list."""
    admin = _make_admin(db)
    db.add(AuditLog(
        actor_user_id=admin.id, actor_email=admin.email, action="job.approve",
        resource_type="job", resource_id="job-123", details="{}",
    ))
    db.commit()

    result = asyncio.run(admin_actions(page=1, limit=20, db=db, current_user=admin))
    assert result["pagination"]["total"] == 1
    assert result["adminActions"][0]["action"] == "job.approve"
    assert result["adminActions"][0]["targetId"] == "job-123"
    assert result["adminActions"][0]["adminUserId"] == admin.id


def test_admin_actions_filters_by_action_and_keyword(db):
    admin = _make_admin(db)
    db.add(AuditLog(actor_user_id=admin.id, action="job.approve", resource_type="job", resource_id="j1", details="{}"))
    db.add(AuditLog(actor_user_id=admin.id, action="company.suspend", resource_type="company", resource_id="c1", details="{}"))
    db.commit()

    result = asyncio.run(admin_actions(page=1, limit=20, action="job", db=db, current_user=admin))
    assert result["pagination"]["total"] == 1
    assert result["adminActions"][0]["action"] == "job.approve"


def test_audit_logs_csv_export_reads_from_db(db):
    admin = _make_admin(db)
    db.add(AuditLog(actor_user_id=admin.id, action="job.reject", resource_type="job", resource_id="j9", details="{}"))
    db.commit()

    response = asyncio.run(admin_audit_logs_csv(from_date=None, to_date=None, db=db, current_user=admin))
    body = response.body.decode("utf-8")
    assert "job.reject" in body
    assert "j9" in body
