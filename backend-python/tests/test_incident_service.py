"""Tests for app.services.incident_service — the breach-notification
runbook and 72h GDPR clock (Wave X1, EXECUTION_PLAN_LEGAL_AND_PAYMENTS.md),
operationalizing seguranca-incidentes.md.
"""
import uuid
from datetime import datetime, timedelta

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.base import Base
from app.models import SecurityIncident, User, UserRole
from app.services import incident_service


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


def test_create_incident_logs_detection_entry(db):
    admin = _make_admin(db)
    incident = incident_service.create_incident(db, title="Login burst", description="Rajada de tentativas de login", severity="baixa", created_by=admin)
    assert incident.severity == "baixa"
    entries = incident_service.list_log_entries(db, incident.id)
    assert len(entries) == 1
    assert entries[0].entry_type == "status_change"


def test_create_incident_normalizes_invalid_severity(db):
    admin = _make_admin(db)
    incident = incident_service.create_incident(db, title="X", description="Y", severity="not-real", created_by=admin)
    assert incident.severity == "baixa"


def test_notification_deadline_is_none_until_breach_confirmed(db):
    admin = _make_admin(db)
    incident = incident_service.create_incident(db, title="X", description="Y", severity="alta", created_by=admin)
    assert incident_service.notification_deadline(incident) is None
    assert incident_service.hours_remaining(incident) is None


def test_notification_deadline_is_72h_from_detection_once_confirmed(db):
    admin = _make_admin(db)
    incident = incident_service.create_incident(db, title="X", description="Y", severity="critica", created_by=admin)
    incident = incident_service.assess_impact(
        db, incident, is_personal_data_breach=True, risk_level="high",
        affected_data_categories="emails, telefones", affected_subject_count_estimate=500, user=admin,
    )
    deadline = incident_service.notification_deadline(incident)
    assert deadline == incident.created_at + timedelta(hours=72)


def test_notification_deadline_stays_none_when_assessed_as_not_a_breach(db):
    admin = _make_admin(db)
    incident = incident_service.create_incident(db, title="X", description="Y", severity="media", created_by=admin)
    incident = incident_service.assess_impact(
        db, incident, is_personal_data_breach=False, risk_level=None,
        affected_data_categories="", affected_subject_count_estimate=None, user=admin,
    )
    assert incident_service.notification_deadline(incident) is None


def test_record_containment_sets_contained_at_once(db):
    admin = _make_admin(db)
    incident = incident_service.create_incident(db, title="X", description="Y", severity="alta", created_by=admin)
    incident_service.record_containment(db, incident, action="Credenciais revogadas", user=admin)
    first_contained_at = incident.contained_at
    assert first_contained_at is not None

    incident_service.record_containment(db, incident, action="Sistema isolado", user=admin)
    assert incident.contained_at == first_contained_at  # not overwritten
    entries = incident_service.list_log_entries(db, incident.id)
    assert sum(1 for e in entries if e.entry_type == "containment") == 2


def test_full_lifecycle_reaches_closed(db):
    admin = _make_admin(db)
    incident = incident_service.create_incident(db, title="X", description="Y", severity="critica", created_by=admin)
    incident_service.record_containment(db, incident, action="contido", user=admin)
    incident = incident_service.assess_impact(
        db, incident, is_personal_data_breach=True, risk_level="high",
        affected_data_categories="emails", affected_subject_count_estimate=10, user=admin,
    )
    incident = incident_service.mark_authority_notified(db, incident, user=admin)
    incident = incident_service.mark_subjects_notified(db, incident, user=admin)
    incident = incident_service.remediate(db, incident, notes="corrigido", user=admin)
    incident = incident_service.close_incident(db, incident, review_notes="lições aprendidas", user=admin)

    assert incident.closed_at is not None
    review_due = incident_service.post_incident_review_due_at(incident)
    assert review_due == incident.closed_at + timedelta(days=15)


def test_list_incidents_open_only_filter(db):
    admin = _make_admin(db)
    open_incident = incident_service.create_incident(db, title="Open", description="Y", severity="baixa", created_by=admin)
    closed_incident = incident_service.create_incident(db, title="Closed", description="Y", severity="baixa", created_by=admin)
    incident_service.close_incident(db, closed_incident, review_notes="", user=admin)

    all_incidents = incident_service.list_incidents(db)
    assert len(all_incidents) == 2
    open_only = incident_service.list_incidents(db, open_only=True)
    assert [i.id for i in open_only] == [open_incident.id]


# ── deadline sweep ───────────────────────────────────────────────────────────

def test_check_notification_deadlines_alerts_when_close_to_deadline(db):
    admin = _make_admin(db)
    incident = incident_service.create_incident(db, title="Breach", description="Y", severity="critica", created_by=admin)
    incident = incident_service.assess_impact(
        db, incident, is_personal_data_breach=True, risk_level="high",
        affected_data_categories="emails", affected_subject_count_estimate=1, user=admin,
    )
    # Simulate detection nearly 60h ago (12h left of the 72h window).
    incident.created_at = datetime.utcnow() - timedelta(hours=60)
    db.commit()

    result = incident_service.check_notification_deadlines(db)
    assert result["alerted"] == 1
    db.refresh(incident)
    assert incident.deadline_alert_sent_at is not None


def test_check_notification_deadlines_skips_already_alerted(db):
    admin = _make_admin(db)
    incident = incident_service.create_incident(db, title="Breach", description="Y", severity="critica", created_by=admin)
    incident = incident_service.assess_impact(
        db, incident, is_personal_data_breach=True, risk_level="high",
        affected_data_categories="emails", affected_subject_count_estimate=1, user=admin,
    )
    incident.created_at = datetime.utcnow() - timedelta(hours=60)
    db.commit()

    incident_service.check_notification_deadlines(db)
    result = incident_service.check_notification_deadlines(db)
    assert result["alerted"] == 0


def test_check_notification_deadlines_skips_when_authority_already_notified(db):
    admin = _make_admin(db)
    incident = incident_service.create_incident(db, title="Breach", description="Y", severity="critica", created_by=admin)
    incident = incident_service.assess_impact(
        db, incident, is_personal_data_breach=True, risk_level="high",
        affected_data_categories="emails", affected_subject_count_estimate=1, user=admin,
    )
    incident.created_at = datetime.utcnow() - timedelta(hours=60)
    db.commit()
    incident_service.mark_authority_notified(db, incident, user=admin)

    result = incident_service.check_notification_deadlines(db)
    assert result["alerted"] == 0


def test_check_notification_deadlines_ignores_incidents_with_plenty_of_time(db):
    admin = _make_admin(db)
    incident = incident_service.create_incident(db, title="Breach", description="Y", severity="critica", created_by=admin)
    incident_service.assess_impact(
        db, incident, is_personal_data_breach=True, risk_level="high",
        affected_data_categories="emails", affected_subject_count_estimate=1, user=admin,
    )
    # created_at defaults to now — 72h remaining, well outside the 24h lead window.
    result = incident_service.check_notification_deadlines(db)
    assert result["alerted"] == 0
