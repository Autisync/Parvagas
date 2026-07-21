"""Public read-only access to published legal documents — the /legal hub
and the individual document pages — plus the authenticated re-consent
endpoints (Wave C2, EXECUTION_PLAN_LEGAL_AND_PAYMENTS.md): what a logged-in
user still needs to (re-)accept, and recording that they did. Internal-
audience documents (security policy, admin access policy, dispute
template/workflow) are deliberately excluded from every response here;
they're only reachable through the admin API.
"""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models import User
from app.services import legal_service

router = APIRouter(prefix="/legal", tags=["legal"])

_PUBLIC_AUDIENCES = ("public", "employer")


def _document_summary(db: Session, document) -> dict[str, Any] | None:
    version = legal_service.get_current_version(db, document.id)
    if not version:
        return None
    return {
        "slug": document.slug,
        "title": document.title,
        "category": document.category,
        "audience": document.audience,
        "requiresAcceptance": bool(document.requires_acceptance),
        "versionLabel": version.version_label,
        "effectiveDate": version.effective_date.isoformat() if version.effective_date else None,
    }


@router.get("/documents")
async def list_public_legal_documents(db: Session = Depends(get_db)):
    """Every public/employer document that currently has a published
    version — the data behind the /legal hub. A document with only draft
    versions (never published) is silently omitted, not shown as broken."""
    documents = [
        d for d in legal_service.list_documents(db)
        if d.audience in _PUBLIC_AUDIENCES
    ]
    summaries = [_document_summary(db, d) for d in documents]
    return {"documents": [s for s in summaries if s is not None]}


@router.get("/documents/{slug}")
async def get_public_legal_document(slug: str, db: Session = Depends(get_db)):
    document = legal_service.get_document_by_slug(db, slug)
    if not document or document.audience not in _PUBLIC_AUDIENCES:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Documento não encontrado")

    version = legal_service.get_current_version(db, document.id)
    if not version:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Documento ainda não publicado")

    return {
        "slug": document.slug,
        "title": document.title,
        "category": document.category,
        "audience": document.audience,
        "requiresAcceptance": bool(document.requires_acceptance),
        "versionId": version.id,
        "versionLabel": version.version_label,
        "effectiveDate": version.effective_date.isoformat() if version.effective_date else None,
        "bodyMarkdown": version.body_markdown,
    }


def _relevant_audiences_for_user(user: User) -> tuple[str, ...]:
    """Which document audiences can gate THIS user's portal — a candidate
    is never blocked by an employer-only document changing, and vice
    versa. Internal-audience documents never appear here regardless of
    role; the admin-acknowledgment flow for those is a separate surface."""
    role = user.role.value if hasattr(user.role, "value") else str(user.role)
    if role == "company":
        return ("public", "employer")
    return ("public",)


@router.get("/my-pending-acceptances")
async def my_pending_legal_acceptances(
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    """Every requires_acceptance document (scoped to the caller's role)
    where the CURRENT published version doesn't yet have a recorded
    acceptance from this user — either they never accepted it, or a newer
    version has published since they last did. Portal chrome polls this
    after login to decide whether to show the re-consent gate."""
    audiences = _relevant_audiences_for_user(current_user)
    pending: list[dict[str, Any]] = []
    for document in legal_service.list_documents(db):
        if not document.requires_acceptance or document.audience not in audiences:
            continue
        current = legal_service.get_current_version(db, document.id)
        if not current:
            continue
        if legal_service.has_accepted_current_version(db, user_id=current_user.id, slug=document.slug):
            continue
        pending.append({
            "slug": document.slug,
            "title": document.title,
            "versionId": current.id,
            "versionLabel": current.version_label,
        })
    return {"pendingAcceptances": pending}


@router.get("/my-acceptances")
async def my_legal_acceptances(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Self-service "Os meus documentos" (Wave X2) — every acceptance this
    user has ever recorded, newest first."""
    return {"acceptances": legal_service.list_acceptances_for_user(db, current_user.id)}


@router.post("/acceptances")
async def record_my_legal_acceptance(
    payload: dict[str, Any],
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Self-service acceptance — the re-consent gate (and any other
    authenticated accept-this-document UI) calls this once per document
    the user confirms. context defaults to "reconsent"; callers may pass a
    more specific one (e.g. "cv_ai_consent") via the payload."""
    slug = str(payload.get("slug", "")).strip()
    if not slug:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="slug é obrigatório")
    document = legal_service.get_document_by_slug(db, slug)
    if not document:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Documento não encontrado")
    current = legal_service.get_current_version(db, document.id)
    if not current:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Documento ainda não publicado")

    ip_address = request.client.host if request.client else None
    user_agent = request.headers.get("user-agent")
    context = str(payload.get("context", "")).strip() or "reconsent"
    acceptance = legal_service.record_acceptance(
        db, user_id=current_user.id, document_version_id=current.id,
        context=context, ip_address=ip_address, user_agent=user_agent,
    )
    return {"accepted": True, "slug": slug, "versionId": current.id, "acceptanceId": acceptance.id}
