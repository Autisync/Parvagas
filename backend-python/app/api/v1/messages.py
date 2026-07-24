"""Two-way company↔candidate messaging on a JobApplication (overnight-audit
W5.1) — previously a company's only way to ask a candidate a clarifying
question was emailing them manually outside the platform.

Deliberately mounted as its own module rather than folded into the already
700+-line applications.py, but kept under the same `/applications/{id}/...`
prefix as the existing notes/candidate-cv endpoints for URL consistency.
"""
from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.observability import limiter, rate_limit_key_by_user
from app.db.session import get_db
from app.models import ApplicationMessage, Company, JobApplication, User, UserRole
from app.services.company_access_service import resolve_company_for_user_or_none, require_role
from app.services.notification_service import create_notification
from app.services.live_update_service import publish_invalidate

router = APIRouter(tags=["messages"])

_MAX_BODY_LENGTH = 2000


def _viewer_role(db: Session, user: User, app_row: JobApplication) -> str | None:
    """"company" | "candidate" | None (no access) for `user` on `app_row` —
    admin counts as company for read access (moderation visibility) but
    never as a distinct sender role."""
    if app_row.candidate_user_id and app_row.candidate_user_id == user.id:
        return "candidate"
    if user.role == UserRole.admin:
        return "company"
    co = resolve_company_for_user_or_none(db, user)
    if co and app_row.company_id == co.id:
        return "company"
    return None


def _serialize_message(m: ApplicationMessage) -> dict:
    return {
        "_id": m.id,
        "senderUserId": m.sender_user_id,
        "senderRole": m.sender_role,
        "body": m.body,
        "readAt": m.read_at.isoformat() if m.read_at else None,
        "createdAt": m.created_at.isoformat() if m.created_at else None,
    }


@router.get("/applications/{application_id}/messages")
async def list_application_messages(
    application_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    app_row = db.query(JobApplication).filter(JobApplication.id == application_id).first()
    if not app_row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Application not found")
    role = _viewer_role(db, current_user, app_row)
    if not role:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sem permissão")

    rows = (
        db.query(ApplicationMessage)
        .filter(ApplicationMessage.application_id == application_id)
        .order_by(ApplicationMessage.created_at.asc())
        .all()
    )
    return {"messages": [_serialize_message(m) for m in rows], "viewerRole": role}


@router.post("/applications/{application_id}/messages")
@limiter.limit("30/hour", key_func=rate_limit_key_by_user)
async def send_application_message(
    application_id: str,
    payload: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    request: Request = None,
):
    app_row = db.query(JobApplication).filter(JobApplication.id == application_id).first()
    if not app_row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Application not found")
    if not app_row.candidate_user_id:
        # Guest/quick-apply applicant — no portal account to receive this in.
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Este candidato não tem conta na plataforma")

    company: Company | None = None
    if current_user.role == UserRole.candidate and current_user.id == app_row.candidate_user_id:
        sender_role = "candidate"
        # Company must send first — see the model docstring and the plan
        # this shipped from for why (avoids applicant messages flooding
        # company inboxes before any triage has happened).
        already_started = (
            db.query(ApplicationMessage.id)
            .filter(ApplicationMessage.application_id == application_id, ApplicationMessage.sender_role == "company")
            .first()
        )
        if not already_started:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="A empresa ainda não iniciou esta conversa.")
    else:
        company = resolve_company_for_user_or_none(db, current_user)
        if not company or app_row.company_id != company.id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sem permissão")
        require_role(db, current_user, company, {"owner", "recruiter"})
        sender_role = "company"

    body = str(payload.get("body", "")).strip()
    if not body:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="A mensagem não pode estar vazia")
    if len(body) > _MAX_BODY_LENGTH:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Máximo de {_MAX_BODY_LENGTH} caracteres")

    message = ApplicationMessage(
        application_id=application_id, sender_user_id=current_user.id, sender_role=sender_role, body=body,
    )
    db.add(message)
    db.commit()
    db.refresh(message)

    # Notify the other party — reuses the existing notification-bell
    # infrastructure (30s poll, already live) rather than building a
    # dedicated real-time channel for v1.
    if sender_role == "company":
        recipient_id = app_row.candidate_user_id
        title = "Nova mensagem da empresa"
    else:
        # Candidate replies notify the company owner (team members aren't
        # individually addressable here — same simplification the rest of
        # the company-facing notification flows already make).
        co = db.query(Company).filter(Company.id == app_row.company_id).first()
        recipient_id = co.owner_user_id if co else None
        title = "Nova mensagem do candidato"

    if recipient_id:
        create_notification(
            db, recipient_id, type="new_message", title=title,
            body=body[:140],
            link=(
                "/Portal/Candidato/Candidaturas" if sender_role == "company"
                else f"/Portal/Empresa/Candidaturas?applicationId={application_id}"
            ),
        )

    publish_invalidate("applications", entity="message", action="created")

    return {"message": _serialize_message(message)}


@router.patch("/applications/{application_id}/messages/read")
async def mark_application_messages_read(
    application_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    app_row = db.query(JobApplication).filter(JobApplication.id == application_id).first()
    if not app_row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Application not found")
    role = _viewer_role(db, current_user, app_row)
    if not role:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sem permissão")

    other_role = "candidate" if role == "company" else "company"
    updated = (
        db.query(ApplicationMessage)
        .filter(
            ApplicationMessage.application_id == application_id,
            ApplicationMessage.sender_role == other_role,
            ApplicationMessage.read_at.is_(None),
        )
        .update({"read_at": datetime.utcnow()}, synchronize_session=False)
    )
    db.commit()
    return {"markedRead": updated}
