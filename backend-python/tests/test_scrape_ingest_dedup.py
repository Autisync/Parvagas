"""Tests for scrape_external_jobs' batched dedup — the ingestion loop used
to issue up to 2 DB queries per item (hash lookup + URL lookup); it now
collects the batch's hashes/URLs into two IN queries per source. These
tests pin the behavior that must survive that refactor: existing rows are
refreshed instead of duplicated, URL-only matches still dedup, and two
identical items inside the SAME fetch batch produce one row (the old code
got that via SQLAlchemy autoflush; the new code must do it explicitly).

Uses its own isolated in-memory SQLite engine monkeypatched into
app.workers.tasks.SessionLocal, same pattern as test_scraped_jobs_digest.
"""
import uuid
from datetime import datetime, timedelta

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

import app.workers.tasks as tasks
from app.db.base import Base
from app.models import ScrapedJob
from app.services.scraper_service import content_hash


@pytest.fixture()
def db(monkeypatch):
    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    monkeypatch.setattr(tasks, "SessionLocal", lambda: session)
    yield session
    session.close()


class _FakeAdapter:
    def __init__(self, items, trusted_auto_approve=False):
        self.name = "fake-source"
        self.source_id = str(uuid.uuid4())
        self._items = items
        # A real SourceAdapter sets this during fetch() (see _get_url); the
        # ingestion loop checks it for the conditional-GET short-circuit.
        self.last_fetch = None
        self.trusted_auto_approve = trusted_auto_approve

    def host_key(self):
        return self.name

    def fetch(self):
        from app.services.scraper_service import FetchOutcome
        self.last_fetch = FetchOutcome(body="fake", unchanged=False)
        return self._items


def _run_with_items(db, monkeypatch, items, trusted_auto_approve=False):
    import app.services.scraper_service as scraper_service

    adapter = _FakeAdapter(items, trusted_auto_approve=trusted_auto_approve)
    monkeypatch.setattr(tasks, "get_adapters", lambda _db: [adapter], raising=False)
    # scrape_external_jobs imports these inside the function body, so patch
    # them on the scraper_service module it imports from.
    monkeypatch.setattr(scraper_service, "get_adapters", lambda _db: [adapter])
    return tasks.scrape_external_jobs()


def _item(title="Analista Financeiro", company="Banco ABC", location="Luanda", source_url=None,
          description="Descrição da vaga com detalhe suficiente.", responsibilities=None, requirements=None):
    return {
        "title": title, "company": company, "location": location,
        "category": "Finanças", "description": description,
        "source": "fake-source", "sourceUrl": source_url,
        "responsibilities": responsibilities, "requirements": requirements,
    }


def test_new_item_is_ingested(db, monkeypatch):
    result = _run_with_items(db, monkeypatch, [_item()])

    assert result["ingested"] == 1
    assert result["skipped"] == 0
    assert db.query(ScrapedJob).count() == 1


def test_existing_hash_is_refreshed_not_duplicated(db, monkeypatch):
    old_seen = datetime.utcnow() - timedelta(days=10)
    existing = ScrapedJob(
        title="Analista Financeiro",
        content_hash=content_hash("Analista Financeiro", "Banco ABC", "Luanda"),
        status="pending", last_seen_at=old_seen,
    )
    db.add(existing)
    db.commit()

    result = _run_with_items(db, monkeypatch, [_item()])

    assert result["ingested"] == 0
    assert result["skipped"] == 1
    assert db.query(ScrapedJob).count() == 1
    # Re-query rather than refresh(existing): the task's own db.close() on
    # the shared monkeypatched session detached the original instance.
    row = db.query(ScrapedJob).first()
    assert row.last_seen_at > old_seen


def test_existing_source_url_dedups_even_when_hash_differs(db, monkeypatch):
    existing = ScrapedJob(
        title="Título antigo diferente",
        content_hash=content_hash("Título antigo diferente", "Outra Empresa", "Benguela"),
        source_url="https://example.com/vaga/123",
        status="pending", last_seen_at=datetime.utcnow(),
    )
    db.add(existing)
    db.commit()

    result = _run_with_items(db, monkeypatch, [_item(source_url="https://example.com/vaga/123")])

    assert result["ingested"] == 0
    assert result["skipped"] == 1
    assert db.query(ScrapedJob).count() == 1


def test_intra_batch_duplicates_produce_one_row(db, monkeypatch):
    result = _run_with_items(db, monkeypatch, [_item(), _item()])

    assert result["ingested"] == 1
    assert result["skipped"] == 1
    assert db.query(ScrapedJob).count() == 1


