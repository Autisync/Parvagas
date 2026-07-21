"""Renewal lifecycle for both subscription surfaces — reminders (existing,
see app.workers.tasks.dispatch_subscription_expiry_reminders), grace period,
and the manual-payment-rail equivalent of dunning (Wave P4,
EXECUTION_PLAN_LEGAL_AND_PAYMENTS.md).

There is no auto-charge on this platform (local rails: Multicaixa Express,
Unitel Money, bank transfer — all manually confirmed by an admin), so there
is no failed-payment event to retry against. What this module does instead:
a subscription whose current_period_end has passed without renewal enters a
GRACE_PERIOD_DAYS window (access untouched, one reminder email) and is then
flipped to "expired" — which live access checks elsewhere (e.g.
candidate_billing_service.get_cv_plan_tier) already treat as no-access.

A subscription with cancel_requested_at set (Wave P2 self-service
cancellation) skips grace/dunning entirely — the user already chose not to
renew, so it's finalized straight to "cancelled" the moment its period
ends.
"""
from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any

from sqlalchemy.orm import Session

from app.models import CandidateCVSubscription, CandidateProfile, Company, Plan, Subscription, User
from app.services.candidate_billing_service import get_cv_builder_plans

GRACE_PERIOD_DAYS = 3


def _process_company_subscriptions(db: Session, *, now: datetime, grace_cutoff: datetime) -> dict[str, int]:
    stats = {"expired": 0, "cancelled": 0, "grace_notified": 0}
    lapsed = (
        db.query(Subscription)
        .filter(Subscription.status == "active", Subscription.current_period_end.isnot(None), Subscription.current_period_end < now)
        .all()
    )
    for sub in lapsed:
        company = db.query(Company).filter(Company.id == sub.company_id).first()
        owner = db.query(User).filter(User.id == company.owner_user_id).first() if company and company.owner_user_id else None
        plan = db.query(Plan).filter(Plan.id == sub.plan_id).first()

        if sub.cancel_requested_at:
            sub.status = "cancelled"
            stats["cancelled"] += 1
            continue

        if sub.current_period_end < grace_cutoff:
            sub.status = "expired"
            stats["expired"] += 1
            if owner and owner.email:
                from app.workers.tasks import send_templated_email
                send_templated_email.delay("send_subscription_expired_email", {
                    "email": owner.email, "party_name": company.name if company else "",
                    "plan_name": plan.name if plan else "", "portal_path": "/Portal/Empresa/Planos",
                })
        elif not sub.grace_notified_at:
            sub.grace_notified_at = now
            stats["grace_notified"] += 1
            days_left = max(0, GRACE_PERIOD_DAYS - (now - sub.current_period_end).days)
            if owner and owner.email:
                from app.workers.tasks import send_templated_email
                send_templated_email.delay("send_subscription_lapsed_grace_email", {
                    "email": owner.email, "party_name": company.name if company else "",
                    "plan_name": plan.name if plan else "", "grace_days_left": days_left,
                    "portal_path": "/Portal/Empresa/Planos",
                })
    return stats


def _process_candidate_subscriptions(db: Session, *, now: datetime, grace_cutoff: datetime) -> dict[str, int]:
    stats = {"expired": 0, "cancelled": 0, "grace_notified": 0}
    lapsed = (
        db.query(CandidateCVSubscription)
        .filter(
            CandidateCVSubscription.status == "active",
            CandidateCVSubscription.plan_tier != "free",
            CandidateCVSubscription.current_period_end.isnot(None),
            CandidateCVSubscription.current_period_end < now,
        )
        .all()
    )
    plans_by_tier = {p["tier"]: p for p in get_cv_builder_plans(db)}
    for sub in lapsed:
        profile = db.query(CandidateProfile).filter(CandidateProfile.id == sub.candidate_profile_id).first()
        user = db.query(User).filter(User.id == profile.user_id).first() if profile else None
        plan_name = plans_by_tier.get(sub.plan_tier, {}).get("name", sub.plan_tier)

        if sub.cancel_requested_at:
            sub.status = "cancelled"
            stats["cancelled"] += 1
            continue

        if sub.current_period_end < grace_cutoff:
            sub.status = "expired"
            stats["expired"] += 1
            if user and user.email:
                from app.workers.tasks import send_templated_email
                send_templated_email.delay("send_subscription_expired_email", {
                    "email": user.email, "party_name": user.full_name or "",
                    "plan_name": plan_name, "portal_path": "/Portal/Candidato/CV-e-Documentos",
                })
        elif not sub.grace_notified_at:
            sub.grace_notified_at = now
            stats["grace_notified"] += 1
            days_left = max(0, GRACE_PERIOD_DAYS - (now - sub.current_period_end).days)
            if user and user.email:
                from app.workers.tasks import send_templated_email
                send_templated_email.delay("send_subscription_lapsed_grace_email", {
                    "email": user.email, "party_name": user.full_name or "",
                    "plan_name": plan_name, "grace_days_left": days_left,
                    "portal_path": "/Portal/Candidato/CV-e-Documentos",
                })
    return stats


def process_lapsed_subscriptions(db: Session) -> dict[str, Any]:
    now = datetime.utcnow()
    grace_cutoff = now - timedelta(days=GRACE_PERIOD_DAYS)
    company_stats = _process_company_subscriptions(db, now=now, grace_cutoff=grace_cutoff)
    candidate_stats = _process_candidate_subscriptions(db, now=now, grace_cutoff=grace_cutoff)
    db.commit()
    return {"company": company_stats, "candidate": candidate_stats}
