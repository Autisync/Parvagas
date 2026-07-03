"""Tests for the pending-scraped-jobs lane diversity signal (isolated in-memory DB)."""
import uuid

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.base import Base
from app.models import ScrapedJob
from app.api.v1.admin import _pending_lane_counts


@pytest.fixture()
def db():
    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()


def _make_scraped(db, lane, status="pending"):
    s = ScrapedJob(id=str(uuid.uuid4()), title="Vaga", status=status, audience_lane=lane)
    db.add(s)
    db.flush()
    return s


def test_counts_pending_jobs_by_lane(db):
    _make_scraped(db, "entry_level")
    _make_scraped(db, "entry_level")
    _make_scraped(db, "professional")
    _make_scraped(db, None)  # unclassified
    db.commit()

    counts = _pending_lane_counts(db)

    assert counts == {"entry_level": 2, "professional": 1, "unclassified": 1}


def test_excludes_non_pending_jobs(db):
    _make_scraped(db, "professional", status="pending")
    _make_scraped(db, "remote", status="approved")  # not counted
    db.commit()

    counts = _pending_lane_counts(db)

    assert counts == {"professional": 1}


def test_empty_queue_returns_empty_counts(db):
    assert _pending_lane_counts(db) == {}