def test_unchanged_source_skips_ingestion_and_persists_validators(db, monkeypatch):
    """A source whose conditional GET comes back unchanged must skip
    parse+dedup entirely — no rows created, no items even considered —
    while still recording the run and refreshing the validators (a 304
    can still carry a rotated ETag)."""
    import app.services.scraper_service as scraper_service
    from app.models import ScraperSource
    from app.services.scraper_service import FetchOutcome

    source = ScraperSource(name="Unchanged Source", type="json", url="http://x", enabled=True)
    db.add(source)
    db.commit()
    source_id = source.id
    # Detach from the identity map before the task runs: the task shares
    # this exact session (monkeypatched SessionLocal) and closes it in its
    # own `finally`, which otherwise leaves `source` a stale, unrefreshable
    # instance that a later re-query by the same PK collides with.
    db.expunge(source)

    class _UnchangedAdapter:
        def __init__(self):
            self.name = "unchanged-source"
            self.source_id = source_id
            self.last_fetch = None

        def host_key(self):
            return self.name

        def fetch(self):
            self.last_fetch = FetchOutcome(unchanged=True, etag='"new-etag"', last_modified="new-date", body_hash="newhash")
            return []  # a real adapter also returns no items when unchanged (body=None)

    monkeypatch.setattr(tasks, "get_adapters", lambda _db: [_UnchangedAdapter()], raising=False)
    monkeypatch.setattr(scraper_service, "get_adapters", lambda _db: [_UnchangedAdapter()])

    result = tasks.scrape_external_jobs()

    assert result["ingested"] == 0
    assert result["skipped"] == 0
    assert db.query(ScrapedJob).count() == 0

    # Re-query rather than refresh(source): the task's own db.close() on
    # the shared monkeypatched session detached the original instance.
    refreshed = db.query(ScraperSource).filter(ScraperSource.id == source_id).first()
    assert refreshed.last_run_status == "unchanged"
    assert refreshed.http_etag == '"new-etag"'
    assert refreshed.http_last_modified == "new-date"
    assert refreshed.last_body_hash == "newhash"


def _make_live_employer_job(db, title="Analista Financeiro", company_name="Banco ABC"):
    """A Job posted directly by a real Company account (source=None) — the
    kind of listing the scraper should recognise instead of re-adding as a
    fresh curation item."""
    from app.models import Company, Job, User, UserRole

    owner = User(id=str(uuid.uuid4()), email=f"{uuid.uuid4()}@example.com", full_name="Owner", password_hash="x", role=UserRole.company)
    db.add(owner)
    db.flush()
    company = Company(owner_user_id=owner.id, name=company_name, status="active")
    db.add(company)
    db.flush()
    job = Job(company_id=company.id, title=title, status="approved", visibility="public")
    db.add(job)
    db.commit()
    return job


def test_job_dedup_matches_live_employer_job(db, monkeypatch):
    """A scraped item matching a Job a real employer already posted directly
    must be recorded as a duplicate (linked via duplicate_of), not queued
    for curation as if it were new."""
    job = _make_live_employer_job(db)
    job_id = job.id
    db.expunge(job)

    result = _run_with_items(db, monkeypatch, [_item(title="Analista Financeiro", company="Banco ABC")])

    assert result["ingested"] == 0
    assert result["skipped"] == 1
    row = db.query(ScrapedJob).first()
    assert row.status == "duplicate"
    assert row.duplicate_of == job_id


def _clean_quality_item():
    """An item with every signal assess_scraped_job_quality checks for —
    real company, long description, no scam phrasing, and structured
    content — the only shape that can score quality_score == 0."""
    return _item(
        description="Procuramos um profissional experiente para integrar a nossa equipa financeira em Luanda, com boas condições.",
        responsibilities=["Gerir contas a pagar e receber", "Preparar relatórios financeiros mensais"],
        requirements=["Licenciatura em Finanças ou Contabilidade", "3+ anos de experiência"],
    )


def test_auto_approve_gated_off_by_default_even_when_source_trusted(db, monkeypatch):
    """The global SCRAPER_AUTO_APPROVE_ENABLED flag has no row yet (ships
    unset = off) — even a source explicitly marked trusted must NOT
    auto-publish until an admin deliberately flips the global switch too."""
    result = _run_with_items(db, monkeypatch, [_clean_quality_item()], trusted_auto_approve=True)

    assert result["ingested"] == 1
    assert result.get("autoApproved", 0) == 0
    row = db.query(ScrapedJob).first()
    assert row.status == "pending"
    assert row.published_job_id is None


def test_auto_approve_publishes_when_global_flag_and_source_both_enabled(db, monkeypatch):
    """Only once BOTH the global flag and the per-source trusted toggle are
    on does a clean-quality item from that source publish immediately."""
    from app.models import User, UserRole
    from app.services.feature_flags import set_flag

    # _publish_scraped_job's aggregator-company bootstrap falls back to any
    # admin account when called with admin=None (the scheduled/background
    # path) — needs one to exist, same as it would in a real deployment.
    db.add(User(id=str(uuid.uuid4()), email="admin@parvagas.pt", full_name="Admin", password_hash="x", role=UserRole.admin))
    db.commit()

    set_flag(db, "SCRAPER_AUTO_APPROVE_ENABLED", True)

    result = _run_with_items(db, monkeypatch, [_clean_quality_item()], trusted_auto_approve=True)

    assert result["ingested"] == 1
    assert result["autoApproved"] == 1
    row = db.query(ScrapedJob).first()
    assert row.status == "approved"
    assert row.published_job_id is not None
    from app.models import Job
    published = db.query(Job).filter(Job.id == row.published_job_id).first()
    assert published is not None
    assert published.status == "approved"
