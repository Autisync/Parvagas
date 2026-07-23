"""Employer plan-tier resolution and active-job quota enforcement.

Mirrors app/services/candidate_billing_service.py's shape (get_*_tier /
assert_*_quota), adapted for two employer-side realities:

- Plan rows carry max_active_jobs directly (no separate admin-editable
  tiers-by-name table like candidate_cv_plans) — so there's no
  _FALLBACK_TIERS-equivalent hardcoded dict here. The one edge case that
  would otherwise need one — the "free" Plan row missing entirely — instead
  reuses app.api.v1.payments._ensure_seed_plans, the same idempotent seeding
  path /plans already relies on, so the free=1/starter=5/business=-1 numbers
  live in exactly one place (payments._DEFAULT_PLANS).
- The shared `subscriptions` table also holds one-time featured_post add-on
  purchases (payments.subscribe() creates a Subscription row for those too).
  Those must be excluded when resolving "the company's plan", or a newer
  add-on purchase could shadow the real recurring plan.

Unlike CANDIDATE_PREMIUM_ENABLED, no feature flag gates this: the limits
enforced here (1/5/unlimited active jobs) are already advertised on the
pricing page and already sold — this closes an existing enforcement gap
rather than staging an unpriced feature, so it ships always-on.
"""
from datetime import datetime

from fastapi import HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models import Company, Job, Plan, Subscription

# Plans that don't represent an ongoing job-count entitlement (one-time
# add-ons). Never treated as "the company's plan" when resolving quota.
_NON_RECURRING_PLAN_CODES = {"featured_post"}

# Matches companies.py::company_analytics's "live" job definition — excludes
# pending_platform_review, rejected, and archived (soft-deleted) jobs.
_ACTIVE_JOB_STATUSES = ("approved", "published", "active")


def _active_subscription(db: Session, company_id: str) -> Subscription | None:
    """Latest active subscription on a real recurring plan (excludes
    one-time add-on purchases like featured_post, which also land as
    Subscription rows via payments.subscribe() but aren't job-count plans)."""
    return (
        db.query(Subscription)
        .join(Plan, Plan.id == Subscription.plan_id)
        .filter(
            Subscription.company_id == company_id,
            Subscription.status == "active",
            ~Plan.code.in_(_NON_RECURRING_PLAN_CODES),
        )
        .order_by(Subscription.current_period_end.desc())
        .first()
    )


def get_company_plan_code(db: Session, company_id: str) -> str:
    """Effective plan code for job-quota purposes: "free" if there's no
    active, unexpired recurring subscription. Mirrors
    candidate_billing_service.get_cv_plan_tier's expired-subscription
    fallback logic exactly."""
    sub = _active_subscription(db, company_id)
    if not sub:
        return "free"
    if sub.current_period_end and sub.current_period_end < datetime.utcnow():
        return "free"
    plan = db.query(Plan).filter(Plan.id == sub.plan_id).first()
    return plan.code if plan else "free"


def get_job_plan_limit(db: Session, plan_code: str) -> int:
    """max_active_jobs for a plan code. Falls back to seeding (then
    re-querying) the default catalogue if the row is missing entirely —
    should never happen outside a fresh/test DB."""
    plan = db.query(Plan).filter(Plan.code == plan_code).first()
    if plan:
        return plan.max_active_jobs
    from app.api.v1.payments import _ensure_seed_plans
    _ensure_seed_plans(db)
    plan = db.query(Plan).filter(Plan.code == plan_code).first()
    return plan.max_active_jobs if plan else 1


def assert_job_quota(db: Session, company: Company) -> None:
    """Enforce the company's plan cap on concurrently-active jobs before a
    new Job row is created.

    Same TOCTOU guard as candidate_billing_service.assert_resume_quota:
    locks the company's own row for the rest of this transaction before
    counting, so two concurrent job-creation requests for the same company
    can't both read the same pre-insert COUNT and both pass. Released when
    the caller's db.commit() (right after this call, in
    companies.create_company_job) ends the transaction. Postgres honors the
    lock; SQLite (tests) ignores FOR UPDATE but its own whole-database write
    lock already serializes writers, so no test behavior changes.
    """
    db.query(Company).filter(Company.id == company.id).with_for_update().first()

    max_active_jobs = get_job_plan_limit(db, get_company_plan_code(db, company.id))
    if max_active_jobs < 0:
        return  # unlimited

    existing = (
        db.query(func.count(Job.id))
        .filter(Job.company_id == company.id, Job.status.in_(_ACTIVE_JOB_STATUSES))
        .scalar()
        or 0
    )
    if existing >= max_active_jobs:
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail=f"O seu plano permite até {max_active_jobs} vaga(s) ativa(s). Faça upgrade para publicar mais.",
        )


def get_candidate_search_included(db: Session, plan_code: str) -> bool:
    """Whether `plan_code` includes candidate-directory search (W5.2) —
    same missing-row self-seed fallback as get_job_plan_limit."""
    plan = db.query(Plan).filter(Plan.code == plan_code).first()
    if plan:
        return bool(plan.candidate_search_included)
    from app.api.v1.payments import _ensure_seed_plans
    _ensure_seed_plans(db)
    plan = db.query(Plan).filter(Plan.code == plan_code).first()
    return bool(plan.candidate_search_included) if plan else False


def assert_candidate_search_access(db: Session, company: Company) -> None:
    """Gate the candidate-directory search/view endpoints behind a plan
    that includes it (currently Business). Read-only feature — no
    countable resource to race on, so unlike assert_job_quota this doesn't
    need a row lock."""
    if not get_candidate_search_included(db, get_company_plan_code(db, company.id)):
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail="O acesso ao diretório de candidatos exige o plano Business. Faça upgrade para pesquisar candidatos.",
        )
