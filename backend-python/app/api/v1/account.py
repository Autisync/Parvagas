"""Self-service data-subject requests — GDPR/Lei n.º 22/11 access and
erasure rights (Wave C3, EXECUTION_PLAN_LEGAL_AND_PAYMENTS.md). Role-
agnostic: candidates and company users both hit these same two endpoints.
"""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models import User
from app.services import dsar_service

router = APIRouter(prefix="/account", tags=["account"])


def _to_request_record(request) -> dict[str, Any]:
    return {
        "id": request.id,
        "requestType": request.request_type,
        "status": request.status,
        "note": request.note,
        "adminNote": request.admin_note,
        "createdAt": request.created_at.isoformat() if request.created_at else None,
        "reviewedAt": request.reviewed_at.isoformat() if request.reviewed_at else None,
    }


@router.get("/data-export")
async def export_my_data(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Builds and returns the export inline — nothing is written to
    storage, so there's no download link to expire or secure separately."""
    export = dsar_service.build_user_export(db, current_user)
    dsar_service.create_export_request(db, current_user)
    return export


@router.post("/erasure-requests")
async def request_erasure(
    payload: dict[str, Any] | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    note = str((payload or {}).get("note", "")).strip() or None
    request = dsar_service.create_erasure_request(db, current_user, note=note)
    return {"request": _to_request_record(request)}


@router.get("/data-requests")
async def list_my_data_requests(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    mine = dsar_service.list_requests(db, user_id=current_user.id)
    return {"requests": [_to_request_record(r) for r in mine]}
