"""Tests for the admin compliance dashboard (Wave X4,
EXECUTION_PLAN_LEGAL_AND_PAYMENTS.md) — an aggregate view over the
compliance-analyzer, DSAR, dispute, security-incident, and legal-document
surfaces built across this plan.
"""
import asyncio
import uuid
from datetime import datetime, timedelta

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.base import Base
from app.models import Company, Plan, Transaction, User, UserRole
from app.services import compliance_analyzer_service, dsar_service, incident_service, legal_service
from app.api.v1.account import file_dispute
from app.api.v1.admin import admin_compliance_dashboard


@pytest.fixture()
def db(monkeypatch):
    monkeypatch.setattr("app.workers.tasks.send_templated_email.delay", lambda *a, **k: None)
    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()


def _make_admin(db, admin_level="super-admin"):
    admin = User(id=str(uuid.uuid4()), email=f"admin-{uuid.uuid4()}@x.com", full_name="Admin", password_hash="x", role=UserRole.admin, admin_level=admin_level)
    db.add(admin)
    db.commit()
    return admin


def test_empty_state_returns_zeroes(db):
    admin = _make_admin(db)
    result = asyncio.run(admin_compliance_dashboard(db=db, current_user=admin))
    assert result["ok"] is True
    assert result["complianceChecks"]["openTotal"] == 0
    assert result["dsar"]["pendingExport"] == 0
    assert result["disputes"]["open"] == 0
    assert result["incidents"]["open"] == 0
    assert result["legalDocuments"]["total"] == 0


def test_counts_open_compliance_checks_by_severity(db):
    admin = _make_admin(db)
    compliance_analyzer_service.analyze_feature(
        db, feature_name="X", feature_description="Y", intake={"payment_billing_change": True}, created_by_user_id=admin.id,
    )
    result = asyncio.run(admin_compliance_dashboard(db=db, current_user=admin))
    assert result["complianceChecks"]["openTotal"] == 1


def test_counts_pending_dsar_requests(db):
    admin = _make_admin(db)
    user = User(id=str(uuid.uuid4()), email="u@x.com", full_name="U", password_hash="x", role=UserRole.candidate)
    db.add(user)
    db.commit()
    dsar_service.create_erasure_request(db, user, note="x")

    result = asyncio.run(admin_compliance_dashboard(db=db, current_user=admin))
    assert result["dsar"]["pendingErasure"] == 1
    assert result["dsar"]["pendingExport"] == 0


def test_counts_open_disputes_and_includes_rate(db):
    admin = _make_admin(db)
    owner = User(id=str(uuid.uuid4()), email="owner@x.com", full_name="Owner", password_hash="x", role=UserRole.company)
    db.add(owner)
    db.flush()
    company = Company(owner_user_id=owner.id, name="Acme", status="active")
    db.add(company)
    db.flush()
    plan = Plan(code="business", name="Business", price=75000, currency="AOA", interval="month", features="[]", active=True)
    db.add(plan)
    db.flush()
    tx = Transaction(company_id=company.id, plan_id=plan.id, amount=75000, currency="AOA", provider="manual", reference="PV-1", status="paid")
    db.add(tx)
    db.commit()

    asyncio.run(file_dispute({"transactionReference": tx.reference, "reason": "x"}, db=db, current_user=owner))

    result = asyncio.run(admin_compliance_dashboard(db=db, current_user=admin))
    assert result["disputes"]["open"] == 1
    assert result["disputes"]["rate"] is not None
    assert result["disputes"]["rate"]["paidTransactions"] == 1


def test_counts_open_incidents_and_flags_breach_awaiting_notification(db):
    admin = _make_admin(db)
    incident = incident_service.create_incident(db, title="Breach", description="Y", severity="critica", created_by=admin)
    incident_service.assess_impact(
        db, incident, is_personal_data_breach=True, risk_level="high",
        affected_data_categories="emails", affected_subject_count_estimate=1, user=admin,
    )

    result = asyncio.run(admin_compliance_dashboard(db=db, current_user=admin))
    assert result["incidents"]["open"] == 1
    assert len(result["incidents"]["breachesAwaitingNotification"]) == 1
    assert result["incidents"]["breachesAwaitingNotification"][0]["id"] == incident.id


def test_resolved_incident_not_counted_as_open(db):
    admin = _make_admin(db)
    incident = incident_service.create_incident(db, title="X", description="Y", severity="baixa", created_by=admin)
    incident_service.close_incident(db, incident, review_notes="", user=admin)

    result = asyncio.run(admin_compliance_dashboard(db=db, current_user=admin))
    assert result["incidents"]["open"] == 0


def test_counts_legal_documents(db):
    admin = _make_admin(db)
    doc = legal_service.create_document(db, slug="termos", title="Termos", category="tos", requires_acceptance=True)
    legal_service.create_document(db, slug="cookies", title="Cookies", category="cookies", requires_acceptance=False)

    result = asyncio.run(admin_compliance_dashboard(db=db, current_user=admin))
    assert result["legalDocuments"]["total"] == 2
    assert result["legalDocuments"]["requiringAcceptance"] == 1
