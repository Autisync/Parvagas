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
"""
from datetime import datetime

from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models import CandidateCVSubscription

settings = get_settings()


def candidate_has_premium_access(db: Session, candidate_profile_id: str) -> bool:
    """Whether this candidate can use premium AI tools right now.

    Ship-free while the flag is off: always True. Once enabled, requires an
    active, unexpired CandidateCVSubscription row on a paid tier (pro or
    premium — "free" is a real row for CV-builder-tier gating, not an
    entitlement to these separate premium tools).
    """
    if not settings.CANDIDATE_PREMIUM_ENABLED:
        return True

    sub = (
        db.query(CandidateCVSubscription)
        .filter(CandidateCVSubscription.candidate_profile_id == candidate_profile_id, CandidateCVSubscription.status == "active")
        .order_by(CandidateCVSubscription.current_period_end.desc())
        .first()
    )
    if not sub or sub.plan_tier == "free":
        return False
    if sub.current_period_end and sub.current_period_end < datetime.utcnow():
        return False
    return True
