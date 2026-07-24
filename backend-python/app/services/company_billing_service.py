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

from app.models import Company, Job, Plan, PlanVersion, Subscription
from app.services import plan_service

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


def _version_from_plan(plan: Plan) -> PlanVersion:
    """Synthesize an unpersisted PlanVersion-shaped view of a Plan's own
    columns — the fallback for a Plan that has no PlanVersion snapshot
    yet (e.g. a row constructed directly rather than through
    plan_service, as every pre-versioning test fixture does). Gate
    resolution degrades to "whatever the Plan row currently says"
    instead of hard-failing."""
    return PlanVersion(
        plan_id=plan.id, version_label="live", name=plan.name, price=plan.price,
        currency=plan.currency, interval=plan.interval, features=plan.features,
        max_active_jobs=plan.max_active_jobs,
        candidate_search_included=plan.candidate_search_included,
        api_access_included=plan.api_access_included,
        promo_price=plan.promo_price, promo_label=plan.promo_label,
        promo_expires_at=plan.promo_expires_at, status="published",
    )


def get_active_plan_version(db: Session, company_id: str) -> PlanVersion:
    """The PlanVersion a company is actually entitled to right now — the
    pinned snapshot on its active subscription (grandfathered until the
    company's next renewal, per payments.py's _activate()), or the live
    "free" version if there's no active/unexpired subscription. Every
    entitlement gate below resolves against this, never against Plan's
    own (display-only) columns directly."""
    sub = _active_subscription(db, company_id)
    if sub and not (sub.current_period_end and sub.current_period_end < datetime.utcnow()):
        plan = db.query(Plan).filter(Plan.id == sub.plan_id).first()
        if sub.plan_version_id:
            version = db.query(PlanVersion).filter(PlanVersion.id == sub.plan_version_id).first()
            if version:
                return version
        # Defensive fallback for a subscription with no pin yet (shouldn't
        # happen after the backfill migration, but a mid-flight pending
        # subscription created before this shipped could lack one).
        if plan:
            version = plan_service.get_current_version(db, plan.id)
            if version:
                return version
            return _version_from_plan(plan)

    free_version = plan_service.get_current_version_by_code(db, "free")
    if free_version:
        return free_version
    free_plan = db.query(Plan).filter(Plan.code == "free").first()
    if free_plan:
        return _version_from_plan(free_plan)

    from app.api.v1.payments import _ensure_seed_plans
    _ensure_seed_plans(db)
    free_version = plan_service.get_current_version_by_code(db, "free")
    if free_version:
        return free_version
    # Genuinely nothing resolvable (no "free" Plan exists anywhere, e.g. a
    # test DB that only ever created a paid plan) — default to the most
    # restrictive/no-entitlements shape rather than a hard 500, matching
    # this function's job as an entitlement gate: "not included" is always
    # a safe answer, an unhandled crash is not.
    return PlanVersion(
        plan_id=None, version_label="none", name="Free", price=0, currency="AOA", interval="month",
        features=None, max_active_jobs=1, candidate_search_included=False, api_access_included=False,
        promo_price=None, promo_label=None, promo_expires_at=None, status="published",
    )


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

    max_active_jobs = get_active_plan_version(db, company.id).max_active_jobs
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


def assert_candidate_search_access(db: Session, company: Company) -> None:
    """Gate the candidate-directory search/view endpoints behind a plan
    that includes it (currently Business). Read-only feature — no
    countable resource to race on, so unlike assert_job_quota this doesn't
    need a row lock."""
    if not get_active_plan_version(db, company.id).candidate_search_included:
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail="O acesso ao diretório de candidatos exige o plano Business. Faça upgrade para pesquisar candidatos.",
        )


def assert_api_access(db: Session, company: Company) -> None:
    """Gate API-key creation AND every API-key-authenticated request
    behind a plan that includes it (currently Business) — checked on
    every call, not just at key-creation time, so a plan downgrade blocks
    existing keys immediately rather than leaving them valid."""
    if not get_active_plan_version(db, company.id).api_access_included:
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail="O acesso à API da empresa exige o plano Business. Faça upgrade para gerar chaves API.",
        )
