"""Public read-only access to published legal documents — the /legal hub
and the individual document pages. Internal-audience documents (security
policy, admin access policy, dispute template/workflow) are deliberately
excluded from every response here; they're only reachable through the
admin API (app.api.v1.admin's legal-document endpoints).
"""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.db.session import get_db
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
