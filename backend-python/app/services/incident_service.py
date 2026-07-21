"""Security-incident tracking and the GDPR 72-hour notification clock —
Wave X1, EXECUTION_PLAN_LEGAL_AND_PAYMENTS.md. Operationalizes the runbook
in seguranca-incidentes.md exactly: Section 2 (severity), Section 3
(the 7-step procedure), Section 4 (roles). See that document for the
human-readable policy this code enforces.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta
from typing import Any

from sqlalchemy.orm import Session

from app.models import SecurityIncident, SecurityIncidentLogEntry, User

NOTIFICATION_WINDOW_HOURS = 72  # Art. 33 RGPD
CLIENT_NOTIFICATION_WINDOW_HOURS = 48  # DPA Section 5, B2B "Dados de Candidatura"
POST_INCIDENT_REVIEW_DAYS = 15  # Section 3, Passo 7
DEADLINE_ALERT_LEAD_HOURS = 24  # escalate when this close to the 72h deadline

SEVERITIES = ("critica", "alta", "media", "baixa")
RISK_LEVELS = ("none", "low", "high")


def _log(db: Session, incident: SecurityIncident, *, entry_type: str, body: str, user: User | None) -> SecurityIncidentLogEntry:
    entry = SecurityIncidentLogEntry(
        id=str(uuid.uuid4()), incident_id=incident.id, entry_type=entry_type, body=body,
        created_by_user_id=user.id if user else None,
    )
    db.add(entry)
    db.commit()
    return entry


def create_incident(
    db: Session, *, title: str, description: str, severity: str, created_by: User,
) -> SecurityIncident:
    severity = severity if severity in SEVERITIES else "baixa"
    incident = SecurityIncident(
        id=str(uuid.uuid4()), title=title.strip(), description=description.strip(),
        severity=severity, created_by_user_id=created_by.id,
    )
    db.add(incident)
    db.commit()
    db.refresh(incident)
    _log(db, incident, entry_type="status_change", body="Incidente registado (Passo 1 — Deteção e Registo).", user=created_by)

    if severity in ("critica", "alta"):
        from app.services import security_service
        security_service._send_alert(
            db, alert_for="security_incident_created", alert_key=incident.id,
            subject=f"Parvagas — Novo incidente de segurança ({severity}): {incident.title}",
            title="Novo incidente de segurança registado",
            lines=[
                f"Severidade: {severity}.",
                incident.description[:400],
                "Reveja e classifique em /Portal/Admin/security-incidents.",
            ],
        )
    return incident


def notification_deadline(incident: SecurityIncident) -> datetime | None:
    """Art. 33 clock — starts at the moment of detection (created_at, per
    seguranca-incidentes.md Section 3 Passo 4), only meaningful once the
    incident is confirmed a personal-data breach."""
    if not incident.is_personal_data_breach:
        return None
    return incident.created_at + timedelta(hours=NOTIFICATION_WINDOW_HOURS)


def client_notification_deadline(incident: SecurityIncident) -> datetime | None:
    if not incident.is_personal_data_breach:
        return None
    return incident.created_at + timedelta(hours=CLIENT_NOTIFICATION_WINDOW_HOURS)


def hours_remaining(incident: SecurityIncident) -> float | None:
    deadline = notification_deadline(incident)
    if not deadline:
        return None
    return (deadline - datetime.utcnow()).total_seconds() / 3600


def add_note(db: Session, incident: SecurityIncident, *, note: str, user: User) -> SecurityIncidentLogEntry:
    return _log(db, incident, entry_type="note", body=note.strip(), user=user)


def record_containment(db: Session, incident: SecurityIncident, *, action: str, user: User) -> SecurityIncident:
    if not incident.contained_at:
        incident.contained_at = datetime.utcnow()
        db.commit()
        db.refresh(incident)
    _log(db, incident, entry_type="containment", body=action.strip(), user=user)
    return incident


def assess_impact(
    db: Session, incident: SecurityIncident, *, is_personal_data_breach: bool, risk_level: str | None,
    affected_data_categories: str, affected_subject_count_estimate: int | None, user: User,
) -> SecurityIncident:
    incident.impact_assessed_at = datetime.utcnow()
    incident.is_personal_data_breach = is_personal_data_breach
    incident.risk_level = risk_level if risk_level in RISK_LEVELS else None
    incident.affected_data_categories = affected_data_categories.strip() or None
    incident.affected_subject_count_estimate = affected_subject_count_estimate
    db.commit()
    db.refresh(incident)

    summary = (
        f"Avaliação de impacto: {'confirmada' if is_personal_data_breach else 'não confirmada'} como violação de dados pessoais."
        + (f" Risco para titulares: {risk_level}." if is_personal_data_breach else "")
    )
    _log(db, incident, entry_type="status_change", body=summary, user=user)
    return incident


def mark_authority_notified(db: Session, incident: SecurityIncident, *, user: User) -> SecurityIncident:
    incident.authority_notified_at = datetime.utcnow()
    db.commit()
    db.refresh(incident)
    _log(db, incident, entry_type="status_change", body="Autoridade de controlo notificada (Art. 33.º RGPD).", user=user)
    return incident


def mark_subjects_notified(db: Session, incident: SecurityIncident, *, user: User) -> SecurityIncident:
    incident.subjects_notified_at = datetime.utcnow()
    db.commit()
    db.refresh(incident)
    _log(db, incident, entry_type="status_change", body="Titulares de dados notificados (Art. 34.º RGPD).", user=user)
    return incident


def mark_client_notified(db: Session, incident: SecurityIncident, *, user: User) -> SecurityIncident:
    incident.client_notified_at = datetime.utcnow()
    db.commit()
    db.refresh(incident)
    _log(db, incident, entry_type="status_change", body="Cliente empresarial notificado (DPA, Secção 5).", user=user)
    return incident


def remediate(db: Session, incident: SecurityIncident, *, notes: str, user: User) -> SecurityIncident:
    incident.remediated_at = datetime.utcnow()
    incident.remediation_notes = notes.strip()
    db.commit()
    db.refresh(incident)
    _log(db, incident, entry_type="status_change", body=f"Remediação concluída: {notes.strip()}", user=user)
    return incident


def close_incident(db: Session, incident: SecurityIncident, *, review_notes: str, user: User) -> SecurityIncident:
    incident.closed_at = datetime.utcnow()
    incident.post_incident_review_notes = review_notes.strip() or None
    db.commit()
    db.refresh(incident)
    _log(db, incident, entry_type="status_change", body="Incidente encerrado.", user=user)
    return incident


def post_incident_review_due_at(incident: SecurityIncident) -> datetime | None:
    if not incident.closed_at:
        return None
    return incident.closed_at + timedelta(days=POST_INCIDENT_REVIEW_DAYS)


def list_incidents(db: Session, *, open_only: bool = False) -> list[SecurityIncident]:
    query = db.query(SecurityIncident)
    if open_only:
        query = query.filter(SecurityIncident.closed_at.is_(None))
    return query.order_by(SecurityIncident.created_at.desc()).all()


def get_incident(db: Session, incident_id: str) -> SecurityIncident | None:
    return db.query(SecurityIncident).filter(SecurityIncident.id == incident_id).first()


def list_log_entries(db: Session, incident_id: str) -> list[SecurityIncidentLogEntry]:
    return (
        db.query(SecurityIncidentLogEntry)
        .filter(SecurityIncidentLogEntry.incident_id == incident_id)
        .order_by(SecurityIncidentLogEntry.created_at.asc())
        .all()
    )


def check_notification_deadlines(db: Session) -> dict[str, int]:
    """Periodic sweep (Celery beat): escalate any confirmed personal-data
    breach that's within DEADLINE_ALERT_LEAD_HOURS of its 72h deadline (or
    already past it) and hasn't notified the authority yet. Alerts once per
    incident via deadline_alert_sent_at — this is a hard legal deadline, not
    a cooldown-throttled nuisance signal."""
    from app.services import security_service

    alerted = 0
    open_breaches = (
        db.query(SecurityIncident)
        .filter(
            SecurityIncident.is_personal_data_breach.is_(True),
            SecurityIncident.authority_notified_at.is_(None),
            SecurityIncident.deadline_alert_sent_at.is_(None),
        )
        .all()
    )
    for incident in open_breaches:
        remaining = hours_remaining(incident)
        if remaining is None or remaining > DEADLINE_ALERT_LEAD_HOURS:
            continue
        incident.deadline_alert_sent_at = datetime.utcnow()
        db.commit()
        overdue = remaining < 0
        security_service._send_alert(
            db, alert_for="breach_notification_deadline", alert_key=incident.id,
            subject=f"Parvagas — {'PRAZO ULTRAPASSADO' if overdue else 'Prazo de 72h a aproximar-se'}: {incident.title}",
            title="Prazo de notificação de violação de dados (Art. 33.º RGPD)",
            lines=[
                f"Incidente: {incident.title} (severidade {incident.severity}).",
                f"{'Prazo de 72h já ultrapassado.' if overdue else f'Restam aproximadamente {remaining:.1f} horas.'}",
                "A autoridade de controlo (APD/CNPD) ainda não foi notificada — reveja de imediato em /Portal/Admin/security-incidents.",
            ],
        )
        alerted += 1
    return {"alerted": alerted}
