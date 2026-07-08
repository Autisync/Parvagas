"""Candidate premium-tier entitlement (Phase 4, TEST_PLAN_CAREER_OPS.md).

No pricing has been decided yet — see TEST_PLAN_CAREER_OPS.md Phase 4. This
module exists so the *mechanism* is ready ahead of that decision: while
CANDIDATE_PREMIUM_ENABLED is off (the default), every candidate is treated
as entitled, so premium AI tools ship as a free feature today. Flipping the
flag on later starts enforcing CandidateSubscription without needing a code
change or another migration.
"""
from datetime import datetime

from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models import CandidateSubscription

settings = get_settings()


def candidate_has_premium_access(db: Session, candidate_user_id: str) -> bool:
    """Whether this candidate can use premium AI tools right now.

    Ship-free while the flag is off: always True. Once enabled, requires an
    active, unexpired CandidateSubscription row.
    """
    if not settings.CANDIDATE_PREMIUM_ENABLED:
        return True

    sub = (
        db.query(CandidateSubscription)
        .filter(CandidateSubscription.candidate_user_id == candidate_user_id, CandidateSubscription.status == "active")
        .order_by(CandidateSubscription.current_period_end.desc())
        .first()
    )
    if not sub:
        return False
    if sub.current_period_end and sub.current_period_end < datetime.utcnow():
        return False
    return True
