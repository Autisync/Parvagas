"""Candidate premium-tier entitlement (Phase 4, TEST_PLAN_CAREER_OPS.md).

C4 (EXECUTION_PLAN_NATIVE_CV_BUILDER.md): consolidated onto the single real
billing table, `CandidateCVSubscription` (candidate_profile_id, plan_tier
free|pro|premium, status, current_period_end — already backed by a real
payments flow in app/api/v1/payments.py). The old `CandidateSubscription`
table this module used to read existed only for this one entitlement check,
was never wired to any payment flow, and duplicated a table that already
does the job — removed in this same change (see the migration dropping it).

No pricing has been decided for the *premium AI tools* specifically — this
module exists so the mechanism is ready ahead of that decision: while
CANDIDATE_PREMIUM_ENABLED is off (the default), every candidate is treated
as entitled, so premium AI tools ship as a free feature today. Flipping the
flag on later starts enforcing subscription tier without another migration.

This module also owns the CV Builder plan catalogue (single source of
truth — app.api.v1.payments calls get_cv_builder_plans() for its pricing
endpoints rather than redefining it) and the quota/feature checks that gate
resume/cover-letter CRUD in app.api.v1.resumes. Those checks share the same
CANDIDATE_PREMIUM_ENABLED switch: while it's off, the plan catalogue is
advertised on the pricing page but nothing is actually enforced — turning
the flag on is what makes both the premium AI tools *and* these CV Builder
quotas real at once.

The catalogue itself lives in the admin-editable `candidate_cv_plans` table
(see /admin/candidate-cv-plans) rather than as a hardcoded constant, so
prices/features/limits can change without a deploy. `_FALLBACK_TIERS` below
is only a defensive fallback for the (should-never-happen) case where the
table is empty — e.g. a fresh test DB that skips the seed migration.
"""
import json
from datetime import datetime

from fastapi import HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models import CandidateCVSubscription, CandidateCvPlan, CandidateProfile, Resume

settings = get_settings()

# Fixed tier identity — content (price/name/features/limits) is admin-editable,
# but which tiers exist is not (matches the fixed candidate_cv_plans.tier
# values seeded by the migration and the fixed CandidateCVSubscription.plan_tier
# values used elsewhere).
KNOWN_CV_TIERS = ("free", "pro", "premium")

# AOA pricing for Angola market — used only if candidate_cv_plans is empty.
_FALLBACK_TIERS = {
    "free": {
        "name": "CV Grátis", "price": 0, "interval": "month",
        "features": ["1 CV", "Modelos básicos", "Download PDF"],
        "limits": {"max_resumes": 1, "ai_score": False, "ai_rewrite": False,
                   "cover_letters": False, "auto_apply": False},
    },
    "pro": {
        "name": "CV Pro", "price": 15000, "interval": "month",
        "features": ["3 CVs", "Todos os modelos", "Pontuação ATS por IA",
                     "Export PDF e DOCX", "Carta de apresentação"],
        "limits": {"max_resumes": 3, "ai_score": True, "ai_rewrite": False,
                   "cover_letters": True, "auto_apply": False},
    },
    "premium": {
        "name": "CV Premium", "price": 30000, "interval": "month",
        "features": ["CVs ilimitados", "IA rewrite completo", "Fila auto-candidatura",
                     "Suporte prioritário", "Todas as funcionalidades Pro"],
        "limits": {"max_resumes": -1, "ai_score": True, "ai_rewrite": True,
                   "cover_letters": True, "auto_apply": True},
    },
}


def _row_to_plan_dict(row: CandidateCvPlan) -> dict:
    return {
        "tier": row.tier, "name": row.name, "price": row.price, "interval": row.interval,
        "features": json.loads(row.features) if row.features else [],
        "limits": {
            "max_resumes": row.max_resumes, "ai_score": row.ai_score, "ai_rewrite": row.ai_rewrite,
            "cover_letters": row.cover_letters, "auto_apply": row.auto_apply,
        },
    }


def _fallback_plan_dict(tier: str) -> dict:
    data = _FALLBACK_TIERS.get(tier, _FALLBACK_TIERS["free"])
    return {"tier": tier, "name": data["name"], "price": data["price"], "interval": data["interval"],
            "features": data["features"], "limits": data["limits"]}


def get_cv_builder_plans(db: Session) -> list[dict]:
    """Admin-editable CV Builder plan catalogue, ordered cheapest-first.
    Falls back to the built-in tier definitions if candidate_cv_plans is
    empty (defensive — the seed migration should always populate it)."""
    rows = db.query(CandidateCvPlan).filter(CandidateCvPlan.active.is_(True)).order_by(CandidateCvPlan.price.asc()).all()
    if rows:
        return [_row_to_plan_dict(r) for r in rows]
    return [_fallback_plan_dict(t) for t in KNOWN_CV_TIERS]


