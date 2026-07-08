"""Tests for candidate premium-tier entitlement (Phase 4).

The load-bearing guarantee: while CANDIDATE_PREMIUM_ENABLED is off (the
default — no pricing decided yet), every candidate has access regardless of
subscription state. This is what makes premium AI tools ship as a free
feature today.
"""
import uuid
from datetime import datetime, timedelta

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.base import Base
from app.models import CandidateSubscription
from app.services import candidate_billing_service
from app.services.candidate_billing_service import candidate_has_premium_access


@pytest.fixture()
def db():
    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()


def test_access_granted_when_flag_off_even_with_no_subscription(db, monkeypatch):
    monkeypatch.setattr(candidate_billing_service.settings, "CANDIDATE_PREMIUM_ENABLED", False)
    assert candidate_has_premium_access(db, str(uuid.uuid4())) is True


def test_access_denied_when_flag_on_with_no_subscription(db, monkeypatch):
    monkeypatch.setattr(candidate_billing_service.settings, "CANDIDATE_PREMIUM_ENABLED", True)
    assert candidate_has_premium_access(db, str(uuid.uuid4())) is False


def test_access_granted_when_flag_on_with_active_unexpired_subscription(db, monkeypatch):
    monkeypatch.setattr(candidate_billing_service.settings, "CANDIDATE_PREMIUM_ENABLED", True)
    user_id = str(uuid.uuid4())
    db.add(CandidateSubscription(
        candidate_user_id=user_id, status="active",
        current_period_end=datetime.utcnow() + timedelta(days=30),
    ))
    db.commit()
    assert candidate_has_premium_access(db, user_id) is True


def test_access_denied_when_subscription_expired(db, monkeypatch):
    monkeypatch.setattr(candidate_billing_service.settings, "CANDIDATE_PREMIUM_ENABLED", True)
    user_id = str(uuid.uuid4())
    db.add(CandidateSubscription(
        candidate_user_id=user_id, status="active",
        current_period_end=datetime.utcnow() - timedelta(days=1),
    ))
    db.commit()
    assert candidate_has_premium_access(db, user_id) is False


def test_access_denied_when_subscription_cancelled(db, monkeypatch):
    monkeypatch.setattr(candidate_billing_service.settings, "CANDIDATE_PREMIUM_ENABLED", True)
    user_id = str(uuid.uuid4())
    db.add(CandidateSubscription(
        candidate_user_id=user_id, status="cancelled",
        current_period_end=datetime.utcnow() + timedelta(days=30),
    ))
    db.commit()
    assert candidate_has_premium_access(db, user_id) is False


def test_access_granted_with_no_period_end_means_ongoing(db, monkeypatch):
    monkeypatch.setattr(candidate_billing_service.settings, "CANDIDATE_PREMIUM_ENABLED", True)
    user_id = str(uuid.uuid4())
    db.add(CandidateSubscription(candidate_user_id=user_id, status="active", current_period_end=None))
    db.commit()
    assert candidate_has_premium_access(db, user_id) is True
