"""Versioned, admin-editable subscription plans — mirrors legal_service.py's
LegalDocument/LegalDocumentVersion shape exactly. `Plan` stays the "what's
for sale right now" identity + display source (its own name/price/
currency/interval/features/max_active_jobs/candidate_search_included/
api_access_included columns are kept in sync with the latest *published*
PlanVersion by publish_plan_version, so every existing display-only
reader of Plan needs zero changes). `PlanVersion` is the immutable
snapshot a Subscription pins to (Subscription.plan_version_id) — the
grandfathering mechanism lives in company_billing_service.py and
payments.py's _activate(), not here; this module only manages the
version lifecycle itself.

Publishing invariant: at most one version per plan has status
"published" at a time — publish_plan_version() archives whichever
version was previously current in the same transaction that promotes
the new one.
"""
from __future__ import annotations

from datetime import datetime
from typing import Any, TYPE_CHECKING

from sqlalchemy.orm import Session

if TYPE_CHECKING:
    from app.models import Plan, PlanVersion


def get_current_version(db: Session, plan_id: str) -> "PlanVersion | None":
    """The single published version of a plan, if any."""
    from app.models import PlanVersion

    return (
        db.query(PlanVersion)
        .filter(PlanVersion.plan_id == plan_id, PlanVersion.status == "published")
        .order_by(PlanVersion.published_at.desc())
        .first()
    )


def get_current_version_by_code(db: Session, code: str) -> "PlanVersion | None":
    from app.models import Plan

    plan = db.query(Plan).filter(Plan.code == code).first()
    if not plan:
        return None
    return get_current_version(db, plan.id)


def get_draft_version(db: Session, plan_id: str) -> "PlanVersion | None":
    from app.models import PlanVersion

    return (
        db.query(PlanVersion)
        .filter(PlanVersion.plan_id == plan_id, PlanVersion.status == "draft")
        .order_by(PlanVersion.created_at.desc())
        .first()
    )


def list_versions(db: Session, plan_id: str) -> list["PlanVersion"]:
    from app.models import PlanVersion

    return (
        db.query(PlanVersion)
        .filter(PlanVersion.plan_id == plan_id)
        .order_by(PlanVersion.created_at.desc())
        .all()
    )


def get_version(db: Session, version_id: str) -> "PlanVersion | None":
    from app.models import PlanVersion

    return db.query(PlanVersion).filter(PlanVersion.id == version_id).first()


def create_draft_version(db: Session, *, plan_id: str, **fields: Any) -> "PlanVersion":
    """Upsert semantics — if a draft already exists for this plan, update
    it in place rather than accumulating multiple drafts (matches the
    legal-document admin editor's own save-draft behavior)."""
    from app.models import PlanVersion

    existing = get_draft_version(db, plan_id)
    if existing:
        for key, value in fields.items():
            setattr(existing, key, value)
        db.commit()
        db.refresh(existing)
        return existing

    current = get_current_version(db, plan_id)
    base: dict[str, Any] = {}
    if current:
        base = {
            "name": current.name, "price": current.price, "currency": current.currency,
            "interval": current.interval, "features": current.features,
            "max_active_jobs": current.max_active_jobs,
            "candidate_search_included": current.candidate_search_included,
            "api_access_included": current.api_access_included,
            "promo_price": current.promo_price, "promo_label": current.promo_label,
            "promo_expires_at": current.promo_expires_at,
        }
    base.update(fields)
    version_count = db.query(PlanVersion).filter(PlanVersion.plan_id == plan_id).count()
    version = PlanVersion(plan_id=plan_id, version_label=f"v{version_count + 1}", status="draft", **base)
    db.add(version)
    db.commit()
    db.refresh(version)
    return version


def publish_plan_version(
    db: Session, version: "PlanVersion", *, published_by_user_id: str | None = None
) -> "PlanVersion":
    """Promote `version` to the plan's current published version,
    archiving whichever version held that spot before, and syncing
    Plan's own mirrored columns from the newly published version — the
    step that keeps every existing display-only reader of Plan correct
    without touching those call sites."""
    from app.models import Plan, PlanVersion

    now = datetime.utcnow()
    previous = (
        db.query(PlanVersion)
        .filter(
            PlanVersion.plan_id == version.plan_id,
            PlanVersion.status == "published",
            PlanVersion.id != version.id,
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

    plan = db.query(Plan).filter(Plan.id == version.plan_id).first()
    if plan:
        plan.name = version.name
        plan.price = version.price
        plan.currency = version.currency
        plan.interval = version.interval
        plan.features = version.features
        plan.max_active_jobs = version.max_active_jobs
        plan.candidate_search_included = version.candidate_search_included
        plan.api_access_included = version.api_access_included
        plan.promo_price = version.promo_price
        plan.promo_label = version.promo_label
        plan.promo_expires_at = version.promo_expires_at

    db.commit()
    db.refresh(version)
    return version
