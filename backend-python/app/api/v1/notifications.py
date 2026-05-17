"""Notifications endpoints used by portal header bell."""
from __future__ import annotations

from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, Query

from app.api.deps import get_current_user
from app.models import User


router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("")
async def list_notifications(
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=10, ge=1, le=100),
    current_user: User = Depends(get_current_user),
):
    return {
        "notifications": [],
        "unreadCount": 0,
        "page": page,
        "total": 0,
        "userId": current_user.id,
        "limit": limit,
    }


@router.patch("/{notification_id}/read")
async def mark_notification_read(
    notification_id: str,
    current_user: User = Depends(get_current_user),
):
    return {
        "notification": {
            "_id": notification_id,
            "readAt": datetime.utcnow().isoformat(),
            "userId": current_user.id,
        }
    }


@router.patch("/{notification_id}/unread")
async def mark_notification_unread(
    notification_id: str,
    current_user: User = Depends(get_current_user),
):
    return {
        "notification": {
            "_id": notification_id,
            "readAt": None,
            "userId": current_user.id,
        }
    }


@router.patch("/{notification_id}/resolve")
async def resolve_notification(
    notification_id: str,
    current_user: User = Depends(get_current_user),
):
    return {
        "notification": {
            "_id": notification_id,
            "resolvedAt": datetime.utcnow().isoformat(),
            "userId": current_user.id,
        }
    }


@router.post("/company-admin-message")
async def company_admin_message(
    payload: dict[str, Any],
    current_user: User = Depends(get_current_user),
):
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
