"""Tests for the dispute-rate threshold alert — fluxo-resolucao-disputas.md
Section 7 (Wave D3, EXECUTION_PLAN_LEGAL_AND_PAYMENTS.md): an abnormally
high dispute rate is escalated as a security event, same as a login burst.
"""
import uuid

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.base import Base
from app.models import Company, PaymentDispute, Plan, SecurityEvent, Transaction, User, UserRole
from app.services import dispute_service


@pytest.fixture()
def db(monkeypatch):
    sent_alerts = []
    monkeypatch.setattr("app.workers.tasks.send_templated_email.delay", lambda method, payload: sent_alerts.append((method, payload)))
    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    session._sent_alerts = sent_alerts  # stash for assertions
    yield session
    session.close()


def _make_paid_tx(db, *, resolved_dispute=False):
    owner = User(id=str(uuid.uuid4()), email=f"owner-{uuid.uuid4()}@x.com", full_name="Owner", password_hash="x", role=UserRole.company)
    db.add(owner)
    db.flush()
    company = Company(owner_user_id=owner.id, name="Acme", status="active")
    db.add(company)
    db.flush()
    plan = Plan(code=f"p-{uuid.uuid4()}", name="Business", price=75000, currency="AOA", interval="month", features="[]", active=True)
    db.add(plan)
    db.flush()
    tx = Transaction(company_id=company.id, plan_id=plan.id, amount=75000, currency="AOA", provider="manual", reference=f"PV-{uuid.uuid4().hex[:8]}", status="paid")
    db.add(tx)
    db.commit()
    if resolved_dispute:
        dispute_service.create_dispute(db, transaction=tx, filed_by=owner, category="other", reason="x")
    return owner, tx


def test_no_alert_below_minimum_transaction_volume(db):
    dispute_service.settings.DISPUTE_RATE_MIN_TRANSACTIONS = 100
    _make_paid_tx(db, resolved_dispute=True)
    dispute = dispute_service.list_disputes(db)[0]
    admin = User(id=str(uuid.uuid4()), email="a@x.com", full_name="A", password_hash="x", role=UserRole.admin, admin_level="super-admin")
    db.add(admin)
    db.commit()
    dispute_service.reject(db, dispute, admin=admin, rejection_reason="fora da política")

    alerts = [a for a in db._sent_alerts if a[0] == "send_security_alert_email"]
    assert alerts == []
    dispute_service.settings.DISPUTE_RATE_MIN_TRANSACTIONS = 10


def test_alert_fires_when_rate_exceeds_threshold(db):
    dispute_service.settings.DISPUTE_RATE_MIN_TRANSACTIONS = 2
    dispute_service.settings.DISPUTE_RATE_ALERT_THRESHOLD = 0.1

    admin = User(id=str(uuid.uuid4()), email="a2@x.com", full_name="A", password_hash="x", role=UserRole.admin, admin_level="super-admin")
    db.add(admin)
    db.commit()

    _make_paid_tx(db)
    _make_paid_tx(db)
    owner, tx = _make_paid_tx(db)
    dispute = dispute_service.create_dispute(db, transaction=tx, filed_by=owner, category="other", reason="x")

    dispute_service.reject(db, dispute, admin=admin, rejection_reason="fora da política")

    alerts = [a for a in db._sent_alerts if a[0] == "send_security_alert_email"]
    assert len(alerts) == 1

    event = db.query(SecurityEvent).filter(SecurityEvent.event_type == "dispute_rate_threshold").first()
    assert event is not None
    assert event.severity == "high"

    dispute_service.settings.DISPUTE_RATE_MIN_TRANSACTIONS = 10
    dispute_service.settings.DISPUTE_RATE_ALERT_THRESHOLD = 0.1


def test_alert_is_deduplicated_within_cooldown(db):
    dispute_service.settings.DISPUTE_RATE_MIN_TRANSACTIONS = 1
    dispute_service.settings.DISPUTE_RATE_ALERT_THRESHOLD = 0.01

    admin = User(id=str(uuid.uuid4()), email="a3@x.com", full_name="A", password_hash="x", role=UserRole.admin, admin_level="super-admin")
    db.add(admin)
    db.commit()

    owner, tx = _make_paid_tx(db)
    dispute = dispute_service.create_dispute(db, transaction=tx, filed_by=owner, category="other", reason="x")
    dispute_service.reject(db, dispute, admin=admin, rejection_reason="x")

    owner2, tx2 = _make_paid_tx(db)
    dispute2 = dispute_service.create_dispute(db, transaction=tx2, filed_by=owner2, category="other", reason="y")
    dispute_service.reject(db, dispute2, admin=admin, rejection_reason="y")

    alerts = [a for a in db._sent_alerts if a[0] == "send_security_alert_email"]
    assert len(alerts) == 1  # second trip within cooldown window is suppressed

    dispute_service.settings.DISPUTE_RATE_MIN_TRANSACTIONS = 10
    dispute_service.settings.DISPUTE_RATE_ALERT_THRESHOLD = 0.1
