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
from app.models import CandidateCVSubscription, CandidateProfile, Company, Transaction, User
from app.services import dispute_service, dsar_service

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


# ── Payment disputes (Wave D) ────────────────────────────────────────────────

def _user_owns_transaction(db: Session, tx: Transaction, user: User) -> bool:
    if tx.company_id:
        company = db.query(Company).filter(Company.id == tx.company_id).first()
        return bool(company and company.owner_user_id == user.id)
    profile = db.query(CandidateProfile).filter(CandidateProfile.user_id == user.id).first()
    if not profile:
        return False
    return (
        db.query(CandidateCVSubscription)
        .filter(CandidateCVSubscription.transaction_reference == tx.reference, CandidateCVSubscription.candidate_profile_id == profile.id)
        .first()
        is not None
    )


def _to_dispute_record(dispute) -> dict[str, Any]:
    return {
        "id": dispute.id,
        "transactionId": dispute.transaction_id,
        "category": dispute.category,
        "reason": dispute.reason,
        "status": dispute.status,
        "refundAmount": dispute.refund_amount,
        "decisionNote": dispute.decision_note,
        "createdAt": dispute.created_at.isoformat() if dispute.created_at else None,
        "resolvedAt": dispute.resolved_at.isoformat() if dispute.resolved_at else None,
    }


def _to_message_record(message) -> dict[str, Any]:
    return {
        "id": message.id,
        "templateCode": message.template_code,
        "subject": message.subject,
        "body": message.body,
        "isInternalNote": message.is_internal_note,
        "createdAt": message.created_at.isoformat() if message.created_at else None,
    }


@router.get("/dispute-categories")
async def list_dispute_categories():
    return {"categories": dispute_service.CATEGORIES}


@router.post("/disputes")
async def file_dispute(
    payload: dict[str, Any], db: Session = Depends(get_db), current_user: User = Depends(get_current_user),
):
    reference = str(payload.get("transactionReference", "")).strip()
    reason = str(payload.get("reason", "")).strip()
    category = str(payload.get("category", "other")).strip()
    if not reference or not reason:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="transactionReference e reason são obrigatórios")

    tx = db.query(Transaction).filter(Transaction.reference == reference).first()
    if not tx or not _user_owns_transaction(db, tx, current_user):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Transação não encontrada")

    try:
        dispute = dispute_service.create_dispute(db, transaction=tx, filed_by=current_user, category=category, reason=reason)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    return {"dispute": _to_dispute_record(dispute)}


@router.get("/disputes")
async def list_my_disputes(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    mine = dispute_service.list_disputes(db, user_id=current_user.id)
    return {"disputes": [_to_dispute_record(d) for d in mine]}


@router.get("/disputes/{dispute_id}")
async def get_my_dispute(dispute_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    dispute = dispute_service.get_dispute(db, dispute_id)
    if not dispute or dispute.filed_by_user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Disputa não encontrada")
    messages = [m for m in dispute_service.list_messages(db, dispute_id) if not m.is_internal_note]
    record = _to_dispute_record(dispute)
    record["messages"] = [_to_message_record(m) for m in messages]
    return record
