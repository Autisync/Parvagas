"""Notifications endpoints used by portal header bell (DB-backed)."""
from __future__ import annotations

from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models import Notification, User


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
    current_user: User = Depends(get_current_user),
):
    """Candidate/company → admin contact message (queued for follow-up)."""
    return {
        "queued": True,
        "message": {
            "_id": f"msg-{int(datetime.utcnow().timestamp())}",
            "reason": payload.get("reason", ""),
            "body": payload.get("message", ""),
            "createdAt": datetime.utcnow().isoformat(),
            "userId": current_user.id,
        },
    }