def get_cv_plan_limits(db: Session, tier: str) -> dict:
    """A single tier's quota/feature limits — the DB-backed replacement for
    the old CV_BUILDER_PLAN_LIMITS[tier] dict lookup."""
    row = db.query(CandidateCvPlan).filter(CandidateCvPlan.tier == tier).first()
    if row:
        return _row_to_plan_dict(row)["limits"]
    return _fallback_plan_dict(tier)["limits"]


def _active_cv_subscription(db: Session, candidate_profile_id: str) -> CandidateCVSubscription | None:
    return (
        db.query(CandidateCVSubscription)
        .filter(
            CandidateCVSubscription.candidate_profile_id == candidate_profile_id,
            CandidateCVSubscription.status == "active",
        )
        .order_by(CandidateCVSubscription.current_period_end.desc())
        .first()
    )


def get_cv_plan_tier(db: Session, candidate_profile_id: str) -> str:
    """Effective CV Builder tier: "free" if there's no active, unexpired
    subscription row. One query, reused by every check below instead of
    each call site re-querying CandidateCVSubscription itself."""
    sub = _active_cv_subscription(db, candidate_profile_id)
    if not sub:
        return "free"
    if sub.current_period_end and sub.current_period_end < datetime.utcnow():
        return "free"
    return sub.plan_tier if sub.plan_tier in KNOWN_CV_TIERS else "free"


def cv_uses_free_ai_tier(db: Session, candidate_profile_id: str) -> bool:
    """True when this candidate should get Ollama (free tier) instead of
    cloud AI for resume score/rewrite — resumes.py's score_resume and
    rewrite_resume both need exactly this, previously duplicated inline."""
    return get_cv_plan_tier(db, candidate_profile_id) == "free"


def candidate_has_premium_access(db: Session, candidate_profile_id: str) -> bool:
    """Whether this candidate can use premium AI tools right now.

    Ship-free while the flag is off: always True. Once enabled, requires an
    active, unexpired CandidateCVSubscription row on a paid tier (pro or
    premium — "free" is a real row for CV-builder-tier gating, not an
    entitlement to these separate premium tools).
    """
    if not settings.CANDIDATE_PREMIUM_ENABLED:
        return True
    return get_cv_plan_tier(db, candidate_profile_id) != "free"


def assert_resume_quota(db: Session, candidate_profile_id: str) -> None:
    """Enforce the tier's max_resumes cap before a new Resume row is
    created (create/duplicate/restore-as-copy all funnel through here).
    No-op while CANDIDATE_PREMIUM_ENABLED is off — see module docstring.

    The count-then-insert here isn't atomic on its own: two concurrent
    requests for the same candidate could both read the same pre-insert
    COUNT and both pass, landing one resume over the cap (TOCTOU). Locking
    the candidate's own profile row for the rest of this transaction
    serializes concurrent calls for that ONE candidate — unrelated
    candidates are untouched, so this doesn't cost real throughput — and
    the lock is released automatically when the caller's db.commit()/
    rollback() ends the transaction (the resume INSERT+COMMIT that follows
    this call, in every one of its three call sites, happens on the same
    `db` session). Postgres honors this; SQLite (used in tests) silently
    ignores FOR UPDATE, which is fine — SQLite's own whole-database write
    lock already serializes writers, so no test behavior changes.
    """
    if not settings.CANDIDATE_PREMIUM_ENABLED:
        return

    db.query(CandidateProfile).filter(CandidateProfile.id == candidate_profile_id).with_for_update().first()

    max_resumes = get_cv_plan_limits(db, get_cv_plan_tier(db, candidate_profile_id))["max_resumes"]
    if max_resumes < 0:
        return  # unlimited (premium)

    existing = (
        db.query(func.count(Resume.id))
        .filter(Resume.candidate_profile_id == candidate_profile_id)
        .scalar()
        or 0
    )
    if existing >= max_resumes:
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail=f"O seu plano permite até {max_resumes} CV(s). Faça upgrade para criar mais.",
        )


def assert_cover_letters_allowed(db: Session, candidate_profile_id: str) -> None:
    """Cover letters are a pro/premium feature — no-op while
    CANDIDATE_PREMIUM_ENABLED is off."""
    if not settings.CANDIDATE_PREMIUM_ENABLED:
        return

    if not get_cv_plan_limits(db, get_cv_plan_tier(db, candidate_profile_id))["cover_letters"]:
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail="Cartas de apresentação exigem o plano Pro ou Premium.",
        )


def assert_auto_apply_allowed(db: Session, candidate_profile_id: str) -> None:
    """Auto-apply is a premium-only feature — no-op while
    CANDIDATE_PREMIUM_ENABLED is off."""
    if not settings.CANDIDATE_PREMIUM_ENABLED:
        return

    if not get_cv_plan_limits(db, get_cv_plan_tier(db, candidate_profile_id))["auto_apply"]:
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail="A auto-candidatura exige o plano Premium.",
        )
