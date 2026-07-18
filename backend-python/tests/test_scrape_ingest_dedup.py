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
    def __init__(self, items):
        self.name = "fake-source"
        self.source_id = str(uuid.uuid4())
        self._items = items

    def fetch(self):
        return self._items


def _run_with_items(db, monkeypatch, items):
    import app.services.scraper_service as scraper_service

    monkeypatch.setattr(tasks, "get_adapters", lambda _db: [_FakeAdapter(items)], raising=False)
    # scrape_external_jobs imports these inside the function body, so patch
    # them on the scraper_service module it imports from.
    monkeypatch.setattr(scraper_service, "get_adapters", lambda _db: [_FakeAdapter(items)])
    return tasks.scrape_external_jobs()


def _item(title="Analista Financeiro", company="Banco ABC", location="Luanda", source_url=None):
    return {
        "title": title, "company": company, "location": location,
        "category": "Finanças", "description": "Descrição da vaga com detalhe suficiente.",
        "source": "fake-source", "sourceUrl": source_url,
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
