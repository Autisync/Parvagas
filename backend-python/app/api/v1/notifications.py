"""Notifications endpoints used by portal header bell (DB-backed)."""
from __future__ import annotations

from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models import Company, CompanyMember, Notification, SupportMessage, User
from app.services.notification_service import admin_emails, create_notification, notify_admins
from app.core.logging import get_logger

logger = get_logger(__name__)


router = APIRouter(prefix="/notifications", tags=["notifications"])


def _serialize(n: Notification) -> dict[str, Any]:
    return {
        "_id": n.id,
        "type": n.type,
        "title": n.title,
        "body": n.body,
        "link": n.link,
        "readAt": n.read_at.isoformat() if n.read_at else None,
        "createdAt": n.created_at.isoformat() if n.created_at else None,
        "userId": n.user_id,
    }


def _owned(db: Session, notification_id: str, user: User) -> Notification:
    n = (
        db.query(Notification)
        .filter(Notification.id == notification_id, Notification.user_id == user.id)
        .first()
    )
    if not n:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Notification not found")
    return n


@router.get("")
async def list_notifications(
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=10, ge=1, le=100),
    unread_only: bool = Query(default=False),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    base = db.query(Notification).filter(Notification.user_id == current_user.id)
    if unread_only:
        base = base.filter(Notification.read_at.is_(None))
    total = base.count()
    unread = (
        db.query(Notification)
        .filter(Notification.user_id == current_user.id, Notification.read_at.is_(None))
        .count()
    )
    rows = (
        base.order_by(Notification.created_at.desc())
        .offset((page - 1) * limit)
        .limit(limit)
        .all()
    )
    return {
        "notifications": [_serialize(n) for n in rows],
        "unreadCount": unread,
        "page": page,
        "total": total,
        "userId": current_user.id,
        "limit": limit,
    }


@router.patch("/read-all")
async def mark_all_read(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    now = datetime.utcnow()
    updated = (
        db.query(Notification)
        .filter(Notification.user_id == current_user.id, Notification.read_at.is_(None))
        .update({Notification.read_at: now}, synchronize_session=False)
    )
    db.commit()
    return {"updated": updated}


@router.patch("/{notification_id}/read")
async def mark_notification_read(
    notification_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    n = _owned(db, notification_id, current_user)
    if not n.read_at:
        n.read_at = datetime.utcnow()
        db.commit()
        db.refresh(n)
    return {"notification": _serialize(n)}


@router.patch("/{notification_id}/unread")
async def mark_notification_unread(
    notification_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    n = _owned(db, notification_id, current_user)
    n.read_at = None
    db.commit()
    db.refresh(n)
    return {"notification": _serialize(n)}


@router.patch("/{notification_id}/resolve")
async def resolve_notification(
    notification_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    n = _owned(db, notification_id, current_user)
    if not n.read_at:
        n.read_at = datetime.utcnow()
        db.commit()
        db.refresh(n)
    return {"notification": {**_serialize(n), "resolvedAt": n.read_at.isoformat() if n.read_at else None}}


@router.post("/company-admin-message")
async def company_admin_message(
    payload: dict[str, Any],
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Sent from the notification bell's "message" form — in practice this
    is a non-owner company team member messaging their own company's OWNER
    (see NotificationBell.tsx's "Mensagem interna ao owner" label), not
    platform admins, despite the route name. Resolves that owner via
    CompanyMember; falls back to every platform admin if no owner can be
    resolved (e.g. any future caller outside that one flow). Previously
    this endpoint faked a response and persisted nothing, so the message
    reached no one either way."""
    reason = str(payload.get("reason", "")).strip()[:255] or "Mensagem"
    body_text = str(payload.get("message", "")).strip()
    if not body_text:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="A mensagem não pode ficar vazia")

    role = current_user.role.value if hasattr(current_user.role, "value") else str(current_user.role)
    sender_name = current_user.full_name or current_user.email or "Utilizador"

    recipient: User | None = None
    if role == "company":
        membership = db.query(CompanyMember).filter(CompanyMember.user_id == current_user.id).first()
        company = db.query(Company).filter(Company.id == membership.company_id).first() if membership else None
        if company and company.owner_user_id and company.owner_user_id != current_user.id:
            recipient = db.query(User).filter(User.id == company.owner_user_id).first()

    entry = SupportMessage(
        sender_user_id=current_user.id, sender_role=role,
        recipient_user_id=recipient.id if recipient else None,
        reason=reason, message=body_text, status="open",
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)

    try:
        if recipient:
            create_notification(
                db, recipient.id, type="team_message",
                title=f"Mensagem de {sender_name}",
                body=f"[{reason}] {body_text}",
                link="/Portal/Empresa/Utilizadores",
            )
            if recipient.email:
                from app.workers.tasks import send_templated_email
                send_templated_email.delay("send_admin_contact_message_email", {
                    "email": recipient.email, "sender_name": sender_name, "sender_role": role,
                    "reason": reason, "message": body_text,
                })
        else:
            notify_admins(
                db, type="support_message",
                title=f"Mensagem de {sender_name}",
                body=f"[{reason}] {body_text}",
            )
            for admin_email in admin_emails(db):
                from app.workers.tasks import send_templated_email
                send_templated_email.delay("send_admin_contact_message_email", {
                    "email": admin_email, "sender_name": sender_name, "sender_role": role,
                    "reason": reason, "message": body_text,
                })
    except Exception as e:
        logger.warning(f"Could not alert recipient of support message: {e}")

    return {
        "queued": True,
        "message": {
            "_id": entry.id,
            "reason": entry.reason,
            "body": entry.message,
            "createdAt": entry.created_at.isoformat() if entry.created_at else None,
            "userId": current_user.id,
        },
    }
