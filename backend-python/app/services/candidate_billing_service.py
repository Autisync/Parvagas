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
truth — app.api.v1.payments imports CV_BUILDER_PLANS for its pricing
endpoints rather than redefining it) and the quota/feature checks that gate
resume/cover-letter CRUD in app.api.v1.resumes. Those checks share the same
CANDIDATE_PREMIUM_ENABLED switch: while it's off, the plan catalogue is
advertised on the pricing page but nothing is actually enforced — turning
the flag on is what makes both the premium AI tools *and* these CV Builder
quotas real at once.
"""
from datetime import datetime

from fastapi import HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models import CandidateCVSubscription, Resume

settings = get_settings()

# Three tiers (AOA pricing for Angola market):
#   free     – 1 resume, basic templates, no AI
#   pro      – 3 resumes, all templates, AI score, PDF export  (15 000 AOA/month)
#   premium  – Unlimited resumes, AI rewrite, cover letters,   (30 000 AOA/month)
#              auto-apply queue, priority support
CV_BUILDER_PLANS = [
    {
        "tier": "free", "name": "CV Grátis", "price": 0, "interval": "month",
        "features": ["1 CV", "Modelos básicos", "Download PDF"],
        "limits": {"max_resumes": 1, "ai_score": False, "ai_rewrite": False,
                   "cover_letters": False, "auto_apply": False},
    },
    {
        "tier": "pro", "name": "CV Pro", "price": 15000, "interval": "month",
        "features": ["3 CVs", "Todos os modelos", "Pontuação ATS por IA",
                     "Export PDF e DOCX", "Carta de apresentação"],
        "limits": {"max_resumes": 3, "ai_score": True, "ai_rewrite": False,
                   "cover_letters": True, "auto_apply": False},
    },
    {
        "tier": "premium", "name": "CV Premium", "price": 30000, "interval": "month",
        "features": ["CVs ilimitados", "IA rewrite completo", "Fila auto-candidatura",
                     "Suporte prioritário", "Todas as funcionalidades Pro"],
        "limits": {"max_resumes": -1, "ai_score": True, "ai_rewrite": True,
                   "cover_letters": True, "auto_apply": True},
    },
]
CV_BUILDER_PLAN_LIMITS = {plan["tier"]: plan["limits"] for plan in CV_BUILDER_PLANS}


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
    return sub.plan_tier if sub.plan_tier in CV_BUILDER_PLAN_LIMITS else "free"


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
    No-op while CANDIDATE_PREMIUM_ENABLED is off — see module docstring."""
    if not settings.CANDIDATE_PREMIUM_ENABLED:
        return

    max_resumes = CV_BUILDER_PLAN_LIMITS[get_cv_plan_tier(db, candidate_profile_id)]["max_resumes"]
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

    if not CV_BUILDER_PLAN_LIMITS[get_cv_plan_tier(db, candidate_profile_id)]["cover_letters"]:
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail="Cartas de apresentação exigem o plano Pro ou Premium.",
        )


def assert_auto_apply_allowed(db: Session, candidate_profile_id: str) -> None:
    """Auto-apply is a premium-only feature — no-op while
    CANDIDATE_PREMIUM_ENABLED is off."""
    if not settings.CANDIDATE_PREMIUM_ENABLED:
        return

    if not CV_BUILDER_PLAN_LIMITS[get_cv_plan_tier(db, candidate_profile_id)]["auto_apply"]:
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail="A auto-candidatura exige o plano Premium.",
        )
