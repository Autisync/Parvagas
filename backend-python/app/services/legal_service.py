"""Versioned legal-document CMS — documents (ToS, Privacy Policy, DPA, ...)
are edited/published as immutable LegalDocumentVersion rows instead of
hardcoded pages, so admins can revise content without a redeploy and a
recorded LegalAcceptance always points at content that can never silently
change under it.

Publishing invariant: at most one version per document has status
"published" at a time. publish_legal_version() enforces this by archiving
whichever version was previously current in the same transaction that
promotes the new one — never two "current" versions visible at once, and
never a gap where a document briefly has zero published versions.
"""
from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy.orm import Session

if TYPE_CHECKING:
    from app.models import LegalAcceptance, LegalDocument, LegalDocumentVersion


def list_documents(
    db: Session, *, audience: str | None = None, category: str | None = None
) -> list["LegalDocument"]:
    from app.models import LegalDocument

    query = db.query(LegalDocument)
    if audience:
        query = query.filter(LegalDocument.audience == audience)
    if category:
        query = query.filter(LegalDocument.category == category)
    return query.order_by(LegalDocument.title).all()


def get_document(db: Session, document_id: str) -> "LegalDocument | None":
    from app.models import LegalDocument

    return db.query(LegalDocument).filter(LegalDocument.id == document_id).first()


def get_document_by_slug(db: Session, slug: str) -> "LegalDocument | None":
    from app.models import LegalDocument

    return db.query(LegalDocument).filter(LegalDocument.slug == slug).first()


def get_current_version(db: Session, document_id: str) -> "LegalDocumentVersion | None":
    """The single published version of a document, if any. A document with
    only draft/archived versions (never published, or mid-edit) has none —
    callers rendering a public page must treat that as "not available yet",
    not fall back to a draft."""
    from app.models import LegalDocumentVersion

    return (
        db.query(LegalDocumentVersion)
        .filter(LegalDocumentVersion.document_id == document_id, LegalDocumentVersion.status == "published")
        .order_by(LegalDocumentVersion.published_at.desc())
        .first()
    )


def get_current_version_by_slug(db: Session, slug: str) -> "LegalDocumentVersion | None":
    document = get_document_by_slug(db, slug)
    if not document:
        return None
    return get_current_version(db, document.id)


def list_versions(db: Session, document_id: str) -> list["LegalDocumentVersion"]:
    from app.models import LegalDocumentVersion

    return (
        db.query(LegalDocumentVersion)
        .filter(LegalDocumentVersion.document_id == document_id)
        .order_by(LegalDocumentVersion.created_at.desc())
        .all()
    )


def get_version(db: Session, version_id: str) -> "LegalDocumentVersion | None":
    from app.models import LegalDocumentVersion

    return db.query(LegalDocumentVersion).filter(LegalDocumentVersion.id == version_id).first()


def create_document(
    db: Session,
    *,
    slug: str,
    title: str,
    category: str,
    audience: str = "public",
    requires_acceptance: bool = False,
) -> "LegalDocument":
    from app.models import LegalDocument

    document = LegalDocument(
        slug=slug, title=title, category=category, audience=audience,
        requires_acceptance=requires_acceptance,
    )
    db.add(document)
    db.commit()
    db.refresh(document)
    return document


def create_draft_version(
    db: Session,
    *,
    document_id: str,
    version_label: str,
    body_markdown: str,
    effective_date: datetime | None = None,
) -> "LegalDocumentVersion":
    from app.models import LegalDocumentVersion

    version = LegalDocumentVersion(
        document_id=document_id, version_label=version_label,
        body_markdown=body_markdown, effective_date=effective_date, status="draft",
    )
    db.add(version)
    db.commit()
    db.refresh(version)
    return version


def update_draft_version(
    db: Session,
    version: "LegalDocumentVersion",
    *,
    version_label: str | None = None,
    body_markdown: str | None = None,
    effective_date: datetime | None = None,
) -> "LegalDocumentVersion":
    """Edit a version's content — only ever safe while it's still a draft.
    A published (or archived) version is immutable by convention: any
    LegalAcceptance recorded against it must keep meaning exactly what it
    meant when the user accepted it."""
    if version.status != "draft":
        raise ValueError("Only draft versions can be edited — publish a new version instead")
    if version_label is not None:
        version.version_label = version_label
    if body_markdown is not None:
        version.body_markdown = body_markdown
    if effective_date is not None:
        version.effective_date = effective_date
    db.commit()
    db.refresh(version)
    return version


def publish_legal_version(
    db: Session, version: "LegalDocumentVersion", *, published_by_user_id: str | None = None
) -> "LegalDocumentVersion":
    """Promote `version` to the document's current published version,
    archiving whichever version held that spot before. Runs as one
    transaction — either both the archive and the promote land, or
    neither does, so a document is never left with zero or two published
    versions."""
    from app.models import LegalDocumentVersion

    now = datetime.utcnow()
    previous = (
        db.query(LegalDocumentVersion)
        .filter(
            LegalDocumentVersion.document_id == version.document_id,
            LegalDocumentVersion.status == "published",
            LegalDocumentVersion.id != version.id,
        )
        .all()
    )
    for old in previous:
        old.status = "archived"

    version.status = "published"
    version.published_at = now
    version.published_by_user_id = published_by_user_id
    if version.effective_date is None:
        version.effective_date = now

    db.commit()
    db.refresh(version)
    return version


def record_acceptance(
    db: Session,
    *,
    user_id: str,
    document_version_id: str,
    context: str | None = None,
    ip_address: str | None = None,
    user_agent: str | None = None,
) -> "LegalAcceptance":
    from app.models import LegalAcceptance

    acceptance = LegalAcceptance(
        user_id=user_id, document_version_id=document_version_id,
        context=context, ip_address=ip_address, user_agent=(user_agent or "")[:400] or None,
    )
    db.add(acceptance)
    db.commit()
    db.refresh(acceptance)
    return acceptance


def has_accepted_current_version(db: Session, *, user_id: str, slug: str) -> bool:
    """True if `user_id` has an acceptance row for the document's CURRENT
    published version specifically — accepting an older version doesn't
    count once the document has moved on. Used to gate re-consent prompts
    (Wave C2)."""
    from app.models import LegalAcceptance

    current = get_current_version_by_slug(db, slug)
    if not current:
        return True  # no published version to accept yet — nothing to block on
    return (
        db.query(LegalAcceptance)
        .filter(LegalAcceptance.user_id == user_id, LegalAcceptance.document_version_id == current.id)
        .first()
        is not None
    )
