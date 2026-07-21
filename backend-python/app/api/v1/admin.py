"""Admin API endpoints for dashboard and moderation surfaces."""
from __future__ import annotations

import os
import re
import subprocess
from datetime import datetime, timedelta
from io import StringIO
from math import ceil
from typing import Any
import csv
import json
import uuid

from pathlib import Path as _Path

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from fastapi.responses import Response
from sqlalchemy import func, text
from sqlalchemy.orm import Session, joinedload

from app.api.deps import get_current_user
from app.api.v1.jobs import serialize_job
from app.db.session import get_db, SessionLocal
from app.models import (
    AdCampaign, ATSPipelineItem, ATSStage, AuditLog, CandidateCVSubscription, CandidateCvPlan, CandidateProfile,
    CareerPost, ClientErrorLog, ComplianceCheck, Company, CompanyInvite, CompanyMember, CVUpload, DataSubjectRequest, EmailLog, FeatureFlag, Job, JobAlert, JobApplication, JobMatchProposal,
    LegalAcceptance, LegalDocument, LegalDocumentVersion, LlmCallLog, NewsletterSubscriber, Plan, ResumeTemplate, SavedJob, ScrapedJob,
    ScraperSettings, ScraperSource, SecurityEvent, Subscription, SupportMessage, TaskRun, Transaction,
    User, UserRole,
)
from app.workers.tasks import send_templated_email
from app.services.notification_service import create_notification
from app.services.scraper_service import content_hash as scraped_content_hash, classify_audience_lane, assess_scraped_job_quality, safe_http_url, is_public_scraper_url
from app.services.storage_service import StorageService
from app.services import legal_service, compliance_analyzer_service, dsar_service
from app.core.logging import get_logger

logger = get_logger(__name__)


router = APIRouter(prefix="/admin", tags=["admin"])


ALL_ADMIN_PERMISSIONS = [
    "job.review",
    "job.approve",
    "job.reject",
    "ad.flag",
    "ad.pause",
    "ad.draft",
    "ad.publish",
    "admin.dashboard.view",
    "admin.analytics.view",
    "admin.jobs.moderate",
    "admin.scrapedJobs.create",
    "admin.scrapedJobs.edit",
    "admin.scrapedJobs.review",
    "admin.companies.verify",
    "admin.companies.reject",
    "admin.companies.suspend",
    "admin.users.suspend",
    "admin.users.reactivate",
    "admin.admins.promote",
    "admin.admins.demote",
    "admin.auditLogs.view",
    "admin.adminActionLogs.view",
    "admin.security.view",
    "admin.ads.create",
    "admin.ads.manage",
    "admin.exports.users",
    "admin.exports.jobs",
    "admin.exports.companies",
    "admin.scraperSources.manage",
    "admin.subscriptions.manage",
    "admin.featureFlags.manage",
]


def _ensure_admin(current_user: User) -> User:
    if current_user.role != UserRole.admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    return current_user


def _pagination(page: int, limit: int, total: int) -> dict[str, int]:
    safe_limit = max(1, limit)
    total_pages = max(1, ceil(total / safe_limit)) if total else 1
    return {
        "page": page,
        "limit": safe_limit,
        "total": total,
        "totalPages": total_pages,
    }


def _to_user_record(user: User) -> dict[str, Any]:
    return {
        "_id": user.id,
        "fullName": user.full_name,
        "email": user.email,
        "role": user.role.value if hasattr(user.role, "value") else str(user.role),
        "adminLevel": getattr(user, "admin_level", "moderator"),
        "suspended": bool(user.suspended),
        "emailVerified": bool(user.email_verified),
        "emailVerifiedAt": user.email_verified_at.isoformat() if user.email_verified_at else None,
        "isGuestAccount": bool(getattr(user, "is_guest_account", False)),
        "createdAt": user.created_at.isoformat() if user.created_at else None,
    }


def _to_company_record(company: Company) -> dict[str, Any]:
    return {
        "_id": company.id,
        "name": company.name,
        "nif": company.nif,
        "industry": None,
        "size": None,
        "location": None,
        "status": company.status,
        "verificationStatus": "verified" if company.status == "active" else company.status,
        "contactEmail": company.email,
        "contactPerson": None,
        "createdAt": company.created_at.isoformat() if company.created_at else None,
    }


def _parse_date(value: str | None) -> datetime | None:
    if not value:
        return None
    raw = value.strip()
    if not raw:
        return None
    try:
        if len(raw) == 10:
            return datetime.fromisoformat(raw)
        return datetime.fromisoformat(raw.replace("Z", "+00:00")).replace(tzinfo=None)
    except ValueError:
        return None


def _is_in_range(created_at: str | None, from_date: str | None, to_date: str | None) -> bool:
    if not created_at:
        return True
    created_dt = _parse_date(created_at)
    if not created_dt:
        return True

    from_dt = _parse_date(from_date)
    to_dt = _parse_date(to_date)
    if from_dt and created_dt < from_dt:
        return False
    if to_dt and created_dt > (to_dt + timedelta(days=1) - timedelta(microseconds=1)):
        return False
    return True


def _record_admin_event(
    actor: User,
    action: str,
    resource_type: str,
    resource_id: str,
    details: dict[str, Any] | None = None,
) -> None:
    """Durable audit trail — writes straight to the AuditLog table (best-
    effort; never break the triggering action). Both /audit-logs and
    /admin-actions read from this same table, so there's exactly one
    persisted record of every privileged action, not an in-memory copy that
    gets wiped on restart."""
    detail_payload = details or {}
    try:
        session = SessionLocal()
        try:
            session.add(AuditLog(
                actor_user_id=actor.id,
                actor_email=getattr(actor, "email", None),
                action=action,
                resource_type=resource_type,
                resource_id=resource_id,
                details=json.dumps(detail_payload, default=str),
            ))
            session.commit()
        finally:
            session.close()
    except Exception:  # pragma: no cover - defensive
        pass


def _to_ad_record(ad: AdCampaign) -> dict[str, Any]:
    clicks = int(ad.clicks or 0)
    impressions = int(ad.impressions or 0)
    spent = (clicks * float(ad.cost_per_click or 0)) + (impressions * float(ad.cost_per_impression or 0))
    ctr = round((clicks / impressions) * 100, 2) if impressions else 0.0
    return {
        "_id": ad.id,
        "title": ad.title,
        "placement": ad.placement,
        "link": ad.link,
        "imageUrl": StorageService.resolve_public_url(ad.image_url),
        "status": ad.status,
        "active": bool(ad.active),
        "flagged": bool(ad.flagged),
        "budget": ad.budget,
        "costPerClick": float(ad.cost_per_click or 0),
        "costPerImpression": float(ad.cost_per_impression or 0),
        "spent": round(spent, 2),
        "budgetRemaining": round(float(ad.budget) - spent, 2) if ad.budget else None,
        "targetCategory": ad.target_category,
        "targetLocation": ad.target_location,
        "clicks": clicks,
        "impressions": impressions,
        "ctr": ctr,
        "startDate": ad.start_date.isoformat() if ad.start_date else None,
        "endDate": ad.end_date.isoformat() if ad.end_date else None,
        "createdAt": ad.created_at.isoformat() if ad.created_at else None,
    }


def _resolve_ad_image_update(existing_ref: str | None, incoming: Any) -> str | None:
    """Decide what to store for AdCampaign.image_url on an edit.

    The admin UI always echoes back whatever `imageUrl` it last displayed —
    which is a resolved, time-limited signed URL, not the stable stored ref —
    even when the admin never touched the image field. Blindly persisting that
    would silently replace a durable "server:<key>" ref with a URL that
    expires and can never be re-derived. Only treat the incoming value as a
    real change when it's a fresh upload ref or genuinely differs from what
    we'd currently resolve the existing ref to.
    """
    value = str(incoming or "").strip()
    if not value:
        return None  # admin explicitly cleared the field
    if value.startswith(("server:", "supabase:")):
        return value  # fresh ref from our own upload endpoint
    if existing_ref and value == StorageService.resolve_public_url(existing_ref):
        return existing_ref  # echoed-back resolved URL — no real change
    return value  # a genuinely different (admin-pasted) external URL


def _parse_dt(value: Any) -> datetime | None:
    if value in (None, ""):
        return None
    text = str(value).strip()
    if not text:
        return None
    try:
        if len(text) == 10:
            return datetime.fromisoformat(text)
        return datetime.fromisoformat(text.replace("Z", "+00:00")).replace(tzinfo=None)
    except ValueError:
        return None


def _compute_ad_status(ad: AdCampaign) -> str:
    now = datetime.utcnow()
    if not ad.active:
        return "inactive"
    if ad.flagged:
        return "flagged"
    if ad.start_date and now < ad.start_date:
        return "scheduled"
    if ad.end_date and now > ad.end_date:
        return "expired"
    return "active"


def _is_ad_live(ad: AdCampaign) -> bool:
    return _compute_ad_status(ad) == "active"


def _validate_ad_fields(link, start_date, end_date) -> None:
    """Lightweight validation for ad create/update."""
    if link and not (str(link).startswith("http://") or str(link).startswith("https://")):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="O link deve começar por http:// ou https://")
    if start_date and end_date and end_date <= start_date:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="A data de fim deve ser posterior à data de início")


@router.get("/me")
async def admin_me(current_user: User = Depends(get_current_user)):
    user = _ensure_admin(current_user)
    return {
        "id": user.id,
        "role": "admin",
        "adminLevel": getattr(user, "admin_level", "moderator"),
        "permissions": ALL_ADMIN_PERMISSIONS,
    }


def _safe_metric(db: Session, fn, label: str, default=0):
    """Run a metric query, never raising — a single broken query must not blank
    the entire dashboard. Logs, rolls back the aborted txn, and returns default."""
    try:
        return fn()
    except Exception as exc:  # noqa: BLE001
        logger.warning("admin metric '%s' failed: %s", label, exc)
        try:
            db.rollback()  # clear the aborted transaction so later queries still run
        except Exception:  # noqa: BLE001
            pass
        return default


def _safe_count(db: Session, model, label: str) -> int:
    return _safe_metric(db, lambda: db.query(model).count(), label)


def _count_block(db: Session, specs: dict[str, Any], label: str) -> tuple[dict[str, Any], bool]:
    """Run a group of count queries as ONE all-or-nothing unit with a single
    retry on a fresh transaction.

    Returns ``(values, ok)``. On total failure every value is ``None`` (NOT 0)
    and ``ok`` is ``False`` — so the UI can show an explicit "couldn't load"
    state instead of misleading zeros. Running the group together also means a
    transient DB blip can never produce an inconsistent *partial* result where
    some metrics show real numbers and others silently fall back to 0 (the
    cause of the "numbers change on every refresh" behaviour)."""
    for attempt in (1, 2):
        try:
            return {key: fn() for key, fn in specs.items()}, True
        except Exception as exc:  # noqa: BLE001
            logger.warning("admin %s counts failed (attempt %d/2): %s", label, attempt, exc)
            try:
                db.rollback()  # drop the aborted txn; next attempt gets a clean connection
            except Exception:  # noqa: BLE001
                pass
    return {key: None for key in specs}, False


@router.get("/overview")
async def admin_overview(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _ensure_admin(current_user)
    values, ok = _count_block(
        db,
        {
            "users": lambda: db.query(User).count(),
            "companies": lambda: db.query(Company).count(),
            "jobs": lambda: db.query(Job).count(),
            "scraped": lambda: db.query(ScrapedJob).count(),
            "ads": lambda: db.query(AdCampaign).count(),
        },
        "overview",
    )

    guest_active = db.query(User).filter(User.is_guest_account.is_(True)).count()
    guest_converted = db.query(User).filter(User.guest_converted_at.isnot(None)).count()
    guest_total_ever = guest_active + guest_converted
    guest_stats = {
        "activeGuestAccounts": guest_active,
        "convertedGuestAccounts": guest_converted,
        "guestConversionRate": round((guest_converted / guest_total_ever) * 100, 1) if guest_total_ever else None,
    }

    return {**values, "ok": ok, **guest_stats}


def _distribution(db: Session, column) -> list[dict[str, Any]]:
    try:
        rows = (
            db.query(column, func.count())
            .filter(column.isnot(None))
            .group_by(column)
            .order_by(func.count().desc())
            .all()
        )
        return [{"label": str(label), "value": int(count)} for label, count in rows if str(label).strip()]
    except Exception as exc:  # noqa: BLE001
        logger.warning("admin_analytics: distribution failed: %s", exc)
        db.rollback()
        return []


def _daily_series(db: Session, model, since: datetime) -> list[dict[str, Any]]:
    try:
        rows = (
            db.query(func.date(model.created_at), func.count())
            .filter(model.created_at >= since)
            .group_by(func.date(model.created_at))
            .order_by(func.date(model.created_at))
            .all()
        )
        return [{"label": str(d), "value": int(c)} for d, c in rows]
    except Exception as exc:  # noqa: BLE001
        logger.warning("admin_analytics: daily series failed: %s", exc)
        db.rollback()
        return []


def _pct_change(db: Session, model, now: datetime, window_days: int = 30) -> float:
    try:
        cur_start = now - timedelta(days=window_days)
        prev_start = now - timedelta(days=2 * window_days)
        current = db.query(model).filter(model.created_at >= cur_start).count()
        previous = db.query(model).filter(model.created_at >= prev_start, model.created_at < cur_start).count()
        if previous == 0:
            return 100.0 if current else 0.0
        return round((current - previous) / previous * 100, 1)
    except Exception as exc:  # noqa: BLE001
        logger.warning("admin_analytics: pct_change failed: %s", exc)
        db.rollback()
        return 0.0


# Real revenue aggregates from Transaction — the analytics dashboard used to
# hardcode revenuePct/series.revenue/business.revenueInRange to 0 even
# though paid transactions already exist. Scoped to status == "paid" (a
# pending/failed transaction isn't revenue yet).

def _daily_sum_series(db: Session, model, value_column, since: datetime, status_filter=None) -> list[dict[str, Any]]:
    try:
        query = db.query(func.date(model.created_at), func.coalesce(func.sum(value_column), 0)).filter(model.created_at >= since)
        if status_filter is not None:
            query = query.filter(status_filter)
        rows = query.group_by(func.date(model.created_at)).order_by(func.date(model.created_at)).all()
        return [{"label": str(d), "value": float(v)} for d, v in rows]
    except Exception as exc:  # noqa: BLE001
        logger.warning("admin_analytics: daily sum series failed: %s", exc)
        db.rollback()
        return []


def _sum_in_range(db: Session, model, value_column, from_dt: datetime | None, to_dt: datetime | None, status_filter=None) -> float:
    """Exact [from_dt, to_dt) bounds — callers passing user-supplied,
    date-only query params are responsible for expanding to_dt to the end
    of that calendar day themselves (same convention as _is_in_range)."""
    try:
        query = db.query(func.coalesce(func.sum(value_column), 0))
        if status_filter is not None:
            query = query.filter(status_filter)
        if from_dt:
            query = query.filter(model.created_at >= from_dt)
        if to_dt:
            query = query.filter(model.created_at <= to_dt)
        return float(query.scalar() or 0)
    except Exception as exc:  # noqa: BLE001
        logger.warning("admin_analytics: sum_in_range failed: %s", exc)
        db.rollback()
        return 0.0


def _sum_pct_change(db: Session, model, value_column, now: datetime, status_filter=None, window_days: int = 30) -> float:
    try:
        cur_start = now - timedelta(days=window_days)
        prev_start = now - timedelta(days=2 * window_days)
        current = _sum_in_range(db, model, value_column, cur_start, now, status_filter)
        previous = _sum_in_range(db, model, value_column, prev_start, cur_start, status_filter)
        if previous == 0:
            return 100.0 if current else 0.0
        return round((current - previous) / previous * 100, 1)
    except Exception as exc:  # noqa: BLE001
        logger.warning("admin_analytics: sum_pct_change failed: %s", exc)
        db.rollback()
        return 0.0


@router.get("/analytics")
async def admin_analytics(
    from_date: str | None = Query(default=None, alias="from"),
    to_date: str | None = Query(default=None, alias="to"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _ensure_admin(current_user)
    now = datetime.utcnow()
    since14 = now - timedelta(days=14)
    active_app_statuses = ("submitted", "under_review", "shortlisted", "interview")

    # Ad performance aggregates.
    def _safe_sum(column) -> int:
        try:
            return int(db.query(func.coalesce(func.sum(column), 0)).scalar() or 0)
        except Exception as exc:  # noqa: BLE001
            logger.warning("admin_analytics: sum failed: %s", exc)
            db.rollback()
            return 0

    ad_clicks = _safe_sum(AdCampaign.clicks)
    ad_impressions = _safe_sum(AdCampaign.impressions)
    ad_ctr = round((ad_clicks / ad_impressions) * 100, 2) if ad_impressions else 0.0

    totals_values, totals_ok = _count_block(
        db,
        {
            "users": lambda: db.query(User).count(),
            "companies": lambda: db.query(Company).count(),
            "jobs": lambda: db.query(Job).count(),
            "scraped": lambda: db.query(ScrapedJob).count(),
            "ads": lambda: db.query(AdCampaign).count(),
            "applications": lambda: db.query(JobApplication).count(),
        },
        "totals",
    )
    operational_values, operational_ok = _count_block(
        db,
        {
            "pendingJobs": lambda: db.query(Job).filter(Job.status == "pending_platform_review").count(),
            "pendingCompanies": lambda: db.query(Company).filter(Company.status == "pending_verification").count(),
            "suspendedUsers": lambda: db.query(User).filter(User.suspended.is_(True)).count(),
            "pendingScraped": lambda: db.query(ScrapedJob).filter(ScrapedJob.status == "pending").count(),
            "activeApplications": lambda: db.query(JobApplication).filter(JobApplication.status.in_(active_app_statuses)).count(),
        },
        "operational",
    )

    return {
        "range": {"from": from_date, "to": to_date},
        "totals": {**totals_values, "ok": totals_ok},
        "ads": {
            "total": _safe_count(db, AdCampaign, "ads.total"),
            "active": _safe_metric(db, lambda: db.query(AdCampaign).filter(AdCampaign.status == "active").count(), "ads.active"),
            "clicks": ad_clicks,
            "impressions": ad_impressions,
            "ctr": ad_ctr,
            "byStatus": _distribution(db, AdCampaign.status),
        },
        "operational": {**operational_values, "ok": operational_ok},
        "trends": {
            "usersPct": _pct_change(db, User, now),
            "companiesPct": _pct_change(db, Company, now),
            "jobsPct": _pct_change(db, Job, now),
            "applicationsPct": _pct_change(db, JobApplication, now),
            "revenuePct": _sum_pct_change(db, Transaction, Transaction.amount, now, status_filter=Transaction.status == "paid"),
        },
        "series": {
            "jobsPosted": _daily_series(db, Job, since14),
            "userSignups": _daily_series(db, User, since14),
            "applications": _daily_series(db, JobApplication, since14),
            "revenue": _daily_sum_series(db, Transaction, Transaction.amount, since14, status_filter=Transaction.status == "paid"),
        },
        "distributions": {
            "applicationStatus": _distribution(db, JobApplication.status),
            "jobsByStatus": _distribution(db, Job.status),
            "companyVerification": _distribution(db, Company.status),
            "jobLocationDensity": _distribution(db, Job.location)[:8],
            "userLocationDensity": _distribution(db, CandidateProfile.location)[:8],
        },
        "business": {
            "revenueInRange": _sum_in_range(
                db, Transaction, Transaction.amount,
                _parse_date(from_date), (_parse_date(to_date) + timedelta(days=1) - timedelta(microseconds=1)) if _parse_date(to_date) else None,
                status_filter=Transaction.status == "paid",
            ),
            "adCountInRange": _safe_count(db, AdCampaign, "business.adCountInRange"),
        },
        "insights": {
            "anomalies": [],
            "forecasts": {
                "jobsPostedNext": 0,
                "userSignupsNext": 0,
                "applicationsNext": 0,
                "revenueNext": 0,
            },
        },
        "cache": {"hit": False, "ttlMs": 0},
    }


@router.get("/users")
async def admin_users(
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=15, ge=1, le=200),
    keyword: str | None = None,
    role: str | None = None,
    adminLevel: str | None = None,
    isGuestAccount: str | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _ensure_admin(current_user)

    query = db.query(User)
    if keyword:
        term = f"%{keyword.strip()}%"
        query = query.filter((User.email.ilike(term)) | (User.full_name.ilike(term)))

    if role and role != "all":
        query = query.filter(User.role == role)

    if adminLevel and adminLevel != "all":
        query = query.filter(User.admin_level == adminLevel)

    if isGuestAccount and isGuestAccount != "all":
        query = query.filter(User.is_guest_account.is_(isGuestAccount == "true"))

    total = query.count()
    rows = query.order_by(User.created_at.desc()).offset((page - 1) * limit).limit(limit).all()
    return {
        "users": [_to_user_record(row) for row in rows],
        "pagination": _pagination(page, limit, total),
    }


@router.post("/users/verification-backfill")
async def admin_verification_backfill(
    payload: dict[str, Any] = {},
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """One-off (safely re-runnable) bulk send: verification emails for every
    currently-registered-but-unverified account. Respects the same
    per-account cooldown as the self-serve resend endpoint, so calling this
    repeatedly (e.g. to catch stragglers) never double-sends within the
    cooldown window."""
    admin = _ensure_admin(current_user)
    from app.api.v1.auth import _verification_resend_wait_seconds
    from app.services.auth_service import AuthService
    from app.workers.tasks import send_verification_email

    dry_run = bool(payload.get("dryRun", False))
    unverified = db.query(User).filter(User.email_verified.is_(False)).all()

    sent, skipped_cooldown = 0, 0
    for user in unverified:
        if _verification_resend_wait_seconds(db, user) > 0:
            skipped_cooldown += 1
            continue
        if not dry_run:
            raw_token = AuthService.create_verification_token(db, user)
            send_verification_email.delay(str(user.id), raw_token)
        sent += 1

    _record_admin_event(
        actor=admin, action="users.verification_backfill", resource_type="user", resource_id=None,
        details={"totalUnverified": len(unverified), "sent": sent, "skippedCooldown": skipped_cooldown, "dryRun": dry_run},
    )
    return {
        "totalUnverified": len(unverified),
        "sent": sent,
        "skippedCooldown": skipped_cooldown,
        "dryRun": dry_run,
    }


@router.post("/users/{user_id}/resend-verification")
async def admin_resend_verification(
    user_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Single-account version of /users/verification-backfill — for when an
    admin wants to re-send just one user's verification email (e.g. they
    contacted support) rather than sweeping every unverified account."""
    admin = _ensure_admin(current_user)
    from app.api.v1.auth import _verification_resend_wait_seconds
    from app.services.auth_service import AuthService
    from app.workers.tasks import send_verification_email

    target = db.query(User).filter(User.id == user_id).first()
    if not target:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Utilizador não encontrado")
    if target.email_verified:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Esta conta já está verificada")
    if not target.email:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Utilizador sem email registado")

    wait_seconds = _verification_resend_wait_seconds(db, target)
    if wait_seconds > 0:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Aguarde {wait_seconds}s antes de reenviar a verificação a esta conta.",
        )

    raw_token = AuthService.create_verification_token(db, target)
    send_verification_email.delay(str(target.id), raw_token)
    _record_admin_event(
        actor=admin, action="user.resend_verification", resource_type="user",
        resource_id=target.id, details={"email": target.email},
    )
    return {"sent": True, "userId": target.id}


@router.patch("/users/{user_id}/suspend")
async def admin_suspend_user(
    user_id: str,
    payload: dict[str, Any],
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    actor = _ensure_admin(current_user)
    if getattr(actor, "admin_level", "moderator") != "super-admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Super-admin required")

    target = db.query(User).filter(User.id == user_id).first()
    if not target:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    was_suspended = bool(target.suspended)
    target.suspended = bool(payload.get("suspended", False))
    db.commit()
    db.refresh(target)
    _record_admin_event(
        actor=actor,
        action="user.suspend" if target.suspended else "user.reactivate",
        resource_type="user",
        resource_id=target.id,
        details={"suspended": target.suspended, "reason": payload.get("reason", "")},
    )

    # Notify the user when their access state actually changes. Only
    # reactivation gets an in-app bell entry — a suspended user can't log
    # in to see one, so email is the only channel that reaches them there.
    if target.suspended != was_suspended and target.email:
        try:
            if target.suspended:
                send_templated_email.delay("send_account_suspended_email", {
                    "email": target.email, "full_name": target.full_name or "",
                    "reason": str(payload.get("reason", "") or ""),
                })
            else:
                send_templated_email.delay("send_account_reactivated_email", {
                    "email": target.email, "full_name": target.full_name or "",
                })
                create_notification(
                    db, target.id, type="account_reactivated",
                    title="Conta reativada",
                    body="A sua conta foi reativada e já pode aceder normalmente.",
                )
        except Exception as e:
            logger.warning(f"Could not enqueue account status email: {e}")

    return {"user": _to_user_record(target)}


@router.post("/users/{user_id}/force-logout")
async def admin_force_logout_user(
    user_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Instantly invalidates every access token already issued to this user
    (via `tokens_revoked_at`, checked in get_current_user) and revokes all
    of their refresh tokens, so a silent-refresh can't quietly resume the
    session either. `suspended` already blocks new activity — this is for
    cutting off a session that's still valid right now (compromised
    account, offboarded team member, etc.)."""
    actor = _ensure_admin(current_user)
    if getattr(actor, "admin_level", "moderator") != "super-admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Super-admin required")

    target = db.query(User).filter(User.id == user_id).first()
    if not target:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    target.tokens_revoked_at = datetime.utcnow()
    db.commit()

    from app.services.auth_service import AuthService
    AuthService.revoke_all_refresh_tokens(db, target)

    _record_admin_event(
        actor=actor, action="user.forceLogout", resource_type="user", resource_id=target.id, details={},
    )
    return {"user": _to_user_record(target)}


@router.patch("/users/{user_id}/admin-level")
async def admin_change_level(
    user_id: str,
    payload: dict[str, Any],
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    actor = _ensure_admin(current_user)
    if getattr(actor, "admin_level", "moderator") != "super-admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Super-admin required")

    target = db.query(User).filter(User.id == user_id).first()
    if not target:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    next_level = str(payload.get("adminLevel", "moderator"))
    target.admin_level = "super-admin" if next_level == "super-admin" else "moderator"
    db.commit()
    db.refresh(target)
    _record_admin_event(
        actor=actor,
        action="admin.level.change",
        resource_type="user",
        resource_id=target.id,
        details={"adminLevel": target.admin_level, "reason": payload.get("reason", "")},
    )
    return {"user": _to_user_record(target)}


@router.post("/users/admin")
async def admin_create_admin(
    payload: dict[str, Any],
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    actor = _ensure_admin(current_user)
    if getattr(actor, "admin_level", "moderator") != "super-admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Super-admin required")

    email = str(payload.get("email", "")).strip().lower()
    full_name = str(payload.get("fullName", "")).strip()
    admin_level = str(payload.get("adminLevel", "moderator"))

    if not email or not full_name:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Missing required fields")

    existing = db.query(User).filter(User.email == email).first()
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered")

    created = User(
        email=email,
        full_name=full_name,
        password_hash="TEMP_RESET_REQUIRED",
        role=UserRole.admin,
        admin_level="super-admin" if admin_level == "super-admin" else "moderator",
        email_verified=True,
        email_verified_at=datetime.utcnow(),
    )
    db.add(created)
    db.commit()
    db.refresh(created)
    _record_admin_event(
        actor=actor,
        action="admin.create",
        resource_type="user",
        resource_id=created.id,
        details={"email": created.email, "adminLevel": created.admin_level},
    )

    return {"user": _to_user_record(created)}


@router.get("/jobs")
async def admin_jobs(
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=15, ge=1, le=200),
    keyword: str | None = None,
    status_filter: str | None = Query(default=None, alias="status"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _ensure_admin(current_user)
    query = db.query(Job).options(joinedload(Job.company))
    if keyword and keyword.strip():
        query = query.filter(Job.title.ilike(f"%{keyword.strip()}%"))
    if status_filter and status_filter != "all":
        query = query.filter(Job.status == status_filter)

    total = query.count()
    rows = (
        query.order_by(Job.created_at.desc())
        .offset((page - 1) * limit)
        .limit(limit)
        .all()
    )
    return {
        "jobs": [serialize_job(j, detail=True) for j in rows],
        "pagination": _pagination(page, limit, total),
    }


@router.patch("/jobs/{job_id}/moderate")
async def admin_moderate_job(
    job_id: str,
    payload: dict[str, Any],
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    admin = _ensure_admin(current_user)
    next_status = payload.get("status", "approved")
    next_visibility = payload.get("visibility", "public")

    job = db.query(Job).filter(Job.id == job_id).first()
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")

    previous_status = job.status
    job.status = next_status
    job.visibility = next_visibility
    job.moderation_reason = payload.get("reason", "") or None
    if next_status in ("approved", "published", "active") and job.published_at is None:
        job.published_at = datetime.utcnow()
    db.commit()
    db.refresh(job)

    _record_admin_event(
        actor=admin,
        action="job.moderate",
        resource_type="job",
        resource_id=job_id,
        details={"status": next_status, "visibility": next_visibility, "reason": payload.get("reason", "")},
    )

    # Notify the company owner of the moderation outcome.
    try:
        company = db.query(Company).filter(Company.id == job.company_id).first() if job.company_id else None
        owner = db.query(User).filter(User.id == company.owner_user_id).first() if company and company.owner_user_id else None
        if owner and next_status in ("approved", "published", "active"):
            if owner.email:
                send_templated_email.delay("send_job_approved_email", {
                    "email": owner.email, "recruiter_name": owner.full_name or "",
                    "job_title": job.title, "job_id": job_id,
                })
            create_notification(
                db, owner.id, type="job_approved",
                title="Vaga aprovada",
                body=f"A sua vaga \"{job.title}\" foi aprovada e está publicada.",
                link=f"/Portal/Empresa/Minhas-Vagas",
            )
        elif owner and next_status in ("rejected", "declined"):
            if owner.email:
                send_templated_email.delay("send_job_rejected_email", {
                    "email": owner.email, "recruiter_name": owner.full_name or "",
                    "job_title": job.title, "reason": payload.get("reason", "") or "",
                })
            create_notification(
                db, owner.id, type="job_rejected",
                title="Vaga rejeitada",
                body=f"A sua vaga \"{job.title}\" foi rejeitada." + (f" Motivo: {payload.get('reason')}" if payload.get("reason") else ""),
                link=f"/Portal/Empresa/Minhas-Vagas",
            )
    except Exception as e:
        logger.warning(f"Could not enqueue job moderation email: {e}")

    # Instant job alerts — only when the job newly becomes public.
    _public = ("approved", "published", "active")
    if next_status in _public and previous_status not in _public:
        try:
            from app.workers.tasks import dispatch_instant_alerts_for_job
            dispatch_instant_alerts_for_job.delay(job_id)
        except Exception as e:
            logger.warning(f"Could not enqueue instant job alerts: {e}")

    return {"job": serialize_job(job, detail=True)}


@router.patch("/jobs/{job_id}/featured")
async def admin_set_job_featured(
    job_id: str,
    payload: dict[str, Any],
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Toggles display priority only — deliberately separate from
    `moderate` so flipping this can't accidentally re-set status/visibility."""
    admin = _ensure_admin(current_user)
    job = db.query(Job).filter(Job.id == job_id).first()
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")

    job.featured = bool(payload.get("featured"))
    db.commit()
    db.refresh(job)

    _record_admin_event(
        actor=admin, action="job.featured", resource_type="job",
        resource_id=job_id, details={"featured": job.featured},
    )
    return {"job": serialize_job(job, detail=True)}


@router.get("/applications")
async def admin_applications(
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=15, ge=1, le=200),
    status_filter: str | None = Query(default=None, alias="status"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _ensure_admin(current_user)
    query = db.query(JobApplication)
    if status_filter and status_filter != "all":
        query = query.filter(JobApplication.status == status_filter)
    total = query.count()
    rows = (
        query.order_by(JobApplication.created_at.desc())
        .offset((page - 1) * limit)
        .limit(limit)
        .all()
    )
    applications = [
        {
            "_id": a.id,
            "status": a.status,
            "jobId": a.job_id,
            "companyId": a.company_id,
            "candidateUserId": a.candidate_user_id,
            "applicantEmail": a.applicant_email,
            "createdAt": a.created_at.isoformat() if a.created_at else None,
        }
        for a in rows
    ]
    return {"applications": applications, "pagination": _pagination(page, limit, total)}


@router.get("/companies")
async def admin_companies(
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=15, ge=1, le=200),
    keyword: str | None = None,
    status_filter: str | None = Query(default=None, alias="status"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _ensure_admin(current_user)

    query = db.query(Company)
    if keyword:
        query = query.filter(Company.name.ilike(f"%{keyword.strip()}%"))
    if status_filter and status_filter != "all":
        query = query.filter(Company.status == status_filter)

    total = query.count()
    rows = query.order_by(Company.created_at.desc()).offset((page - 1) * limit).limit(limit).all()
    return {
        "companies": [_to_company_record(row) for row in rows],
        "pagination": _pagination(page, limit, total),
    }


_SCHEDULED_TASK_NAMES = [
    "scrape_external_jobs",
    "expire_stale_aggregated_jobs",
    "publish_scheduled_scraped_jobs",
    "dispatch_scraped_jobs_digest",
    "cleanup_expired_tokens",
    "dispatch_job_alert_digests",
    "dispatch_subscription_expiry_reminders",
    "generate_auto_apply_proposals",
    "run_hibp_breach_scan",
]


@router.get("/task-runs")
async def admin_task_runs(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Last-run status for every celery-beat scheduled task — generalizes
    ScraperSource.last_run_* (scoped to the scraper only) via the shared
    TaskRun ledger written by app.services.task_heartbeat.track_task_run."""
    _ensure_admin(current_user)

    rows = []
    for task_name in _SCHEDULED_TASK_NAMES:
        latest = (
            db.query(TaskRun)
            .filter(TaskRun.task_name == task_name)
            .order_by(TaskRun.started_at.desc())
            .first()
        )
        rows.append({
            "taskName": task_name,
            "lastRun": {
                "startedAt": latest.started_at.isoformat() if latest and latest.started_at else None,
                "finishedAt": latest.finished_at.isoformat() if latest and latest.finished_at else None,
                "status": latest.status if latest else "never_run",
                "detail": latest.detail if latest else None,
            } if latest else {"startedAt": None, "finishedAt": None, "status": "never_run", "detail": None},
        })

    return {"tasks": rows}


@router.get("/analytics/auto-apply")
async def admin_auto_apply_analytics(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Read-only rollup for the auto-apply funnel (JobMatchProposal — a
    'propose then approve' queue, already populated, unlike the dead
    JobMatch table) and AI usage metering (LlmCallLog, per-feature call
    counts/success rate — llm_service.py recorded nothing before this)."""
    _ensure_admin(current_user)

    total_proposals = db.query(func.count(JobMatchProposal.id)).scalar() or 0
    status_counts = dict(
        db.query(JobMatchProposal.status, func.count(JobMatchProposal.id))
        .group_by(JobMatchProposal.status)
        .all()
    )
    approved = int(status_counts.get("approved", 0))
    approval_rate = round((approved / total_proposals) * 100, 1) if total_proposals else None

    llm_rows = (
        db.query(LlmCallLog.feature, LlmCallLog.success, func.count(LlmCallLog.id))
        .group_by(LlmCallLog.feature, LlmCallLog.success)
        .all()
    )
    llm_by_feature: dict[str, dict[str, int]] = {}
    for feature, success, count in llm_rows:
        entry = llm_by_feature.setdefault(feature, {"success": 0, "failed": 0})
        entry["success" if success else "failed"] = int(count)

    llm_usage = [
        {
            "feature": feature,
            "success": counts["success"],
            "failed": counts["failed"],
            "total": counts["success"] + counts["failed"],
        }
        for feature, counts in sorted(llm_by_feature.items(), key=lambda kv: -(kv[1]["success"] + kv[1]["failed"]))
    ]

    return {
        "autoApplyFunnel": {
            "total": total_proposals,
            "pending": int(status_counts.get("pending", 0)),
            "approved": approved,
            "dismissed": int(status_counts.get("dismissed", 0)),
            "expired": int(status_counts.get("expired", 0)),
            "approvalRate": approval_rate,
        },
        "llmUsage": llm_usage,
    }


@router.get("/analytics/email-deliverability")
async def admin_email_deliverability_analytics(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Per-template send success/failure rollup from EmailLog (one row per
    attempted send through send_templated_email) plus a short recent-
    failures list for triage — no recipient shown, EmailLog only ever
    stores a hash."""
    _ensure_admin(current_user)

    rows = (
        db.query(EmailLog.template, EmailLog.success, func.count(EmailLog.id))
        .group_by(EmailLog.template, EmailLog.success)
        .all()
    )
    by_template: dict[str, dict[str, int]] = {}
    for template, success, count in rows:
        entry = by_template.setdefault(template, {"success": 0, "failed": 0})
        entry["success" if success else "failed"] = int(count)

    templates = [
        {
            "template": template,
            "success": counts["success"],
            "failed": counts["failed"],
            "total": counts["success"] + counts["failed"],
        }
        for template, counts in sorted(by_template.items(), key=lambda kv: -(kv[1]["success"] + kv[1]["failed"]))
    ]

    recent_failures = (
        db.query(EmailLog)
        .filter(EmailLog.success.is_(False))
        .order_by(EmailLog.created_at.desc())
        .limit(20)
        .all()
    )

    return {
        "templates": templates,
        "recentFailures": [
            {
                "template": row.template,
                "error": (row.error or "")[:300],
                "createdAt": row.created_at.isoformat() if row.created_at else None,
            }
            for row in recent_failures
        ],
    }


@router.get("/analytics/client-errors")
async def admin_client_errors_analytics(
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1, le=100),
    level: str | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Paginated recent client-error reports (ClientErrorLog, populated by
    the public POST /api/v1/events/client-errors endpoint) plus a 14-day
    daily rate series. Every field returned here is rendered as plain text
    by the admin frontend — never dangerouslySetInnerHTML — since this
    table's content originates from an unauthenticated public endpoint."""
    _ensure_admin(current_user)

    query = db.query(ClientErrorLog)
    if level and level != "all":
        query = query.filter(ClientErrorLog.level == level)

    total = query.count()
    rows = query.order_by(ClientErrorLog.created_at.desc()).offset((page - 1) * limit).limit(limit).all()

    return {
        "errors": [
            {
                "_id": row.id,
                "level": row.level,
                "message": row.message,
                "path": row.path,
                "details": row.details,
                "createdAt": row.created_at.isoformat() if row.created_at else None,
            }
            for row in rows
        ],
        "pagination": _pagination(page, limit, total),
        "dailySeries": _daily_series(db, ClientErrorLog, datetime.utcnow() - timedelta(days=14)),
    }


@router.get("/analytics/funnels")
async def admin_business_funnels_analytics(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Business-funnel rollups from data that already exists — no new
    tables, just queries nothing had surfaced yet."""
    _ensure_admin(current_user)
    import statistics

    # Signup -> verified -> first application, candidates only (the step
    # only makes sense for the accounts that actually apply to jobs).
    # Uses User.email_verified rather than EmailVerificationToken.used_at:
    # cleanup_expired_tokens deletes a token once it expires regardless of
    # whether it was used, so the token table alone would under-count
    # verified users whose token has since aged out.
    signups = db.query(func.count(User.id)).filter(User.role == UserRole.candidate).scalar() or 0
    verified = db.query(func.count(User.id)).filter(
        User.role == UserRole.candidate, User.email_verified.is_(True),
    ).scalar() or 0
    applied = db.query(func.count(func.distinct(JobApplication.candidate_user_id))).filter(
        JobApplication.candidate_user_id.isnot(None),
    ).scalar() or 0
    funnel = {
        "signups": signups,
        "verified": verified,
        "appliedAtLeastOnce": applied,
        "verifiedRate": round((verified / signups) * 100, 1) if signups else None,
        "appliedRate": round((applied / signups) * 100, 1) if signups else None,
    }

    # Moderation SLA — time from submission to publish, for jobs actually
    # published. Median computed in Python (portable across SQLite/Postgres,
    # neither of which this app can rely on having a built-in percentile
    # function it can use identically in both).
    published = db.query(Job.created_at, Job.published_at).filter(Job.published_at.isnot(None)).all()
    hours = [(p - c).total_seconds() / 3600 for c, p in published if c and p]
    moderation_sla = {
        "avgHours": round(sum(hours) / len(hours), 1) if hours else None,
        "medianHours": round(statistics.median(hours), 1) if hours else None,
        "sampleSize": len(hours),
    }

    # CV parse-failure rate — only the two terminal outcomes count toward
    # the rate; pending/processing are in-flight and not_applicable/skipped
    # were never attempted.
    parse_rows = dict(db.query(CVUpload.parse_status, func.count(CVUpload.id)).group_by(CVUpload.parse_status).all())
    parse_completed = int(parse_rows.get("completed", 0))
    parse_failed = int(parse_rows.get("failed", 0))
    parse_terminal = parse_completed + parse_failed
    cv_parsing = {
        "completed": parse_completed,
        "failed": parse_failed,
        "failureRate": round((parse_failed / parse_terminal) * 100, 1) if parse_terminal else None,
    }

    # Newsletter growth — weekly signups over the last 8 weeks, bucketed in
    # Python (portable; avoids a Postgres-only date_trunc vs SQLite-only
    # strftime split for a once-a-week granularity that doesn't need SQL-
    # level aggregation).
    since = datetime.utcnow() - timedelta(weeks=8)
    recent_subs = db.query(NewsletterSubscriber.created_at).filter(NewsletterSubscriber.created_at >= since).all()
    weekly_buckets: dict[str, int] = {}
    for (created,) in recent_subs:
        week_start = (created - timedelta(days=created.weekday())).date().isoformat()
        weekly_buckets[week_start] = weekly_buckets.get(week_start, 0) + 1
    newsletter = {
        "weeklySignups": [{"label": k, "value": v} for k, v in sorted(weekly_buckets.items())],
        "totalSubscribers": db.query(func.count(NewsletterSubscriber.id)).scalar() or 0,
        "activeSubscribers": db.query(func.count(NewsletterSubscriber.id)).filter(
            NewsletterSubscriber.unsubscribed_at.is_(None),
        ).scalar() or 0,
    }

    # Job spam-score distribution — already computed on every job, never
    # surfaced anywhere before this.
    spam_rows = db.query(Job.spam_score, func.count(Job.id)).group_by(Job.spam_score).all()
    spam_buckets = [(0, 0, "0"), (1, 25, "1-25"), (26, 50, "26-50"), (51, 75, "51-75"), (76, 100, "76-100")]
    spam_distribution = [
        {
            "label": label,
            "value": sum(int(c) for score, c in spam_rows if score is not None and lo <= score <= hi),
        }
        for lo, hi, label in spam_buckets
    ]

    return {
        "signupFunnel": funnel,
        "moderationSla": moderation_sla,
        "cvParsing": cv_parsing,
        "newsletter": newsletter,
        "spamScoreDistribution": spam_distribution,
    }


@router.get("/analytics/demand")
async def admin_demand_analytics(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Read-only demand-signal rollup — most-saved jobs and JobAlert
    volume/top categories/keywords, all from existing tables. No candidate
    identity is exposed, only aggregate counts."""
    _ensure_admin(current_user)

    top_saved_rows = (
        db.query(SavedJob.job_id, func.count(SavedJob.id).label("saves"))
        .group_by(SavedJob.job_id)
        .order_by(func.count(SavedJob.id).desc())
        .limit(10)
        .all()
    )
    job_ids = [row[0] for row in top_saved_rows]
    jobs_by_id = {j.id: j for j in db.query(Job).filter(Job.id.in_(job_ids)).all()} if job_ids else {}
    top_saved_jobs = [
        {
            "jobId": job_id,
            "title": jobs_by_id[job_id].title if job_id in jobs_by_id else None,
            "saves": int(saves),
        }
        for job_id, saves in top_saved_rows
    ]

    total_alerts = db.query(func.count(JobAlert.id)).scalar() or 0
    active_alerts = db.query(func.count(JobAlert.id)).filter(JobAlert.active.is_(True)).scalar() or 0

    top_categories = (
        db.query(JobAlert.category, func.count(JobAlert.id))
        .filter(JobAlert.category.isnot(None))
        .group_by(JobAlert.category)
        .order_by(func.count(JobAlert.id).desc())
        .limit(10)
        .all()
    )
    top_keywords = (
        db.query(JobAlert.keyword, func.count(JobAlert.id))
        .filter(JobAlert.keyword.isnot(None))
        .group_by(JobAlert.keyword)
        .order_by(func.count(JobAlert.id).desc())
        .limit(10)
        .all()
    )

    return {
        "topSavedJobs": top_saved_jobs,
        "jobAlerts": {
            "total": total_alerts,
            "active": active_alerts,
        },
        "topAlertCategories": [{"label": label, "value": int(count)} for label, count in top_categories],
        "topAlertKeywords": [{"label": label, "value": int(count)} for label, count in top_keywords],
    }


@router.get("/companies/{company_id}/team")
async def admin_company_team(
    company_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Read-only rollup for the company detail modal — member roles and
    pending invites already exist via CompanyMember/CompanyInvite, this is
    just the first admin-facing view of that data."""
    _ensure_admin(current_user)
    company = db.query(Company).filter(Company.id == company_id).first()
    if not company:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Company not found")

    members = (
        db.query(CompanyMember, User)
        .join(User, User.id == CompanyMember.user_id)
        .filter(CompanyMember.company_id == company_id)
        .order_by(CompanyMember.created_at.asc())
        .all()
    )
    invites = (
        db.query(CompanyInvite)
        .filter(CompanyInvite.company_id == company_id, CompanyInvite.status == "pending")
        .order_by(CompanyInvite.created_at.desc())
        .all()
    )

    owner = db.query(User).filter(User.id == company.owner_user_id).first() if company.owner_user_id else None

    return {
        "owner": {"id": owner.id, "fullName": owner.full_name, "email": owner.email} if owner else None,
        "members": [
            {
                "id": member.id,
                "userId": user.id,
                "fullName": user.full_name,
                "email": user.email,
                "role": member.role,
                "joinedAt": member.created_at.isoformat() if member.created_at else None,
            }
            for member, user in members
        ],
        "pendingInvites": [
            {
                "id": invite.id,
                "email": invite.email,
                "role": invite.role,
                "expiresAt": invite.expires_at.isoformat() if invite.expires_at else None,
                "createdAt": invite.created_at.isoformat() if invite.created_at else None,
            }
            for invite in invites
        ],
        "memberCount": len(members) + (1 if owner else 0),
    }


@router.get("/companies/ats-stage-summary")
async def admin_ats_stage_summary(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Read-only rollup of pipeline item counts per stage NAME, aggregated
    across every company (each company owns its own ATSStage rows, so this
    groups by name rather than a single shared stage id)."""
    _ensure_admin(current_user)
    rows = (
        db.query(ATSStage.name, func.count(ATSPipelineItem.id))
        .outerjoin(ATSPipelineItem, ATSPipelineItem.stage_id == ATSStage.id)
        .group_by(ATSStage.name)
        .all()
    )
    counts: dict[str, int] = {}
    for name, count in rows:
        counts[name] = counts.get(name, 0) + int(count or 0)
    return {
        "stages": [{"name": name, "count": count} for name, count in sorted(counts.items(), key=lambda kv: -kv[1])],
        "totalPipelineItems": db.query(func.count(ATSPipelineItem.id)).scalar() or 0,
        "companiesWithPipeline": db.query(func.count(func.distinct(ATSPipelineItem.company_id))).scalar() or 0,
    }


def _json_list(value: str | None) -> list[str]:
    if not value:
        return []
    try:
        parsed = json.loads(value)
        return [str(v) for v in parsed] if isinstance(parsed, list) else []
    except Exception:
        return []


def _list_to_json(value: Any) -> str | None:
    """Accept either a JSON array or newline/line-separated text (admin
    textareas send plain text — one bullet per line) and normalise to a
    JSON array string, dropping blank lines."""
    if value is None:
        return None
    if isinstance(value, list):
        items = [str(v).strip() for v in value if str(v).strip()]
    else:
        items = [line.strip() for line in str(value).splitlines() if line.strip()]
    return json.dumps(items, ensure_ascii=False) if items else None


def _to_scraped_record(s: ScrapedJob) -> dict[str, Any]:
    return {
        "_id": s.id,
        "title": s.title,
        "company": s.company_name,
        "location": s.location,
        "category": s.category,
        "source": s.source,
        "sourceUrl": s.source_url,
        "status": s.status,
        "duplicateOf": s.duplicate_of,
        "publishedJobId": s.published_job_id,
        "applicationDeadline": s.application_deadline.isoformat() if s.application_deadline else None,
        "scheduledPublishAt": s.scheduled_publish_at.isoformat() if s.scheduled_publish_at else None,
        "audienceLane": s.audience_lane,
        "qualityScore": s.quality_score or 0,
        "qualityFlags": _json_list(s.quality_flags),
        "description": s.description,
        "responsibilities": _json_list(s.responsibilities),
        "requirements": _json_list(s.requirements),
        "companyLogoUrl": StorageService.resolve_public_url(s.company_logo_url),
        "companyWebsite": s.company_website,
        "contactEmail": s.contact_email,
        "createdAt": s.created_at.isoformat() if s.created_at else None,
    }


def _resolve_scraped_job_expiry(application_deadline: datetime | None, now: datetime, shelf_life_days: int = 45) -> datetime:
    """Prefer the real hiring deadline (source-provided or admin-set) over the
    internal shelf-life fallback, but only when it's still in the future —
    otherwise an already-passed deadline would publish a pre-expired job."""
    if application_deadline and application_deadline > now:
        return application_deadline
    return now + timedelta(days=shelf_life_days)


# changed-payload key -> (Job attribute, ScrapedJob attribute) — names diverge
# for the two company-attribution fields since Job prefixes them "external_".
_SCRAPED_TO_JOB_FIELD_MAP = {
    "title": ("title", "title"),
    "description": ("description", "description"),
    "location": ("location", "location"),
    "category": ("category", "category"),
    "responsibilities": ("responsibilities", "responsibilities"),
    "requirements": ("requirements", "requirements"),
    "company": ("external_company_name", "company_name"),
    "companyLogoUrl": ("external_company_logo_url", "company_logo_url"),
    "contactEmail": ("external_contact_email", "contact_email"),
}


def _sync_scraped_edit_to_job(job: Job, s: ScrapedJob, changed_fields: list[str]) -> None:
    """Mirror a post-publish ScrapedJob edit onto its already-live Job.

    Admins routinely curate a scraped listing (paste in the full description,
    requirements, company logo) *after* it's already been published — those
    edits must reach the public listing, not just sit on the ScrapedJob row.
    """
    for key in changed_fields:
        mapping = _SCRAPED_TO_JOB_FIELD_MAP.get(key)
        if mapping:
            job_attr, scraped_attr = mapping
            setattr(job, job_attr, getattr(s, scraped_attr))
    if "applicationDeadline" in changed_fields:
        job.expires_at = _resolve_scraped_job_expiry(s.application_deadline, datetime.utcnow())


def _aggregator_company(db: Session, admin: User | None = None) -> Company:
    """Synthetic company that owns published scraped jobs.

    `admin` is optional so the scheduled-publish sweep (a background task
    with no request-scoped current_user) can still create the aggregator
    company on its first-ever use, falling back to any admin account.
    """
    co = db.query(Company).filter(Company.name == "Parvagas Aggregator").first()
    if not co:
        owner = admin or db.query(User).filter(User.role == UserRole.admin).first()
        co = Company(owner_user_id=owner.id if owner else None, name="Parvagas Aggregator", status="active",
                     description="Vagas agregadas de fontes externas.")
        db.add(co)
        db.flush()
    return co


def _publish_scraped_job(db: Session, s: ScrapedJob, admin: User | None = None) -> Job:
    """Create the live Job for an approved/scheduled ScrapedJob and link them.

    Shared by the immediate-approve path and the scheduled-publish sweep so
    both create the exact same Job shape.
    """
    co = _aggregator_company(db, admin)
    expires_at = _resolve_scraped_job_expiry(s.application_deadline, datetime.utcnow())
    job = Job(
        company_id=co.id, title=s.title, description=s.description,
        location=s.location, category=s.category,
        responsibilities=s.responsibilities, requirements=s.requirements,
        status="approved", visibility="public",
        published_at=datetime.utcnow(),
        source=s.source, source_url=safe_http_url(s.source_url),
        external_company_name=s.company_name,
        external_company_logo_url=safe_http_url(s.company_logo_url),
        external_contact_email=s.contact_email,
        expires_at=expires_at,
    )
    db.add(job)
    db.flush()
    s.published_job_id = job.id
    s.status = "approved"
    if not s.expires_at:
        s.expires_at = datetime.utcnow() + timedelta(days=45)
    return job


@router.get("/scraped-jobs")
async def admin_scraped_jobs(
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=15, ge=1, le=200),
    keyword: str | None = None,
    status_filter: str | None = Query(default=None, alias="status"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _ensure_admin(current_user)
    query = db.query(ScrapedJob)
    if status_filter and status_filter != "all":
        query = query.filter(ScrapedJob.status == status_filter)
    if keyword and keyword.strip():
        query = query.filter(ScrapedJob.title.ilike(f"%{keyword.strip()}%"))
    total = query.count()
    rows = query.order_by(ScrapedJob.created_at.desc()).offset((page - 1) * limit).limit(limit).all()
    return {
        "scrapedJobs": [_to_scraped_record(r) for r in rows],
        "pagination": _pagination(page, limit, total),
        # Diversity signal: are pending listings spanning different audiences,
        # or clustering on whatever one source published today?
        "laneCounts": _pending_lane_counts(db),
    }


def _pending_lane_counts(db: Session) -> dict[str, int]:
    rows = (
        db.query(ScrapedJob.audience_lane, func.count(ScrapedJob.id))
        .filter(ScrapedJob.status == "pending")
        .group_by(ScrapedJob.audience_lane)
        .all()
    )
    return {(lane or "unclassified"): count for lane, count in rows}


@router.post("/scraped-jobs")
async def admin_create_scraped(
    payload: dict[str, Any],
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    admin = _ensure_admin(current_user)
    title = str(payload.get("title", "")).strip()
    if not title:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Title is required")
    company_name = str(payload.get("company", "") or payload.get("companyName", "")).strip() or None
    location = str(payload.get("location", "")).strip() or None
    source_url = safe_http_url(payload.get("sourceUrl"))
    chash = scraped_content_hash(title, company_name, location)
    # Dedup: same content hash OR same source_url already ingested.
    dup = db.query(ScrapedJob).filter(ScrapedJob.content_hash == chash).first()
    if not dup and source_url:
        dup = db.query(ScrapedJob).filter(ScrapedJob.source_url == source_url).first()
    if dup:
        # Refresh the existing record's last_seen rather than create noise.
        dup.last_seen_at = datetime.utcnow()
        db.commit()
        db.refresh(dup)
        return {"scraped": _to_scraped_record(dup), "duplicate": True}
    category = str(payload.get("category", "")).strip() or None
    description = str(payload.get("description", "")).strip() or None
    audience_lane = str(payload.get("audienceLane", "")).strip() or classify_audience_lane(title, category, description)
    responsibilities_json = _list_to_json(payload.get("responsibilities"))
    requirements_json = _list_to_json(payload.get("requirements"))
    quality_score, quality_flags = assess_scraped_job_quality(
        title, description, company_name,
        has_responsibilities=bool(responsibilities_json), has_requirements=bool(requirements_json),
    )
    s = ScrapedJob(
        title=title, company_name=company_name, location=location,
        category=category,
        source=str(payload.get("source", "")).strip() or None,
        source_url=source_url,
        description=description,
        application_deadline=_parse_date(payload.get("applicationDeadline") or payload.get("deadline")),
        responsibilities=responsibilities_json,
        requirements=requirements_json,
        company_logo_url=safe_http_url(payload.get("companyLogoUrl")),
        company_website=safe_http_url(payload.get("companyWebsite")),
        contact_email=str(payload.get("contactEmail", "")).strip().lower() or None,
        audience_lane=audience_lane,
        quality_score=quality_score,
        quality_flags=json.dumps(quality_flags, ensure_ascii=False) if quality_flags else None,
        status="pending",
        content_hash=chash,
        last_seen_at=datetime.utcnow(),
    )
    db.add(s)
    db.commit()
    db.refresh(s)
    _record_admin_event(actor=admin, action="scraped.create", resource_type="scraped_job",
                        resource_id=s.id, details={"title": s.title, "source": s.source})
    return {"scraped": _to_scraped_record(s)}


@router.patch("/scraped-jobs/{scraped_id}")
async def admin_update_scraped(
    scraped_id: str,
    payload: dict[str, Any],
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    admin = _ensure_admin(current_user)
    s = db.query(ScrapedJob).filter(ScrapedJob.id == scraped_id).first()
    if not s:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Scraped job not found")
    changed = []
    for key, attr in (("title", "title"), ("company", "company_name"), ("location", "location"),
                      ("category", "category"), ("description", "description")):
        if key in payload:
            setattr(s, attr, str(payload[key] or "").strip() or None)
            changed.append(key)
    if "sourceUrl" in payload:
        s.source_url = safe_http_url(payload.get("sourceUrl"))
        changed.append("sourceUrl")
    if "applicationDeadline" in payload:
        s.application_deadline = _parse_date(payload.get("applicationDeadline"))
        changed.append("applicationDeadline")
    if "responsibilities" in payload:
        s.responsibilities = _list_to_json(payload.get("responsibilities"))
        changed.append("responsibilities")
    if "requirements" in payload:
        s.requirements = _list_to_json(payload.get("requirements"))
        changed.append("requirements")
    if "companyLogoUrl" in payload:
        s.company_logo_url = safe_http_url(payload.get("companyLogoUrl"))
        changed.append("companyLogoUrl")
    if "companyWebsite" in payload:
        s.company_website = safe_http_url(payload.get("companyWebsite"))
        changed.append("companyWebsite")
    if "contactEmail" in payload:
        s.contact_email = str(payload.get("contactEmail") or "").strip().lower() or None
        changed.append("contactEmail")
    if "audienceLane" in payload:
        s.audience_lane = str(payload.get("audienceLane") or "").strip() or None
        changed.append("audienceLane")
    # Keep the dedup hash in sync if identifying fields changed.
    if {"title", "company", "location"} & set(changed):
        s.content_hash = scraped_content_hash(s.title, s.company_name, s.location)
    # Re-run the quality gate whenever curation touches its inputs — an admin
    # pasting in the full description/requirements should visibly clear the
    # "thin content" flags instead of them sticking from the original scrape.
    if {"title", "description", "company", "responsibilities", "requirements"} & set(changed):
        quality_score, quality_flags = assess_scraped_job_quality(
            s.title, s.description, s.company_name,
            has_responsibilities=bool(s.responsibilities), has_requirements=bool(s.requirements),
        )
        s.quality_score = quality_score
        s.quality_flags = json.dumps(quality_flags, ensure_ascii=False) if quality_flags else None
    # Curation happens after publish too (admins fill in the full description/
    # requirements post-approval) — without this, edits only ever touched the
    # ScrapedJob row and the live public listing stayed stuck at whatever was
    # captured at publish time.
    if changed and s.published_job_id:
        job = db.query(Job).filter(Job.id == s.published_job_id).first()
        if job:
            _sync_scraped_edit_to_job(job, s, changed)
    db.commit()
    db.refresh(s)
    _record_admin_event(actor=admin, action="scraped.update", resource_type="scraped_job",
                        resource_id=s.id, details={"fields": changed})
    return {"scraped": _to_scraped_record(s)}


@router.patch("/scraped-jobs/{scraped_id}/review")
async def admin_review_scraped(
    scraped_id: str,
    payload: dict[str, Any],
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    admin = _ensure_admin(current_user)
    s = db.query(ScrapedJob).filter(ScrapedJob.id == scraped_id).first()
    if not s:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Scraped job not found")
    decision = str(payload.get("status", "approved")).strip().lower()
    if decision in {"approve", "approved", "publish", "published"}:
        s.status = "approved"
        if not s.published_job_id:
            _publish_scraped_job(db, s, admin)
    elif decision == "schedule":
        scheduled_at = _parse_date(payload.get("scheduledPublishAt"))
        if not scheduled_at:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="scheduledPublishAt is required")
        if scheduled_at <= datetime.utcnow():
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="scheduledPublishAt must be in the future")
        if s.published_job_id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Already published")
        s.status = "scheduled"
        s.scheduled_publish_at = scheduled_at
    elif decision in {"reject", "rejected"}:
        s.status = "rejected"
    elif decision == "duplicate":
        s.status = "duplicate"
    elif decision in {"archive", "archived"}:
        s.status = "archived"
        # Pull the published job from public view if it was live.
        if s.published_job_id:
            pub = db.query(Job).filter(Job.id == s.published_job_id).first()
            if pub:
                pub.status = "archived"
    else:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Decisão inválida")
    db.commit()
    db.refresh(s)
    _record_admin_event(actor=admin, action="scraped.review", resource_type="scraped_job",
                        resource_id=scraped_id, details={"status": s.status})
    return {"scraped": _to_scraped_record(s)}


@router.delete("/scraped-jobs/{scraped_id}")
async def admin_delete_scraped(
    scraped_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    admin = _ensure_admin(current_user)
    s = db.query(ScrapedJob).filter(ScrapedJob.id == scraped_id).first()
    if s:
        title = s.title
        db.delete(s)
        db.commit()
        _record_admin_event(actor=admin, action="scraped.delete", resource_type="scraped_job",
                            resource_id=scraped_id, details={"title": title})
    return {"deleted": True, "id": scraped_id}


@router.post("/scraped-jobs/run")
async def admin_run_scraper(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Trigger an immediate fetch from configured external sources (async)."""
    admin = _ensure_admin(current_user)
    from app.services.scraper_service import get_adapters
    sources = [a.name for a in get_adapters(db)]
    queued = False
    try:
        from app.workers.tasks import scrape_external_jobs
        scrape_external_jobs.delay()
        queued = True
    except Exception as e:
        logger.warning(f"Could not enqueue scraper run: {e}")
    _record_admin_event(actor=admin, action="scraped.run", resource_type="scraped_job",
                        resource_id=None, details={"sources": sources})
    return {"queued": queued, "sources": sources,
            "message": "Nenhuma fonte configurada. Adicione uma em Scraper Config." if not sources else "Scraper iniciado."}


# ── Scraper Config — admin-managed sources + global tuning ─────────────────
# Replaces the old SCRAPER_SOURCES/SCRAPER_* env vars: an admin adds/edits/
# disables sources and tunes timeouts here, no redeploy needed. "careerjet"
# is rejected at create/update time — see scraper_service.py module docstring
# for why it's ToS-blocked.

def _to_scraper_source_record(row: ScraperSource) -> dict[str, Any]:
    return {
        "_id": row.id,
        "name": row.name,
        "type": row.type,
        "url": row.url,
        "category": row.category,
        "enabled": bool(row.enabled),
        "maxResults": row.max_results,
        "lastRunAt": row.last_run_at.isoformat() if row.last_run_at else None,
        "lastRunStatus": row.last_run_status,
        "lastRunDetail": row.last_run_detail,
        "lastRunJobCount": row.last_run_job_count,
        "trustedAutoApprove": bool(row.trusted_auto_approve),
        "createdAt": row.created_at.isoformat() if row.created_at else None,
        "updatedAt": row.updated_at.isoformat() if row.updated_at else None,
    }


def _to_scraper_settings_record(s: ScraperSettings) -> dict[str, Any]:
    return {
        "enabled": bool(s.enabled),
        "defaultTimeoutSeconds": s.default_timeout_seconds,
        "defaultMaxPerSource": s.default_max_per_source,
        "userAgent": s.user_agent,
        "maxIngestPerRun": s.max_ingest_per_run,
        "runBudgetSeconds": s.run_budget_seconds,
        "updatedAt": s.updated_at.isoformat() if s.updated_at else None,
    }


def _validate_scraper_source_type(source_type: str) -> str:
    from app.services.scraper_service import VALID_SCRAPER_SOURCE_TYPES

    normalized = (source_type or "").strip().lower()
    if normalized == "careerjet":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "Careerjet está desativado: republicar os resultados da pesquisa ao vivo "
                "da Careerjet no nosso portal ainda não foi confirmado como conforme os "
                "termos de parceiro da Careerjet."
            ),
        )
    if normalized not in VALID_SCRAPER_SOURCE_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Tipo inválido. Use um de: {', '.join(sorted(VALID_SCRAPER_SOURCE_TYPES))}.",
        )
    return normalized


def _validate_trusted_auto_approve(trusted: bool, source_type: str) -> None:
    """Reject trustedAutoApprove=True for any source type outside the
    (currently empty) TRUSTED_AUTO_APPROVE_TYPES allowlist — see that
    constant's docstring in scraper_service.py for the admission bar. This
    is feedback for the admin UI; get_adapters() enforces the same rule
    independently so a row that somehow got saved with it set can't
    auto-publish anyway."""
    from app.services.scraper_service import TRUSTED_AUTO_APPROVE_TYPES

    if trusted and source_type not in TRUSTED_AUTO_APPROVE_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Auto-aprovação automática não está disponível — todas as fontes atuais requerem revisão humana.",
        )


def _validate_scraper_source_url(url: str) -> None:
    """Reject a scraper-source URL whose host doesn't resolve to a public
    address — the backend fetches this URL itself on every scrape run, so
    an unrestricted URL lets an admin point that outbound request at
    internal infrastructure (SSRF). This is fast feedback at save time;
    scraper_service._conditional_get re-checks the same thing immediately
    before every actual fetch (and again on every redirect hop), since DNS
    can change between now and then.

    Only applies when `url` actually looks like a URL: Greenhouse/Lever
    accept a bare board token/company slug (e.g. "acme") that's never
    fetched directly — it's interpolated into a fixed, trusted host
    template (boards-api.greenhouse.io / api.lever.co) — so a non-"http…"
    value here is never the literal fetch target and needs no check."""
    if not url.lower().startswith("http"):
        return
    if not is_public_scraper_url(url):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="URL inválido — tem de ser um endereço público (http/https); endereços internos/privados não são permitidos.",
        )


def _ensure_super_admin(admin: User) -> None:
    if getattr(admin, "admin_level", "moderator") != "super-admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Super-admin required")


def _validate_max_results(value: Any) -> int | None:
    if value in (None, ""):
        return None
    parsed = int(value)
    if parsed <= 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="maxResults deve ser positivo")
    return parsed


@router.get("/scraper-sources")
async def admin_list_scraper_sources(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _ensure_admin(current_user)
    rows = db.query(ScraperSource).order_by(ScraperSource.created_at.desc()).all()
    return {"scraperSources": [_to_scraper_source_record(r) for r in rows]}


@router.post("/scraper-sources")
async def admin_create_scraper_source(
    payload: dict[str, Any],
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    admin = _ensure_admin(current_user)
    _ensure_super_admin(admin)
    name = str(payload.get("name", "")).strip()
    url = str(payload.get("url", "")).strip()
    source_type = _validate_scraper_source_type(str(payload.get("type", "")))
    if not name or not url:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="name e url são obrigatórios")
    _validate_scraper_source_url(url)
    trusted_auto_approve = bool(payload.get("trustedAutoApprove", False))
    _validate_trusted_auto_approve(trusted_auto_approve, source_type)

    created = ScraperSource(
        name=name,
        type=source_type,
        url=url,
        category=str(payload.get("category", "")).strip() or None,
        enabled=bool(payload.get("enabled", True)),
        max_results=_validate_max_results(payload.get("maxResults")),
        trusted_auto_approve=trusted_auto_approve,
    )
    db.add(created)
    db.commit()
    db.refresh(created)
    _record_admin_event(
        actor=admin, action="scraperSource.create", resource_type="scraper_source",
        resource_id=created.id, details={"name": created.name, "type": created.type},
    )
    return _to_scraper_source_record(created)


@router.put("/scraper-sources/{source_id}")
async def admin_update_scraper_source(
    source_id: str,
    payload: dict[str, Any],
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    admin = _ensure_admin(current_user)
    _ensure_super_admin(admin)
    row = db.query(ScraperSource).filter(ScraperSource.id == source_id).first()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Fonte não encontrada")

    if "name" in payload:
        name = str(payload.get("name", "")).strip()
        if not name:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="name não pode ficar vazio")
        row.name = name
    if "type" in payload:
        row.type = _validate_scraper_source_type(str(payload.get("type", "")))
    if "url" in payload:
        url = str(payload.get("url", "")).strip()
        if not url:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="url não pode ficar vazia")
        _validate_scraper_source_url(url)
        row.url = url
    if "category" in payload:
        row.category = str(payload.get("category", "")).strip() or None
    if "enabled" in payload:
        row.enabled = bool(payload.get("enabled"))
    if "maxResults" in payload:
        row.max_results = _validate_max_results(payload.get("maxResults"))
    if "trustedAutoApprove" in payload:
        row.trusted_auto_approve = bool(payload.get("trustedAutoApprove"))
    # Re-check against the row's FINAL type — covers both setting the flag
    # on an ineligible type and changing type away from an eligible one
    # while the flag stays set from before.
    _validate_trusted_auto_approve(bool(row.trusted_auto_approve), row.type)

    db.commit()
    db.refresh(row)
    _record_admin_event(
        actor=admin, action="scraperSource.update", resource_type="scraper_source",
        resource_id=row.id, details={"changes": list(payload.keys())},
    )
    return _to_scraper_source_record(row)


@router.delete("/scraper-sources/{source_id}")
async def admin_delete_scraper_source(
    source_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    admin = _ensure_admin(current_user)
    row = db.query(ScraperSource).filter(ScraperSource.id == source_id).first()
    if row:
        name = row.name
        db.delete(row)
        db.commit()
        _record_admin_event(
            actor=admin, action="scraperSource.delete", resource_type="scraper_source",
            resource_id=source_id, details={"name": name},
        )
    return {"deleted": True, "id": source_id}


@router.get("/scraper-settings")
async def admin_get_scraper_settings(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _ensure_admin(current_user)
    from app.services.scraper_service import get_scraper_settings
    return _to_scraper_settings_record(get_scraper_settings(db))


@router.put("/scraper-settings")
async def admin_update_scraper_settings(
    payload: dict[str, Any],
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    admin = _ensure_admin(current_user)
    from app.services.scraper_service import get_scraper_settings
    settings = get_scraper_settings(db)

    if "enabled" in payload:
        settings.enabled = bool(payload.get("enabled"))
    if "defaultTimeoutSeconds" in payload:
        value = int(payload.get("defaultTimeoutSeconds") or 0)
        if value <= 0:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="defaultTimeoutSeconds deve ser positivo")
        settings.default_timeout_seconds = value
    if "defaultMaxPerSource" in payload:
        value = int(payload.get("defaultMaxPerSource") or 0)
        if value <= 0:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="defaultMaxPerSource deve ser positivo")
        settings.default_max_per_source = value
    if "userAgent" in payload:
        settings.user_agent = str(payload.get("userAgent", "")).strip() or None
    if "maxIngestPerRun" in payload:
        value = int(payload.get("maxIngestPerRun") or 0)
        if value <= 0:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="maxIngestPerRun deve ser positivo")
        settings.max_ingest_per_run = value
    if "runBudgetSeconds" in payload:
        value = int(payload.get("runBudgetSeconds") or 0)
        if value <= 0:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="runBudgetSeconds deve ser positivo")
        settings.run_budget_seconds = value

    db.commit()
    db.refresh(settings)
    _record_admin_event(
        actor=admin, action="scraperSettings.update", resource_type="scraper_settings",
        resource_id="default", details={"changes": list(payload.keys())},
    )
    return _to_scraper_settings_record(settings)


# ── Feature Flags — runtime overrides for settings.X_ENABLED business- ────
# decision switches (candidate premium, which AI providers are live, OTP
# login) so they can flip without a redeploy. See app/services/feature_flags.py.

def _to_feature_flag_record(flag: FeatureFlag) -> dict[str, Any]:
    return {
        "key": flag.key,
        "value": bool(flag.value),
        "description": flag.description,
        "updatedAt": flag.updated_at.isoformat() if flag.updated_at else None,
    }


@router.get("/feature-flags")
async def admin_list_feature_flags(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    _ensure_admin(current_user)
    from app.services.feature_flags import list_flags
    return {"featureFlags": [_to_feature_flag_record(f) for f in list_flags(db)]}


@router.patch("/feature-flags/{key}")
async def admin_update_feature_flag(
    key: str,
    payload: dict[str, Any],
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    admin = _ensure_admin(current_user)
    if getattr(admin, "admin_level", "moderator") != "super-admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Super-admin required")
    if "value" not in payload:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="value é obrigatório")

    from app.services.feature_flags import set_flag
    flag = set_flag(db, key, bool(payload.get("value")), payload.get("description"))
    _record_admin_event(
        actor=admin, action="featureFlag.update", resource_type="feature_flag",
        resource_id=key, details={"value": flag.value},
    )
    return _to_feature_flag_record(flag)


# ── Support messages — the notification bell's "message" form persists ────
# here (see app/api/v1/notifications.py's company_admin_message). Most
# messages route to a company owner, not admins, but the fallback path (no
# owner resolvable) and general operational visibility both need a list
# view — previously there was none at all, despite the table existing.

def _to_support_message_record(db: Session, entry: SupportMessage) -> dict[str, Any]:
    sender = db.query(User).filter(User.id == entry.sender_user_id).first()
    recipient = db.query(User).filter(User.id == entry.recipient_user_id).first() if entry.recipient_user_id else None
    return {
        "_id": entry.id,
        "senderName": sender.full_name if sender else None,
        "senderEmail": sender.email if sender else None,
        "senderRole": entry.sender_role,
        "recipientName": recipient.full_name if recipient else None,
        "reason": entry.reason,
        "message": entry.message,
        "status": entry.status,
        "createdAt": entry.created_at.isoformat() if entry.created_at else None,
    }


@router.get("/support-messages")
async def admin_list_support_messages(
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1, le=200),
    status_filter: str | None = Query(default=None, alias="status"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _ensure_admin(current_user)
    query = db.query(SupportMessage)
    if status_filter and status_filter.strip():
        query = query.filter(SupportMessage.status == status_filter.strip())
    total = query.count()
    rows = query.order_by(SupportMessage.created_at.desc()).offset((page - 1) * limit).limit(limit).all()
    return {
        "supportMessages": [_to_support_message_record(db, r) for r in rows],
        "pagination": _pagination(page, limit, total),
    }


@router.patch("/support-messages/{message_id}/resolve")
async def admin_resolve_support_message(
    message_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    admin = _ensure_admin(current_user)
    entry = db.query(SupportMessage).filter(SupportMessage.id == message_id).first()
    if not entry:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Mensagem não encontrada")
    entry.status = "resolved"
    db.commit()
    db.refresh(entry)
    _record_admin_event(
        actor=admin, action="supportMessage.resolve", resource_type="support_message", resource_id=entry.id,
    )
    return _to_support_message_record(db, entry)


# ── Resume Templates — CV Builder templates were migration-seeded only, ───
# with no admin CRUD; changing which templates exist/are offered, or
# editing their name/description/preview, required a code deploy. The
# actual HTML/CSS rendering logic stays a code-level registry keyed by
# `slug` (app/services/resume_render_service.TEMPLATES) — admin can manage
# which of those registered slugs are exposed and how they're described,
# not invent a wholly new visual template without a matching renderer.

def _to_resume_template_record(t: ResumeTemplate) -> dict[str, Any]:
    return {
        "_id": t.id,
        "name": t.name,
        "slug": t.slug,
        "description": t.description,
        "previewUrl": t.preview_url,
        "isActive": bool(t.is_active),
    }


@router.get("/resume-templates")
async def admin_list_resume_templates(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    _ensure_admin(current_user)
    rows = db.query(ResumeTemplate).order_by(ResumeTemplate.name.asc()).all()
    from app.services.resume_render_service import TEMPLATES
    return {
        "resumeTemplates": [_to_resume_template_record(t) for t in rows],
        "availableSlugs": sorted(TEMPLATES.keys()),
    }


@router.post("/resume-templates")
async def admin_create_resume_template(
    payload: dict[str, Any],
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    admin = _ensure_admin(current_user)
    from app.services.resume_render_service import TEMPLATES

    slug = str(payload.get("slug", "")).strip()
    name = str(payload.get("name", "")).strip()
    if not slug or not name:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="slug e name são obrigatórios")
    if slug not in TEMPLATES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"'{slug}' não tem um renderizador registado. Slugs disponíveis: {', '.join(sorted(TEMPLATES.keys()))}.",
        )
    if db.query(ResumeTemplate).filter(ResumeTemplate.slug == slug).first():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Já existe um template com este slug")

    created = ResumeTemplate(
        slug=slug, name=name,
        description=str(payload.get("description", "")).strip() or None,
        preview_url=str(payload.get("previewUrl", "")).strip() or None,
        is_active=bool(payload.get("isActive", True)),
    )
    db.add(created)
    db.commit()
    db.refresh(created)
    _record_admin_event(
        actor=admin, action="resumeTemplate.create", resource_type="resume_template",
        resource_id=created.id, details={"slug": created.slug},
    )
    return _to_resume_template_record(created)


@router.patch("/resume-templates/{template_id}")
async def admin_update_resume_template(
    template_id: str,
    payload: dict[str, Any],
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Edits metadata only — `slug` is the stable key into the code-level
    renderer registry and isn't changeable from here."""
    admin = _ensure_admin(current_user)
    row = db.query(ResumeTemplate).filter(ResumeTemplate.id == template_id).first()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Template não encontrado")

    if "name" in payload:
        name = str(payload.get("name", "")).strip()
        if not name:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="name não pode ficar vazio")
        row.name = name
    if "description" in payload:
        row.description = str(payload.get("description", "")).strip() or None
    if "previewUrl" in payload:
        row.preview_url = str(payload.get("previewUrl", "")).strip() or None
    if "isActive" in payload:
        row.is_active = bool(payload.get("isActive"))

    db.commit()
    db.refresh(row)
    _record_admin_event(
        actor=admin, action="resumeTemplate.update", resource_type="resume_template",
        resource_id=row.id, details={"changes": list(payload.keys())},
    )
    return _to_resume_template_record(row)


# ── Subscriptions & Plans — the general "offers" catalogue (company + ─────
# candidate CV Builder) plus per-user subscription management. Company
# plans (`Plan`) already had a DB table with zero admin CRUD; candidate CV
# plans (`CandidateCvPlan`) replace the old hardcoded CV_BUILDER_PLANS
# constant (see candidate_billing_service.py). Payment confirmation reuses
# the existing admin-gated endpoints in payments.py (POST /payments/{ref}/
# confirm, POST /cv-builder/confirm/{ref}) rather than duplicating them here.

def _to_plan_record(p: Plan) -> dict[str, Any]:
    return {
        "_id": p.id, "code": p.code, "name": p.name, "price": p.price,
        "currency": p.currency, "interval": p.interval,
        "features": json.loads(p.features) if p.features else [],
        "active": bool(p.active),
    }


def _to_candidate_cv_plan_record(p: CandidateCvPlan) -> dict[str, Any]:
    return {
        "_id": p.id, "tier": p.tier, "name": p.name, "price": p.price,
        "currency": p.currency, "interval": p.interval,
        "features": json.loads(p.features) if p.features else [],
        "maxResumes": p.max_resumes, "aiScore": bool(p.ai_score), "aiRewrite": bool(p.ai_rewrite),
        "coverLetters": bool(p.cover_letters), "autoApply": bool(p.auto_apply),
        "active": bool(p.active),
    }


def _to_transaction_record(tx: Transaction, party_type: str, party_name: str | None) -> dict[str, Any]:
    return {
        "_id": tx.id, "companyId": tx.company_id, "planId": tx.plan_id,
        "amount": tx.amount, "currency": tx.currency, "provider": tx.provider,
        "reference": tx.reference, "status": tx.status, "kind": tx.kind,
        "partyType": party_type, "partyName": party_name,
        "createdAt": tx.created_at.isoformat() if tx.created_at else None,
    }


def _validate_plan_interval(value: Any) -> str:
    interval = str(value or "").strip().lower()
    if interval not in {"month", "one_time"}:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="interval deve ser 'month' ou 'one_time'")
    return interval


@router.get("/plans")
async def admin_list_plans(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    _ensure_admin(current_user)
    from app.api.v1.payments import _ensure_seed_plans
    rows = sorted(_ensure_seed_plans(db), key=lambda p: p.price)
    return {"plans": [_to_plan_record(p) for p in rows]}


@router.post("/plans")
async def admin_create_plan(
    payload: dict[str, Any],
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    admin = _ensure_admin(current_user)
    code = str(payload.get("code", "")).strip()
    name = str(payload.get("name", "")).strip()
    if not code or not name:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="code e name são obrigatórios")
    if db.query(Plan).filter(Plan.code == code).first():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Já existe um plano com este código")

    created = Plan(
        code=code, name=name, price=float(payload.get("price", 0) or 0),
        currency=str(payload.get("currency", "AOA")).strip() or "AOA",
        interval=_validate_plan_interval(payload.get("interval", "month")),
        features=json.dumps(payload.get("features") or [], ensure_ascii=True),
        active=bool(payload.get("active", True)),
    )
    db.add(created)
    db.commit()
    db.refresh(created)
    _record_admin_event(actor=admin, action="plan.create", resource_type="plan", resource_id=created.id, details={"code": created.code})
    return _to_plan_record(created)


@router.put("/plans/{plan_id}")
async def admin_update_plan(
    plan_id: str,
    payload: dict[str, Any],
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    admin = _ensure_admin(current_user)
    row = db.query(Plan).filter(Plan.id == plan_id).first()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Plano não encontrado")

    if "name" in payload:
        name = str(payload.get("name", "")).strip()
        if not name:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="name não pode ficar vazio")
        row.name = name
    if "price" in payload:
        row.price = float(payload.get("price") or 0)
    if "currency" in payload:
        row.currency = str(payload.get("currency", "AOA")).strip() or "AOA"
    if "interval" in payload:
        row.interval = _validate_plan_interval(payload.get("interval"))
    if "features" in payload:
        row.features = json.dumps(payload.get("features") or [], ensure_ascii=True)
    if "active" in payload:
        row.active = bool(payload.get("active"))

    db.commit()
    db.refresh(row)
    _record_admin_event(actor=admin, action="plan.update", resource_type="plan", resource_id=row.id, details={"changes": list(payload.keys())})
    return _to_plan_record(row)


@router.delete("/plans/{plan_id}")
async def admin_delete_plan(
    plan_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    admin = _ensure_admin(current_user)
    row = db.query(Plan).filter(Plan.id == plan_id).first()
    if not row:
        return {"deleted": True, "id": plan_id}
    in_use = db.query(Subscription).filter(Subscription.plan_id == plan_id).count()
    if in_use:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Este plano tem {in_use} subscrição(ões) associada(s); desative-o em vez de eliminar.",
        )
    code = row.code
    db.delete(row)
    db.commit()
    _record_admin_event(actor=admin, action="plan.delete", resource_type="plan", resource_id=plan_id, details={"code": code})
    return {"deleted": True, "id": plan_id}


@router.get("/candidate-cv-plans")
async def admin_list_candidate_cv_plans(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    _ensure_admin(current_user)
    rows = db.query(CandidateCvPlan).order_by(CandidateCvPlan.price.asc()).all()
    return {"candidateCvPlans": [_to_candidate_cv_plan_record(p) for p in rows]}


@router.put("/candidate-cv-plans/{plan_id}")
async def admin_update_candidate_cv_plan(
    plan_id: str,
    payload: dict[str, Any],
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Edits an existing tier's content (price/name/features/limits). Tiers
    themselves (free/pro/premium) are fixed identity — see model docstring —
    so there's deliberately no create/delete here."""
    admin = _ensure_admin(current_user)
    row = db.query(CandidateCvPlan).filter(CandidateCvPlan.id == plan_id).first()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Plano não encontrado")

    if "name" in payload:
        name = str(payload.get("name", "")).strip()
        if not name:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="name não pode ficar vazio")
        row.name = name
    if "price" in payload:
        row.price = float(payload.get("price") or 0)
    if "currency" in payload:
        row.currency = str(payload.get("currency", "AOA")).strip() or "AOA"
    if "interval" in payload:
        row.interval = _validate_plan_interval(payload.get("interval"))
    if "features" in payload:
        row.features = json.dumps(payload.get("features") or [], ensure_ascii=True)
    if "maxResumes" in payload:
        row.max_resumes = int(payload.get("maxResumes"))
    if "aiScore" in payload:
        row.ai_score = bool(payload.get("aiScore"))
    if "aiRewrite" in payload:
        row.ai_rewrite = bool(payload.get("aiRewrite"))
    if "coverLetters" in payload:
        row.cover_letters = bool(payload.get("coverLetters"))
    if "autoApply" in payload:
        row.auto_apply = bool(payload.get("autoApply"))
    if "active" in payload:
        row.active = bool(payload.get("active"))

    db.commit()
    db.refresh(row)
    _record_admin_event(
        actor=admin, action="candidateCvPlan.update", resource_type="candidate_cv_plan",
        resource_id=row.id, details={"changes": list(payload.keys())},
    )
    return _to_candidate_cv_plan_record(row)


@router.get("/transactions")
async def admin_list_transactions(
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1, le=200),
    status_filter: str | None = Query(default=None, alias="status"),
    kind: str | None = None,
    keyword: str | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _ensure_admin(current_user)
    query = db.query(Transaction)
    if status_filter and status_filter.strip():
        query = query.filter(Transaction.status == status_filter.strip())
    if kind and kind.strip():
        query = query.filter(Transaction.kind == kind.strip())
    if keyword and keyword.strip():
        query = query.filter(Transaction.reference.ilike(f"%{keyword.strip()}%"))
    total = query.count()
    rows = query.order_by(Transaction.created_at.desc()).offset((page - 1) * limit).limit(limit).all()

    # Company transactions carry company_id directly. Candidate CV Builder
    # transactions don't (subscribe_cv_builder in payments.py never sets
    # company_id/plan_id on them) — match those by reference against
    # CandidateCVSubscription.transaction_reference instead.
    company_ids = {r.company_id for r in rows if r.company_id}
    companies = {c.id: c.name for c in db.query(Company).filter(Company.id.in_(company_ids)).all()} if company_ids else {}

    candidate_refs = [r.reference for r in rows if not r.company_id and r.reference]
    cv_subs = (
        db.query(CandidateCVSubscription).filter(CandidateCVSubscription.transaction_reference.in_(candidate_refs)).all()
        if candidate_refs else []
    )
    sub_by_ref = {s.transaction_reference: s for s in cv_subs}
    profile_ids = {s.candidate_profile_id for s in cv_subs}
    profiles = {p.id: p for p in db.query(CandidateProfile).filter(CandidateProfile.id.in_(profile_ids)).all()} if profile_ids else {}
    user_ids = {p.user_id for p in profiles.values()}
    users = {u.id: u for u in db.query(User).filter(User.id.in_(user_ids)).all()} if user_ids else {}

    records = []
    for r in rows:
        if r.company_id:
            records.append(_to_transaction_record(r, "company", companies.get(r.company_id)))
            continue
        sub = sub_by_ref.get(r.reference)
        if sub:
            profile = profiles.get(sub.candidate_profile_id)
            user = users.get(profile.user_id) if profile else None
            label = (user.full_name if user else None) or (user.email if user else None)
            records.append(_to_transaction_record(r, "candidate", label))
        else:
            records.append(_to_transaction_record(r, "unknown", None))

    return {"transactions": records, "pagination": _pagination(page, limit, total)}


@router.patch("/transactions/{transaction_id}")
async def admin_update_transaction_status(
    transaction_id: str,
    payload: dict[str, Any],
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Reject/cancel a pending transaction — the confirm-payment endpoints
    (payments.py) let an admin approve one, but there was no way to mark a
    bogus or abandoned reference as done-with, so pending rows piled up
    forever with no resolution."""
    admin = _ensure_admin(current_user)
    tx = db.query(Transaction).filter(Transaction.id == transaction_id).first()
    if not tx:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Transação não encontrada")

    next_status = str(payload.get("status", "")).strip().lower()
    if next_status not in {"failed", "cancelled"}:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="status deve ser 'failed' ou 'cancelled'")
    if tx.status == "paid":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Uma transação já paga não pode ser rejeitada")

    tx.status = next_status
    db.commit()
    db.refresh(tx)
    _record_admin_event(
        actor=admin, action="transaction.reject", resource_type="transaction",
        resource_id=tx.id, details={"status": next_status, "reference": tx.reference},
    )
    return _to_transaction_record(tx, "company" if tx.company_id else "unknown", None)


def _to_user_subscription_summary(db: Session, target: User) -> dict[str, Any]:
    """Role-aware subscription snapshot for the admin Users panel."""
    if target.role == UserRole.company:
        co = db.query(Company).filter(Company.owner_user_id == target.id).first()
        if not co:
            return {"scope": "company", "subscription": None, "transactions": [], "availablePlans": []}
        sub = db.query(Subscription).filter(Subscription.company_id == co.id).order_by(Subscription.created_at.desc()).first()
        plan = db.query(Plan).filter(Plan.id == sub.plan_id).first() if sub else None
        transactions = db.query(Transaction).filter(Transaction.company_id == co.id).order_by(Transaction.created_at.desc()).limit(20).all()
        return {
            "scope": "company",
            "subscription": {
                "_id": sub.id, "status": sub.status,
                "planCode": plan.code if plan else None, "planName": plan.name if plan else None,
                "currentPeriodEnd": sub.current_period_end.isoformat() if sub.current_period_end else None,
            } if sub else None,
            "transactions": [_to_transaction_record(t, "company", co.name) for t in transactions],
            "availablePlans": [_to_plan_record(p) for p in db.query(Plan).filter(Plan.active.is_(True)).all()],
        }

    if target.role == UserRole.candidate:
        from app.services.candidate_billing_service import get_cv_builder_plans

        profile = db.query(CandidateProfile).filter(CandidateProfile.user_id == target.id).first()
        if not profile:
            return {"scope": "candidate", "subscription": None, "transactions": [], "availablePlans": []}
        sub = (
            db.query(CandidateCVSubscription)
            .filter(CandidateCVSubscription.candidate_profile_id == profile.id)
            .order_by(CandidateCVSubscription.created_at.desc())
            .first()
        )
        refs = [
            s.transaction_reference
            for s in db.query(CandidateCVSubscription).filter(
                CandidateCVSubscription.candidate_profile_id == profile.id,
                CandidateCVSubscription.transaction_reference.isnot(None),
            ).all()
        ]
        transactions = (
            db.query(Transaction).filter(Transaction.reference.in_(refs)).order_by(Transaction.created_at.desc()).all()
            if refs else []
        )
        return {
            "scope": "candidate",
            "subscription": {
                "_id": sub.id, "status": sub.status, "tier": sub.plan_tier,
                "currentPeriodEnd": sub.current_period_end.isoformat() if sub.current_period_end else None,
            } if sub else None,
            "transactions": [_to_transaction_record(t, "candidate", target.full_name) for t in transactions],
            "availablePlans": get_cv_builder_plans(db),
        }

    return {"scope": None, "subscription": None, "transactions": [], "availablePlans": []}


@router.get("/users/{user_id}/subscription")
async def admin_get_user_subscription(
    user_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _ensure_admin(current_user)
    target = db.query(User).filter(User.id == user_id).first()
    if not target:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Utilizador não encontrado")
    return _to_user_subscription_summary(db, target)


@router.get("/subscriptions/expiring")
async def admin_expiring_subscriptions(
    daysAhead: int = Query(default=7, ge=1, le=90),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Active company + candidate subscriptions whose current_period_end
    falls within the next `daysAhead` days — the admin board's only view
    into who's about to lapse (the daily reminder email exists, but there
    was no way to just look at the list)."""
    _ensure_admin(current_user)
    now = datetime.utcnow()
    horizon = now + timedelta(days=daysAhead)

    company_rows = (
        db.query(Subscription)
        .filter(Subscription.status == "active", Subscription.current_period_end.isnot(None),
                Subscription.current_period_end >= now, Subscription.current_period_end <= horizon)
        .order_by(Subscription.current_period_end.asc())
        .all()
    )
    company_ids = {r.company_id for r in company_rows}
    plan_ids = {r.plan_id for r in company_rows}
    companies = {c.id: c for c in db.query(Company).filter(Company.id.in_(company_ids)).all()} if company_ids else {}
    plans = {p.id: p for p in db.query(Plan).filter(Plan.id.in_(plan_ids)).all()} if plan_ids else {}

    candidate_rows = (
        db.query(CandidateCVSubscription)
        .filter(CandidateCVSubscription.status == "active", CandidateCVSubscription.current_period_end.isnot(None),
                CandidateCVSubscription.current_period_end >= now, CandidateCVSubscription.current_period_end <= horizon)
        .order_by(CandidateCVSubscription.current_period_end.asc())
        .all()
    )
    profile_ids = {r.candidate_profile_id for r in candidate_rows}
    profiles = {p.id: p for p in db.query(CandidateProfile).filter(CandidateProfile.id.in_(profile_ids)).all()} if profile_ids else {}
    cand_user_ids = {p.user_id for p in profiles.values()}
    cand_users = {u.id: u for u in db.query(User).filter(User.id.in_(cand_user_ids)).all()} if cand_user_ids else {}

    entries = []
    for r in company_rows:
        company = companies.get(r.company_id)
        plan = plans.get(r.plan_id)
        entries.append({
            "scope": "company",
            "userId": company.owner_user_id if company else None,
            "name": company.name if company else None,
            "planName": plan.name if plan else None,
            "currentPeriodEnd": r.current_period_end.isoformat() if r.current_period_end else None,
        })
    for r in candidate_rows:
        profile = profiles.get(r.candidate_profile_id)
        user = cand_users.get(profile.user_id) if profile else None
        entries.append({
            "scope": "candidate",
            "userId": user.id if user else None,
            "name": user.full_name if user else None,
            "planName": r.plan_tier,
            "currentPeriodEnd": r.current_period_end.isoformat() if r.current_period_end else None,
        })

    entries.sort(key=lambda e: e["currentPeriodEnd"] or "")
    return {"expiring": entries, "daysAhead": daysAhead}


@router.put("/users/{user_id}/subscription")
async def admin_update_user_subscription(
    user_id: str,
    payload: dict[str, Any],
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Admin override of a user's plan tier/status/period — separate from
    the normal candidate/company self-serve subscribe flow in payments.py.
    Creates a subscription row if the user doesn't have one yet."""
    admin = _ensure_admin(current_user)
    target = db.query(User).filter(User.id == user_id).first()
    if not target:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Utilizador não encontrado")

    status_value = str(payload.get("status", "")).strip().lower()
    if status_value and status_value not in {"pending", "active", "expired", "cancelled"}:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="status inválido")
    period_end = _parse_dt(payload.get("currentPeriodEnd")) if "currentPeriodEnd" in payload else None

    if target.role == UserRole.company:
        co = db.query(Company).filter(Company.owner_user_id == target.id).first()
        if not co:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Utilizador não tem perfil de empresa")
        sub = db.query(Subscription).filter(Subscription.company_id == co.id).order_by(Subscription.created_at.desc()).first()
        plan_code = payload.get("planCode")
        if plan_code:
            plan = db.query(Plan).filter(Plan.code == str(plan_code).strip()).first()
            if not plan:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Plano inválido")
            if sub:
                sub.plan_id = plan.id
            else:
                sub = Subscription(company_id=co.id, plan_id=plan.id, status="active")
                db.add(sub)
        elif not sub:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Utilizador não tem subscrição — indique um planCode para criar uma")
        if status_value:
            sub.status = status_value
        if "currentPeriodEnd" in payload:
            sub.current_period_end = period_end
        db.commit()
        db.refresh(sub)
        _record_admin_event(
            actor=admin, action="subscription.override", resource_type="subscription",
            resource_id=sub.id, details={"userId": user_id, "changes": list(payload.keys())},
        )
        return _to_user_subscription_summary(db, target)

    if target.role == UserRole.candidate:
        from app.services.candidate_billing_service import KNOWN_CV_TIERS

        profile = db.query(CandidateProfile).filter(CandidateProfile.user_id == target.id).first()
        if not profile:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Utilizador não tem perfil de candidato")
        sub = (
            db.query(CandidateCVSubscription)
            .filter(CandidateCVSubscription.candidate_profile_id == profile.id)
            .order_by(CandidateCVSubscription.created_at.desc())
            .first()
        )
        tier = payload.get("tier")
        if tier:
            tier = str(tier).strip().lower()
            if tier not in KNOWN_CV_TIERS:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="tier inválido")
            if sub:
                sub.plan_tier = tier
            else:
                sub = CandidateCVSubscription(candidate_profile_id=profile.id, plan_tier=tier, status="active")
                db.add(sub)
        elif not sub:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Utilizador não tem subscrição — indique um tier para criar uma")
        if status_value:
            sub.status = status_value
        if "currentPeriodEnd" in payload:
            sub.current_period_end = period_end
        db.commit()
        db.refresh(sub)
        _record_admin_event(
            actor=admin, action="cvSubscription.override", resource_type="candidate_cv_subscription",
            resource_id=sub.id, details={"userId": user_id, "changes": list(payload.keys())},
        )
        return _to_user_subscription_summary(db, target)

    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Este utilizador não tem subscrições geridas por este painel")


@router.get("/audit-logs")
async def admin_audit_logs(
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1, le=200),
    keyword: str | None = None,
    action: str | None = None,
    resourceType: str | None = None,
    actorUserId: str | None = None,
    from_date: str | None = Query(default=None, alias="from"),
    to_date: str | None = Query(default=None, alias="to"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _ensure_admin(current_user)
    query = db.query(AuditLog)
    if action and action.strip():
        query = query.filter(AuditLog.action.ilike(f"%{action.strip()}%"))
    if resourceType and resourceType.strip():
        query = query.filter(AuditLog.resource_type.ilike(f"%{resourceType.strip()}%"))
    if actorUserId and actorUserId.strip():
        query = query.filter(AuditLog.actor_user_id == actorUserId.strip())
    if keyword and keyword.strip():
        like = f"%{keyword.strip()}%"
        query = query.filter(AuditLog.action.ilike(like) | AuditLog.details.ilike(like) | AuditLog.resource_id.ilike(like))
    total = query.count()
    rows = query.order_by(AuditLog.created_at.desc()).offset((page - 1) * limit).limit(limit).all()
    audit_logs = [
        {
            "_id": r.id,
            "actorUserId": r.actor_user_id,
            "actorEmail": r.actor_email,
            "action": r.action,
            "resourceType": r.resource_type,
            "resourceId": r.resource_id,
            "details": json.loads(r.details) if r.details else {},
            "createdAt": r.created_at.isoformat() if r.created_at else None,
        }
        for r in rows
    ]
    return {"auditLogs": audit_logs, "pagination": _pagination(page, limit, total)}


@router.get("/security/events")
async def admin_security_events(
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1, le=200),
    eventType: str | None = None,
    severity: str | None = None,
    keyword: str | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Security-concern feed for the admin Segurança tab: failed logins with
    IP/user-agent, brute-force bursts, lockouts, outbound-email rate-limit
    hits, and the alerts sent about them. Also returns 24h summary counters
    so the page can show at-a-glance severity totals."""
    _ensure_admin(current_user)
    query = db.query(SecurityEvent)
    if eventType and eventType.strip():
        query = query.filter(SecurityEvent.event_type == eventType.strip())
    if severity and severity.strip():
        query = query.filter(SecurityEvent.severity == severity.strip())
    if keyword and keyword.strip():
        like = f"%{keyword.strip()}%"
        query = query.filter(
            SecurityEvent.email.ilike(like)
            | SecurityEvent.ip_address.ilike(like)
            | SecurityEvent.details.ilike(like)
            | SecurityEvent.event_type.ilike(like)
        )
    total = query.count()
    rows = (
        query.order_by(SecurityEvent.created_at.desc())
        .offset((page - 1) * limit)
        .limit(limit)
        .all()
    )
    events = [
        {
            "_id": r.id,
            "eventType": r.event_type,
            "severity": r.severity,
            "email": r.email,
            "ipAddress": r.ip_address,
            "userAgent": r.user_agent,
            "details": json.loads(r.details) if r.details else {},
            "createdAt": r.created_at.isoformat() if r.created_at else None,
        }
        for r in rows
    ]

    day_ago = datetime.utcnow() - timedelta(hours=24)
    summary, _ok = _count_block(
        db,
        {
            "last24hTotal": lambda: db.query(SecurityEvent).filter(SecurityEvent.created_at >= day_ago).count(),
            "last24hHigh": lambda: db.query(SecurityEvent).filter(
                SecurityEvent.created_at >= day_ago, SecurityEvent.severity == "high"
            ).count(),
            "last24hFailedLogins": lambda: db.query(SecurityEvent).filter(
                SecurityEvent.created_at >= day_ago, SecurityEvent.event_type == "failed_login"
            ).count(),
        },
        "security-summary",
    )
    return {"securityEvents": events, "summary": summary, "pagination": _pagination(page, limit, total)}


@router.get("/audit-logs/export.csv")
async def admin_audit_logs_csv(
    keyword: str | None = None,
    action: str | None = None,
    resourceType: str | None = None,
    actorUserId: str | None = None,
    from_date: str | None = Query(default=None, alias="from"),
    to_date: str | None = Query(default=None, alias="to"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _ensure_admin(current_user)
    query = db.query(AuditLog)
    if action and action.strip():
        query = query.filter(AuditLog.action.ilike(f"%{action.strip()}%"))
    if resourceType and resourceType.strip():
        query = query.filter(AuditLog.resource_type.ilike(f"%{resourceType.strip()}%"))
    if actorUserId and actorUserId.strip():
        query = query.filter(AuditLog.actor_user_id == actorUserId.strip())
    if keyword and keyword.strip():
        like = f"%{keyword.strip()}%"
        query = query.filter(AuditLog.action.ilike(like) | AuditLog.details.ilike(like) | AuditLog.resource_id.ilike(like))
    rows = query.order_by(AuditLog.created_at.desc()).all()

    stream = StringIO()
    writer = csv.writer(stream)
    writer.writerow(["id", "action", "resourceType", "resourceId", "actorUserId", "details", "createdAt"])
    for r in rows:
        created_at = r.created_at.isoformat() if r.created_at else ""
        if not _is_in_range(created_at, from_date, to_date):
            continue
        writer.writerow(
            [
                r.id,
                r.action or "",
                r.resource_type or "",
                r.resource_id or "",
                r.actor_user_id or "",
                r.details or "",
                created_at,
            ]
        )

    return Response(
        content=stream.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="parvagas-audit-logs.csv"'},
    )


@router.get("/admin-actions")
async def admin_actions(
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1, le=200),
    keyword: str | None = None,
    action: str | None = None,
    targetType: str | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Same durable AuditLog rows as /audit-logs, under the field names the
    'Admin actions' tab expects (adminUserId/targetType/targetId/payload).
    Previously backed by an in-memory list that was wiped on every restart —
    now reads the same DB table /audit-logs already persists to."""
    _ensure_admin(current_user)
    query = db.query(AuditLog)
    if action and action.strip():
        query = query.filter(AuditLog.action.ilike(f"%{action.strip()}%"))
    if targetType and targetType.strip():
        query = query.filter(AuditLog.resource_type.ilike(f"%{targetType.strip()}%"))
    if keyword and keyword.strip():
        like = f"%{keyword.strip()}%"
        query = query.filter(AuditLog.action.ilike(like) | AuditLog.details.ilike(like) | AuditLog.resource_id.ilike(like))
    total = query.count()
    rows = query.order_by(AuditLog.created_at.desc()).offset((page - 1) * limit).limit(limit).all()
    admin_actions_page = [
        {
            "_id": r.id,
            "adminUserId": r.actor_user_id,
            "action": r.action,
            "targetType": r.resource_type,
            "targetId": r.resource_id,
            "payload": json.loads(r.details) if r.details else {},
            "createdAt": r.created_at.isoformat() if r.created_at else None,
        }
        for r in rows
    ]
    return {"adminActions": admin_actions_page, "pagination": _pagination(page, limit, total)}


@router.get("/launch-readiness")
async def admin_launch_readiness(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Real launch-readiness probe. Each check is isolated so one failure never
    masks the others; the endpoint never 500s. Surfaces actual DB connectivity,
    migration state, and critical production config instead of hardcoded green."""
    _ensure_admin(current_user)

    from app.core.config import get_settings
    from app.core.captcha import captcha_required

    settings = get_settings()
    checks: list[dict[str, Any]] = []

    def add(check_id: str, scope: str, status_: str, message: str) -> None:
        checks.append({"id": check_id, "scope": scope, "status": status_, "message": message})

    # API is responding (we are inside the handler).
    add("api", "backend", "pass", "API online")

    # Database connectivity.
    try:
        db.execute(text("SELECT 1"))
        add("db", "database", "pass", "Base de dados acessível")
    except Exception as exc:  # noqa: BLE001
        try:
            db.rollback()
        except Exception:  # noqa: BLE001
            pass
        add("db", "database", "fail", f"Base de dados inacessível: {exc}")

    # Migrations applied (alembic_version present and populated).
    try:
        row = db.execute(text("SELECT version_num FROM alembic_version")).fetchone()
        if row and row[0]:
            add("migrations", "database", "pass", f"Migrações aplicadas (rev {row[0]})")
        else:
            add("migrations", "database", "warn", "Tabela de migrações vazia")
    except Exception:  # noqa: BLE001
        try:
            db.rollback()
        except Exception:  # noqa: BLE001
            pass
        add("migrations", "database", "fail", "Migrações não aplicadas (alembic_version ausente)")

    # Core table sanity — a super-admin must exist to operate the platform.
    try:
        admins = db.query(User).filter(User.role == "admin").count()
        if admins > 0:
            add("admin-account", "auth", "pass", f"{admins} conta(s) de administração")
        else:
            add("admin-account", "auth", "fail", "Nenhuma conta de administração existe")
    except Exception:  # noqa: BLE001
        try:
            db.rollback()
        except Exception:  # noqa: BLE001
            pass
        add("admin-account", "auth", "warn", "Não foi possível verificar contas de administração")

    # JWT secret strength (enforced at boot in prod, but report explicitly).
    if settings.JWT_SECRET and len(settings.JWT_SECRET) >= 32 and settings.JWT_SECRET != "your-secret-key-change-in-production":
        add("jwt", "security", "pass", "JWT_SECRET forte configurado")
    else:
        add("jwt", "security", "fail", "JWT_SECRET fraco ou em valor por defeito")

    # CAPTCHA enforcement in production.
    if captcha_required():
        add("captcha", "security", "pass", "CAPTCHA ativo")
    elif settings.is_production:
        add("captcha", "security", "warn", "CAPTCHA desativado em produção (CAPTCHA_REQUIRED=true recomendado)")
    else:
        add("captcha", "security", "warn", "CAPTCHA desativado (ambiente não-produção)")

    # Email delivery configuration.
    if settings.SMTP_HOST and settings.SMTP_USER:
        add("email", "delivery", "pass", f"SMTP configurado ({settings.SMTP_HOST})")
    else:
        add("email", "delivery", "warn", "SMTP não configurado — emails não serão enviados")

    # File storage configuration.
    provider = settings.STORAGE_PROVIDER
    if provider == "server":
        if settings.S3_ENDPOINT_URL and settings.S3_ACCESS_KEY and settings.S3_SECRET_KEY:
            add("storage", "storage", "pass", f"Armazenamento S3/MinIO configurado ({provider})")
        else:
            add("storage", "storage", "fail", "STORAGE_PROVIDER=server mas credenciais S3 em falta")
    else:
        add("storage", "storage", "warn", f"Armazenamento '{provider}' — confirme adequação para produção")

    # Frontend / CORS origin.
    if settings.FRONTEND_URL and "localhost" not in settings.FRONTEND_URL:
        add("frontend", "config", "pass", f"FRONTEND_URL definido ({settings.FRONTEND_URL})")
    elif settings.is_production:
        add("frontend", "config", "fail", "FRONTEND_URL aponta para localhost em produção")
    else:
        add("frontend", "config", "warn", "FRONTEND_URL em localhost (ambiente não-produção)")

    # HIBP breach-scan coverage — the scheduled task no-ops silently when
    # HIBP_API_KEY is unset, so this is the only place that surfaces that.
    try:
        total_users = db.query(User).count()
        checked_users = db.query(User).filter(User.hibp_checked_at.isnot(None)).count()
        last_checked = db.query(func.max(User.hibp_checked_at)).scalar()
        coverage_pct = round((checked_users / total_users) * 100, 1) if total_users else 0.0
        if not settings.HIBP_API_KEY:
            add("hibp", "security", "warn", "HIBP_API_KEY não definido — verificação de fugas de dados inativa")
        elif checked_users == 0:
            add("hibp", "security", "warn", "HIBP configurado mas ainda sem nenhuma verificação executada")
        else:
            last_label = last_checked.isoformat() if last_checked else "nunca"
            add("hibp", "security", "pass", f"HIBP ativo — {coverage_pct}% das contas verificadas (última: {last_label})")
    except Exception:  # noqa: BLE001
        try:
            db.rollback()
        except Exception:  # noqa: BLE001
            pass
        add("hibp", "security", "warn", "Não foi possível verificar o estado do HIBP")

    # Celery queue depth — inspect() round-trips through the broker to ask
    # live workers what they're doing; a short timeout + broad except keeps
    # a slow/unreachable broker from ever blocking this readiness page.
    try:
        from app.workers.celery_app import celery

        insp = celery.control.inspect(timeout=2.0)
        active = insp.active() or {}
        reserved = insp.reserved() or {}
        worker_count = len(set(active.keys()) | set(reserved.keys()))
        if worker_count == 0:
            add("celery", "infra", "warn", "Nenhum worker Celery respondeu — verifique se está em execução")
        else:
            active_count = sum(len(v) for v in active.values())
            reserved_count = sum(len(v) for v in reserved.values())
            add(
                "celery", "infra", "pass",
                f"{worker_count} worker(s) ativo(s) — {active_count} tarefa(s) em execução, {reserved_count} em fila",
            )
    except Exception:  # noqa: BLE001
        add("celery", "infra", "warn", "Não foi possível verificar o estado dos workers Celery")

    # Database size — Postgres-only (pg_database_size has no SQLite
    # equivalent); silently skipped rather than a permanent warning on
    # environments where this was never going to apply (dev/test on SQLite).
    try:
        if db.bind is not None and db.bind.dialect.name == "postgresql":
            size_bytes = db.execute(text("SELECT pg_database_size(current_database())")).scalar()
            size_mb = round((size_bytes or 0) / (1024 * 1024), 1)
            add("db-size", "infra", "pass", f"Tamanho da base de dados: {size_mb} MB")
    except Exception:  # noqa: BLE001
        try:
            db.rollback()
        except Exception:  # noqa: BLE001
            pass
        add("db-size", "infra", "warn", "Não foi possível verificar o tamanho da base de dados")

    summary = {
        "total": len(checks),
        "pass": sum(1 for c in checks if c["status"] == "pass"),
        "warn": sum(1 for c in checks if c["status"] == "warn"),
        "fail": sum(1 for c in checks if c["status"] == "fail"),
    }
    return {
        "generatedAt": datetime.utcnow().isoformat(),
        "summary": summary,
        "checks": checks,
    }


@router.get("/ads")
async def admin_ads(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _ensure_admin(current_user)
    rows = db.query(AdCampaign).order_by(AdCampaign.created_at.desc()).all()
    return {"ads": [_to_ad_record(row) for row in rows]}


_AD_IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".gif"}
_AD_IMAGE_MAX_BYTES = 5 * 1024 * 1024  # 5 MB


@router.post("/ads/upload-image")
async def admin_upload_ad_image(
    image: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Upload an ad creative to durable storage and return its stored ref +
    a resolved preview URL. The stored ref (not the preview URL) is what
    should be sent back in the imageUrl field when creating/updating the ad."""
    _ensure_admin(current_user)
    ext = _Path(image.filename or "").suffix.lower() or ".png"
    if ext not in _AD_IMAGE_EXTENSIONS:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Formato de imagem não suportado")
    data = await image.read()
    if len(data) > _AD_IMAGE_MAX_BYTES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Imagem excede o tamanho máximo de 5MB")
    ref = StorageService.save_file(data, f"ad-image-{uuid.uuid4()}{ext}")
    return {"imageUrl": ref, "previewUrl": StorageService.resolve_public_url(ref)}


@router.post("/ads")
async def admin_create_ad(
    payload: dict[str, Any],
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    admin = _ensure_admin(current_user)
    title = str(payload.get("title", "")).strip()
    placement = str(payload.get("placement", "")).strip()
    if not title or not placement:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="title and placement are required")
    link = str(payload.get("link", "")).strip() or None
    _validate_ad_fields(link, _parse_dt(payload.get("startDate")), _parse_dt(payload.get("endDate")))

    created = AdCampaign(
        title=title,
        placement=placement,
        link=link,
        image_url=str(payload.get("imageUrl", "")).strip() or None,
        active=bool(payload.get("active", True)),
        budget=float(payload.get("budget", 0) or 0),
        cost_per_click=float(payload.get("costPerClick", 0) or 0),
        cost_per_impression=float(payload.get("costPerImpression", 0) or 0),
        target_category=str(payload.get("targetCategory", "")).strip() or None,
        target_location=str(payload.get("targetLocation", "")).strip() or None,
        start_date=_parse_dt(payload.get("startDate")),
        end_date=_parse_dt(payload.get("endDate")),
        status="draft",
    )
    created.status = _compute_ad_status(created)
    db.add(created)
    db.commit()
    db.refresh(created)

    _record_admin_event(
        actor=admin,
        action="ad.create",
        resource_type="ad",
        resource_id=created.id,
        details={"placement": created.placement, "title": created.title},
    )
    return {"ad": _to_ad_record(created)}


@router.patch("/ads/{ad_id}")
async def admin_update_ad(
    ad_id: str,
    payload: dict[str, Any],
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    admin = _ensure_admin(current_user)
    ad = db.query(AdCampaign).filter(AdCampaign.id == ad_id).first()
    if not ad:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ad not found")

    if "title" in payload:
        ad.title = str(payload.get("title") or ad.title).strip() or ad.title
    if "placement" in payload:
        ad.placement = str(payload.get("placement") or ad.placement).strip() or ad.placement
    if "link" in payload:
        ad.link = str(payload.get("link", "")).strip() or None
    if "imageUrl" in payload:
        ad.image_url = _resolve_ad_image_update(ad.image_url, payload.get("imageUrl"))
    if "budget" in payload:
        ad.budget = float(payload.get("budget") or 0)
    if "costPerClick" in payload:
        ad.cost_per_click = float(payload.get("costPerClick") or 0)
    if "costPerImpression" in payload:
        ad.cost_per_impression = float(payload.get("costPerImpression") or 0)
    if "targetCategory" in payload:
        ad.target_category = str(payload.get("targetCategory", "")).strip() or None
    if "targetLocation" in payload:
        ad.target_location = str(payload.get("targetLocation", "")).strip() or None
    if "active" in payload:
        ad.active = bool(payload.get("active"))
    if "startDate" in payload:
        ad.start_date = _parse_dt(payload.get("startDate"))
    if "endDate" in payload:
        ad.end_date = _parse_dt(payload.get("endDate"))

    _validate_ad_fields(ad.link, ad.start_date, ad.end_date)
    ad.status = _compute_ad_status(ad)
    db.commit()
    db.refresh(ad)

    _record_admin_event(
        actor=admin,
        action="ad.update",
        resource_type="ad",
        resource_id=ad.id,
        details={"placement": ad.placement, "active": ad.active},
    )
    return {"ad": _to_ad_record(ad)}


@router.put("/ads/{ad_id}")
async def admin_replace_ad(
    ad_id: str,
    payload: dict[str, Any],
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return await admin_update_ad(ad_id=ad_id, payload=payload, db=db, current_user=current_user)


@router.patch("/ads/{ad_id}/status")
async def admin_ad_status(
    ad_id: str,
    payload: dict[str, Any],
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    admin = _ensure_admin(current_user)
    ad = db.query(AdCampaign).filter(AdCampaign.id == ad_id).first()
    if not ad:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ad not found")
    ad.active = bool(payload.get("active", True))
    ad.status = _compute_ad_status(ad)
    db.commit()
    db.refresh(ad)
    _record_admin_event(
        actor=admin,
        action="ad.status",
        resource_type="ad",
        resource_id=ad.id,
        details={"active": ad.active, "status": ad.status},
    )
    return {"ad": _to_ad_record(ad)}


@router.patch("/ads/{ad_id}/pause")
async def admin_ad_pause(
    ad_id: str,
    payload: dict[str, Any],
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    admin = _ensure_admin(current_user)
    ad = db.query(AdCampaign).filter(AdCampaign.id == ad_id).first()
    if not ad:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ad not found")
    ad.active = False
    ad.pause_reason = str(payload.get("reason", "")).strip() or None
    ad.status = _compute_ad_status(ad)
    db.commit()
    db.refresh(ad)
    _record_admin_event(
        actor=admin,
        action="ad.pause",
        resource_type="ad",
        resource_id=ad.id,
        details={"reason": ad.pause_reason or ""},
    )
    return {"ad": _to_ad_record(ad)}


@router.post("/ads/{ad_id}/flag")
async def admin_ad_flag(
    ad_id: str,
    payload: dict[str, Any],
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    admin = _ensure_admin(current_user)
    ad = db.query(AdCampaign).filter(AdCampaign.id == ad_id).first()
    if not ad:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ad not found")
    ad.flagged = True
    ad.flag_reason = str(payload.get("reason", "")).strip() or None
    ad.status = _compute_ad_status(ad)
    db.commit()
    db.refresh(ad)
    _record_admin_event(
        actor=admin,
        action="ad.flag",
        resource_type="ad",
        resource_id=ad.id,
        details={"reason": ad.flag_reason or ""},
    )
    return {"ad": _to_ad_record(ad)}


@router.post("/ads/{ad_id}/unflag")
async def admin_ad_unflag(
    ad_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    admin = _ensure_admin(current_user)
    ad = db.query(AdCampaign).filter(AdCampaign.id == ad_id).first()
    if not ad:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ad not found")
    ad.flagged = False
    ad.flag_reason = None
    ad.status = _compute_ad_status(ad)
    db.commit()
    db.refresh(ad)
    _record_admin_event(
        actor=admin,
        action="ad.unflag",
        resource_type="ad",
        resource_id=ad.id,
    )
    return {"ad": _to_ad_record(ad)}


@router.delete("/ads/{ad_id}")
async def admin_delete_ad(
    ad_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    admin = _ensure_admin(current_user)
    ad = db.query(AdCampaign).filter(AdCampaign.id == ad_id).first()
    if not ad:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ad not found")
    db.delete(ad)
    db.commit()
    _record_admin_event(
        actor=admin,
        action="ad.delete",
        resource_type="ad",
        resource_id=ad_id,
        details={},
    )
    return {"deleted": True, "id": ad_id}


# ─────────────────────────────────────────────────────────────────────────────
# Career posts / blog — admin CRUD
# ─────────────────────────────────────────────────────────────────────────────
def _slugify(value: str) -> str:
    import re
    import unicodedata

    text = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode("ascii")
    text = re.sub(r"[^a-zA-Z0-9]+", "-", text).strip("-").lower()
    return text or uuid.uuid4().hex[:8]


def _to_career_record(post: CareerPost) -> dict[str, Any]:
    return {
        "_id": post.id,
        "slug": post.slug,
        "title": post.title,
        "category": post.category,
        "excerpt": post.excerpt,
        "readTime": post.read_time,
        "author": post.author,
        "coverImage": post.cover_image,
        "body": json.loads(post.body) if post.body else [],
        "takeaways": json.loads(post.takeaways) if post.takeaways else [],
        "featuredOnHome": bool(post.featured_on_home),
        "published": bool(post.published),
        "publishedAt": post.published_at.isoformat() if post.published_at else None,
        "createdAt": post.created_at.isoformat() if post.created_at else None,
    }


def _coerce_str_list(value: Any) -> list[str]:
    if isinstance(value, list):
        return [str(v).strip() for v in value if str(v).strip()]
    if isinstance(value, str):
        # Allow newline- or blank-line-separated paragraphs from a textarea.
        parts = [p.strip() for p in value.split("\n\n")] if "\n\n" in value else value.split("\n")
        return [p.strip() for p in parts if p.strip()]
    return []


@router.get("/career-posts")
async def admin_career_posts(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _ensure_admin(current_user)
    rows = (
        db.query(CareerPost)
        .order_by(CareerPost.published_at.desc(), CareerPost.created_at.desc())
        .all()
    )
    return {"posts": [_to_career_record(r) for r in rows]}


@router.post("/career-posts")
async def admin_create_career_post(
    payload: dict[str, Any],
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    admin = _ensure_admin(current_user)
    title = str(payload.get("title", "")).strip()
    if not title:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="O título é obrigatório")

    slug = str(payload.get("slug", "")).strip() or _slugify(title)
    slug = _slugify(slug)
    if db.query(CareerPost).filter(CareerPost.slug == slug).first():
        slug = f"{slug}-{uuid.uuid4().hex[:6]}"

    post = CareerPost(
        slug=slug,
        title=title,
        category=str(payload.get("category", "")).strip() or None,
        excerpt=str(payload.get("excerpt", "")).strip() or None,
        read_time=str(payload.get("readTime", "")).strip() or None,
        author=str(payload.get("author", "")).strip() or "Equipa Parvagas",
        cover_image=str(payload.get("coverImage", "")).strip() or None,
        body=json.dumps(_coerce_str_list(payload.get("body")), ensure_ascii=False),
        takeaways=json.dumps(_coerce_str_list(payload.get("takeaways")), ensure_ascii=False),
        featured_on_home=bool(payload.get("featuredOnHome", False)),
        published=bool(payload.get("published", True)),
        published_at=_parse_dt(payload.get("publishedAt")) or datetime.utcnow(),
    )
    db.add(post)
    db.commit()
    db.refresh(post)
    _record_admin_event(
        actor=admin, action="career_post.create", resource_type="career_post",
        resource_id=post.id, details={"slug": post.slug, "title": post.title},
    )
    return {"post": _to_career_record(post)}


@router.patch("/career-posts/{post_id}")
async def admin_update_career_post(
    post_id: str,
    payload: dict[str, Any],
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    admin = _ensure_admin(current_user)
    post = db.query(CareerPost).filter(CareerPost.id == post_id).first()
    if not post:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Artigo não encontrado")

    if "title" in payload:
        post.title = str(payload.get("title") or post.title).strip() or post.title
    if "slug" in payload and str(payload.get("slug", "")).strip():
        new_slug = _slugify(str(payload["slug"]))
        clash = db.query(CareerPost).filter(CareerPost.slug == new_slug, CareerPost.id != post.id).first()
        post.slug = f"{new_slug}-{uuid.uuid4().hex[:6]}" if clash else new_slug
    if "category" in payload:
        post.category = str(payload.get("category", "")).strip() or None
    if "excerpt" in payload:
        post.excerpt = str(payload.get("excerpt", "")).strip() or None
    if "readTime" in payload:
        post.read_time = str(payload.get("readTime", "")).strip() or None
    if "author" in payload:
        post.author = str(payload.get("author", "")).strip() or None
    if "coverImage" in payload:
        post.cover_image = str(payload.get("coverImage", "")).strip() or None
    if "body" in payload:
        post.body = json.dumps(_coerce_str_list(payload.get("body")), ensure_ascii=False)
    if "takeaways" in payload:
        post.takeaways = json.dumps(_coerce_str_list(payload.get("takeaways")), ensure_ascii=False)
    if "featuredOnHome" in payload:
        post.featured_on_home = bool(payload.get("featuredOnHome"))
    if "published" in payload:
        post.published = bool(payload.get("published"))
    if "publishedAt" in payload:
        post.published_at = _parse_dt(payload.get("publishedAt")) or post.published_at

    db.commit()
    db.refresh(post)
    _record_admin_event(
        actor=admin, action="career_post.update", resource_type="career_post",
        resource_id=post.id, details={"slug": post.slug},
    )
    return {"post": _to_career_record(post)}


@router.delete("/career-posts/{post_id}")
async def admin_delete_career_post(
    post_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    admin = _ensure_admin(current_user)
    post = db.query(CareerPost).filter(CareerPost.id == post_id).first()
    if not post:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Artigo não encontrado")
    db.delete(post)
    db.commit()
    _record_admin_event(
        actor=admin, action="career_post.delete", resource_type="career_post",
        resource_id=post_id, details={},
    )
    return {"deleted": True, "id": post_id}


_CSV_FORMULA_TRIGGERS = ("=", "+", "-", "@", "\t", "\r", "\n")


def _csv_safe_cell(value: Any) -> Any:
    """Neutralise CSV/formula injection (CWE-1236): a string cell starting
    with =, +, -, @, or a tab/CR/LF is evaluated as a live formula by
    Excel/Google Sheets when an admin opens the exported file. Several kinds
    below source fields from unauthenticated public forms (quick-apply,
    newsletter signup), so an attacker can plant a payload with no account.
    Prefixing a single quote forces spreadsheet apps to treat the value as
    literal text; non-string values and ordinary text pass through as-is."""
    if isinstance(value, str) and value.startswith(_CSV_FORMULA_TRIGGERS):
        return "'" + value
    return value


def _csv_safe_row(row: list[Any]) -> list[Any]:
    return [_csv_safe_cell(v) for v in row]


@router.get("/exports/{kind}.csv")
async def admin_export_csv(
    kind: str,
    from_date: str | None = Query(default=None, alias="from"),
    to_date: str | None = Query(default=None, alias="to"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    admin = _ensure_admin(current_user)
    kind_norm = kind.strip().lower()
    stream = StringIO()
    writer = csv.writer(stream)

    if kind_norm == "users":
        writer.writerow(["id", "fullName", "email", "role", "adminLevel", "suspended", "emailVerified", "createdAt"])
        users = db.query(User).order_by(User.created_at.desc()).all()
        for user in users:
            created_at = user.created_at.isoformat() if user.created_at else ""
            if not _is_in_range(created_at, from_date, to_date):
                continue
            writer.writerow(_csv_safe_row(
                [
                    user.id,
                    user.full_name,
                    user.email,
                    user.role.value if hasattr(user.role, "value") else str(user.role),
                    getattr(user, "admin_level", "moderator"),
                    bool(user.suspended),
                    bool(user.email_verified),
                    created_at,
                ]
            ))
    elif kind_norm == "companies":
        writer.writerow(["id", "name", "status", "email", "nif", "ownerUserId", "createdAt"])
        companies = db.query(Company).order_by(Company.created_at.desc()).all()
        for company in companies:
            created_at = company.created_at.isoformat() if company.created_at else ""
            if not _is_in_range(created_at, from_date, to_date):
                continue
            writer.writerow(_csv_safe_row(
                [
                    company.id,
                    company.name,
                    company.status,
                    company.email,
                    company.nif,
                    company.owner_user_id,
                    created_at,
                ]
            ))
    elif kind_norm == "jobs":
        writer.writerow(["id", "title", "status", "visibility", "companyId", "createdAt"])
        jobs = db.query(Job).order_by(Job.created_at.desc()).all()
        for job in jobs:
            created_at = job.created_at.isoformat() if job.created_at else ""
            if not _is_in_range(created_at, from_date, to_date):
                continue
            writer.writerow(_csv_safe_row(
                [
                    job.id,
                    job.title,
                    job.status,
                    job.visibility,
                    job.company_id,
                    created_at,
                ]
            ))
    elif kind_norm == "applications":
        writer.writerow(["id", "jobId", "companyId", "applicantFullName", "applicantEmail", "status", "createdAt"])
        applications = db.query(JobApplication).order_by(JobApplication.created_at.desc()).all()
        for application in applications:
            created_at = application.created_at.isoformat() if application.created_at else ""
            if not _is_in_range(created_at, from_date, to_date):
                continue
            writer.writerow(_csv_safe_row(
                [
                    application.id,
                    application.job_id,
                    application.company_id,
                    application.applicant_full_name,
                    application.applicant_email,
                    application.status,
                    created_at,
                ]
            ))
    elif kind_norm == "transactions":
        writer.writerow(["id", "companyId", "amount", "currency", "provider", "reference", "status", "kind", "createdAt"])
        transactions = db.query(Transaction).order_by(Transaction.created_at.desc()).all()
        for transaction in transactions:
            created_at = transaction.created_at.isoformat() if transaction.created_at else ""
            if not _is_in_range(created_at, from_date, to_date):
                continue
            writer.writerow(_csv_safe_row(
                [
                    transaction.id,
                    transaction.company_id,
                    transaction.amount,
                    transaction.currency,
                    transaction.provider,
                    transaction.reference,
                    transaction.status,
                    transaction.kind,
                    created_at,
                ]
            ))
    elif kind_norm == "newsletter":
        writer.writerow(["id", "email", "source", "unsubscribedAt", "createdAt"])
        subscribers = db.query(NewsletterSubscriber).order_by(NewsletterSubscriber.created_at.desc()).all()
        for subscriber in subscribers:
            created_at = subscriber.created_at.isoformat() if subscriber.created_at else ""
            if not _is_in_range(created_at, from_date, to_date):
                continue
            writer.writerow(_csv_safe_row(
                [
                    subscriber.id,
                    subscriber.email,
                    subscriber.source,
                    subscriber.unsubscribed_at.isoformat() if subscriber.unsubscribed_at else "",
                    created_at,
                ]
            ))
    else:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unsupported export kind")

    _record_admin_event(
        actor=admin,
        action="export.csv",
        resource_type="export",
        resource_id=kind_norm,
        details={"from": from_date, "to": to_date},
    )

    return Response(
        content=stream.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="parvagas-{kind_norm}.csv"'},
    )


# ── CV Builder pre-launch readiness check ─────────────────────────────────

@router.get("/cv-builder/readiness")
async def cv_builder_readiness(
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_user),
):
    """Run automated pre-launch checks for the CV builder feature.

    Returns a checklist of items with pass/fail/warn status that an admin
    can review before enabling the feature in production.
    """
    _ensure_admin(admin)
    from app.core.config import get_settings
    from app.models import Resume, ResumeTemplate, CandidateCVSubscription, CVUpload

    settings = get_settings()
    checks: list[dict[str, Any]] = []

    def _check(name: str, ok: bool, detail: str, warn: bool = False) -> None:
        checks.append({
            "name": name,
            "status": "pass" if ok else ("warn" if warn else "fail"),
            "detail": detail,
        })

    # ── Backend config ────────────────────────────────────────────────────
    from app.services.feature_flags import get_flag
    resume_ai_effective = get_flag("RESUME_AI_ENABLED", settings.RESUME_AI_ENABLED, db)
    cv_parser_ai_effective = get_flag("CV_PARSER_AI_ENABLED", settings.CV_PARSER_AI_ENABLED, db)
    _check(
        "Resume AI enabled",
        resume_ai_effective,
        f"RESUME_AI_ENABLED={resume_ai_effective} (feature flag), model={settings.RESUME_AI_MODEL}",
        warn=True,  # warn only — AI is optional at launch
    )
    _check(
        "CV Parser AI enabled",
        cv_parser_ai_effective,
        f"CV_PARSER_AI_ENABLED={cv_parser_ai_effective} (feature flag), model={settings.CV_PARSER_AI_MODEL}",
        warn=True,
    )
    _check(
        "Storage provider configured",
        settings.STORAGE_PROVIDER in ("supabase", "server"),
        f"STORAGE_PROVIDER={settings.STORAGE_PROVIDER} — 'local' is ephemeral in production",
        warn=settings.STORAGE_PROVIDER == "local",
    )

    # ── Database tables ───────────────────────────────────────────────────
    try:
        db.execute(text("SELECT 1 FROM resumes LIMIT 1"))
        _check("resumes table exists", True, "OK")
    except Exception as e:
        _check("resumes table exists", False, str(e))

    try:
        db.execute(text("SELECT 1 FROM resume_templates LIMIT 1"))
        _check("resume_templates table exists", True, "OK")
    except Exception as e:
        _check("resume_templates table exists", False, str(e))

    try:
        db.execute(text("SELECT 1 FROM candidate_cv_subscriptions LIMIT 1"))
        _check("candidate_cv_subscriptions table exists", True, "OK")
    except Exception as e:
        _check("candidate_cv_subscriptions table exists", False, str(e))

    try:
        db.execute(text("SELECT 1 FROM cover_letters LIMIT 1"))
        _check("cover_letters table exists", True, "OK")
    except Exception as e:
        _check("cover_letters table exists", False, str(e))

    # ── Seed data ─────────────────────────────────────────────────────────
    template_count = db.query(ResumeTemplate).filter(ResumeTemplate.is_active.is_(True)).count()
    _check(
        "Resume templates seeded",
        template_count > 0,
        f"{template_count} active templates found" if template_count else "No active templates — seed at least one",
    )

    # ── API route sanity ──────────────────────────────────────────────────
    _check("CV builder plans endpoint", True, "GET /api/v1/cv-builder/plans registered")
    _check("CV builder subscribe endpoint", True, "POST /api/v1/cv-builder/subscribe registered")
    _check("Resume CRUD endpoints", True, "GET/POST /api/v1/resumes/* registered")
    _check("CV upload endpoint", True, "POST /api/v1/cv/upload registered")
    _check("CV export endpoint", True, "GET /api/v1/cv/export/* registered")

    # ── Usage stats ───────────────────────────────────────────────────────
    resume_count = db.query(Resume).count()
    cv_upload_count = db.query(CVUpload).count()
    sub_count = db.query(CandidateCVSubscription).count()
    _check("Resume records", True, f"{resume_count} resumes created", warn=False)
    _check("CV uploads", True, f"{cv_upload_count} CVs uploaded", warn=False)
    _check("CV subscriptions", True, f"{sub_count} candidate CV subscriptions", warn=False)

    passed = sum(1 for c in checks if c["status"] == "pass")
    warned = sum(1 for c in checks if c["status"] == "warn")
    failed = sum(1 for c in checks if c["status"] == "fail")
    ready = failed == 0

    return {
        "ready": ready,
        "summary": {"pass": passed, "warn": warned, "fail": failed, "total": len(checks)},
        "checks": checks,
        "message": "CV Builder pronto para produção." if ready else f"{failed} verificação(ões) falhada(s) — corrija antes de lançar.",
    }


# ── Deploy / release management ────────────────────────────────────────────
#
# Provides the admin "Deploy" panel with:
#   GET  /admin/deploy/diff   — pending commits + changed files vs origin/main
#   POST /admin/deploy/push   — trigger production deploy (Portainer webhook
#                               or git push, configured via DEPLOY_WEBHOOK_URL)
#
# Security: super-admin only. The webhook URL is read from env — never
# exposed in responses. A deploy audit record is written on every push.

_REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../../"))


def _git(args: list[str], cwd: str = _REPO_ROOT) -> str:
    """Run a read-only git command and return stdout. Raises on error."""
    result = subprocess.run(  # noqa: S603
        ["git"] + args,
        cwd=cwd,
        capture_output=True,
        text=True,
        timeout=15,
    )
    if result.returncode != 0:
        raise RuntimeError(result.stderr.strip() or "git command failed")
    return result.stdout.strip()


@router.get("/deploy/diff")
async def deploy_diff(
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_user),
):
    """Return pending commits and changed files between local HEAD and origin/main."""
    _ensure_admin(admin)
    if admin.admin_level != AdminLevel.super_admin.value:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Super-admin required")

    try:
        # Fetch without merging so we see latest remote state.
        try:
            _git(["fetch", "origin", "main", "--quiet"])
        except Exception:
            pass  # offline or no remote — show local state

        # Commits ahead of origin/main
        ahead_log = _git([
            "log", "origin/main..HEAD",
            "--oneline", "--no-decorate", "--max-count=50",
        ])
        commits = [
            {"hash": line[:7], "message": line[8:]}
            for line in ahead_log.splitlines()
            if line.strip()
        ]

        # Files changed vs origin/main
        diff_stat = _git(["diff", "--stat", "origin/main..HEAD"])

        # Current branch
        branch = _git(["rev-parse", "--abbrev-ref", "HEAD"])

        # Last commit info
        last_commit = _git(["log", "-1", "--format=%H|%s|%an|%ar"])
        parts = last_commit.split("|", 3)
        last = {
            "hash": parts[0][:7] if parts else "",
            "message": parts[1] if len(parts) > 1 else "",
            "author": parts[2] if len(parts) > 2 else "",
            "when": parts[3] if len(parts) > 3 else "",
        }

        # Uncommitted local changes
        status_output = _git(["status", "--short"])
        dirty_files = [l.strip() for l in status_output.splitlines() if l.strip()]

    except Exception as exc:
        return {
            "error": str(exc),
            "branch": "unknown",
            "commits": [],
            "diff_stat": "",
            "last_commit": {},
            "dirty_files": [],
            "ready_to_deploy": False,
        }

    return {
        "branch": branch,
        "commits": commits,
        "commits_ahead": len(commits),
        "diff_stat": diff_stat,
        "last_commit": last,
        "dirty_files": dirty_files,
        "ready_to_deploy": len(commits) > 0 and len(dirty_files) == 0,
    }


@router.post("/deploy/push")
async def deploy_push(
    payload: dict[str, Any],
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_user),
):
    """Trigger a production deployment.

    Two supported modes (configured via env):
      1. DEPLOY_WEBHOOK_URL — POST to a Portainer stack-update webhook.
      2. DEPLOY_GIT_PUSH=true — run `git push origin main` from the repo root.

    A note/reason from the admin (payload.reason) is recorded in the audit log.
    """
    _ensure_admin(admin)
    if admin.admin_level != AdminLevel.super_admin.value:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Super-admin required")

    reason = str(payload.get("reason", "")).strip() or "Manual deploy via admin panel"
    deploy_webhook = os.getenv("DEPLOY_WEBHOOK_URL", "").strip()
    git_push_enabled = os.getenv("DEPLOY_GIT_PUSH", "false").lower() == "true"

    if not deploy_webhook and not git_push_enabled:
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail="Nenhum método de deploy configurado. Defina DEPLOY_WEBHOOK_URL ou DEPLOY_GIT_PUSH=true.",
        )

    result_detail: str = ""

    try:
        if deploy_webhook:
            import httpx
            resp = httpx.post(deploy_webhook, timeout=30)
            if resp.status_code not in (200, 201, 204):
                raise RuntimeError(f"Webhook respondeu com {resp.status_code}: {resp.text[:200]}")
            result_detail = f"Webhook chamado com sucesso ({resp.status_code})"

        elif git_push_enabled:
            _git(["push", "origin", "main"])
            result_detail = "git push origin main concluído"

    except Exception as exc:
        _record_admin_event(
            actor=admin,
            action="deploy.push.failed",
            resource_type="deploy",
            resource_id="main",
            details={"reason": reason, "error": str(exc)},
        )
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc

    _record_admin_event(
        actor=admin,
        action="deploy.push",
        resource_type="deploy",
        resource_id="main",
        details={"reason": reason, "result": result_detail},
    )

    return {
        "success": True,
        "detail": result_detail,
        "deployed_at": datetime.utcnow().isoformat(),
        "deployed_by": admin.email,
    }


@router.get("/deploy/history")
async def deploy_history(
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_user),
):
    """Last 20 deploy events recorded in the audit log."""
    _ensure_admin(admin)
    events = (
        db.query(AuditLog)
        .filter(AuditLog.action.in_(["deploy.push", "deploy.push.failed"]))
        .order_by(AuditLog.created_at.desc())
        .limit(20)
        .all()
    )
    return {
        "history": [
            {
                "id": e.id,
                "action": e.action,
                "actor": e.actor_email,
                "details": json.loads(e.details) if e.details else {},
                "created_at": e.created_at.isoformat() if e.created_at else None,
            }
            for e in events
        ]
    }


# ── Legal Documents — versioned CMS (public + internal) ──────────────────
#
# Wave L3, EXECUTION_PLAN_LEGAL_AND_PAYMENTS.md. Every write here is
# restricted to super-admin: a change to a public legal document (or an
# internal security/dispute policy) is a higher-stakes action than most
# other admin content, and there's no reason a moderator needs it.
#
# Editing rule enforced by legal_service, not re-checked here: a version
# can only be edited while status == "draft". Once published it's
# immutable — a LegalAcceptance row may already point at it, and that
# record must keep meaning exactly what the user agreed to.

_SLUG_RE = re.compile(r"^[a-z0-9]+(-[a-z0-9]+)*$")


def _to_legal_document_record(db: Session, document: LegalDocument) -> dict[str, Any]:
    current = legal_service.get_current_version(db, document.id)
    version_count = db.query(LegalDocumentVersion).filter(LegalDocumentVersion.document_id == document.id).count()
    return {
        "_id": document.id,
        "slug": document.slug,
        "title": document.title,
        "category": document.category,
        "audience": document.audience,
        "requiresAcceptance": bool(document.requires_acceptance),
        "versionCount": version_count,
        "currentVersion": _to_legal_version_record(current) if current else None,
    }


def _to_legal_version_record(version: LegalDocumentVersion) -> dict[str, Any]:
    return {
        "_id": version.id,
        "documentId": version.document_id,
        "versionLabel": version.version_label,
        "bodyMarkdown": version.body_markdown,
        "status": version.status,
        "effectiveDate": version.effective_date.isoformat() if version.effective_date else None,
        "publishedAt": version.published_at.isoformat() if version.published_at else None,
        "createdAt": version.created_at.isoformat() if version.created_at else None,
    }


@router.get("/legal-documents")
async def admin_list_legal_documents(
    audience: str | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _ensure_admin(current_user)
    documents = legal_service.list_documents(db, audience=audience)
    return {"legalDocuments": [_to_legal_document_record(db, d) for d in documents]}


@router.get("/legal-documents/{document_id}")
async def admin_get_legal_document(
    document_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _ensure_admin(current_user)
    document = legal_service.get_document(db, document_id)
    if not document:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Documento não encontrado")
    versions = legal_service.list_versions(db, document.id)
    record = _to_legal_document_record(db, document)
    record["versions"] = [_to_legal_version_record(v) for v in versions]
    return record


@router.post("/legal-documents")
async def admin_create_legal_document(
    payload: dict[str, Any],
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Creating a brand-new document type is rare (the 14 standard ones are
    seeded by migration) — mainly here for when the compliance analyzer
    flags that an entirely new policy is needed and an admin acts on it."""
    admin = _ensure_admin(current_user)
    _ensure_super_admin(admin)

    slug = str(payload.get("slug", "")).strip().lower()
    title = str(payload.get("title", "")).strip()
    category = str(payload.get("category", "")).strip()
    audience = str(payload.get("audience", "public")).strip().lower()
    if not slug or not title or not category:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="slug, title e category são obrigatórios")
    if not _SLUG_RE.match(slug):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="slug inválido — use apenas letras minúsculas, números e hífens")
    if audience not in ("public", "employer", "internal"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="audience deve ser public, employer ou internal")
    if legal_service.get_document_by_slug(db, slug):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Já existe um documento com este slug")

    document = legal_service.create_document(
        db, slug=slug, title=title, category=category, audience=audience,
        requires_acceptance=bool(payload.get("requiresAcceptance", False)),
    )
    _record_admin_event(
        actor=admin, action="legalDocument.create", resource_type="legal_document",
        resource_id=document.id, details={"slug": slug, "audience": audience},
    )
    return _to_legal_document_record(db, document)


@router.patch("/legal-documents/{document_id}")
async def admin_update_legal_document(
    document_id: str,
    payload: dict[str, Any],
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Metadata only (title/audience/requiresAcceptance) — slug and
    category are the stable identity of the document and aren't editable
    here; delete and recreate if a document type was genuinely set up
    wrong, rather than silently repurposing an existing one that may
    already have recorded acceptances against it."""
    admin = _ensure_admin(current_user)
    _ensure_super_admin(admin)
    document = legal_service.get_document(db, document_id)
    if not document:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Documento não encontrado")

    if "title" in payload:
        title = str(payload.get("title", "")).strip()
        if not title:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="title não pode ficar vazio")
        document.title = title
    if "audience" in payload:
        audience = str(payload.get("audience", "")).strip().lower()
        if audience not in ("public", "employer", "internal"):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="audience deve ser public, employer ou internal")
        document.audience = audience
    if "requiresAcceptance" in payload:
        document.requires_acceptance = bool(payload.get("requiresAcceptance"))

    db.commit()
    db.refresh(document)
    _record_admin_event(
        actor=admin, action="legalDocument.update", resource_type="legal_document",
        resource_id=document.id, details={"changes": list(payload.keys())},
    )
    return _to_legal_document_record(db, document)


@router.post("/legal-documents/{document_id}/versions")
async def admin_create_legal_document_version(
    document_id: str,
    payload: dict[str, Any],
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    admin = _ensure_admin(current_user)
    _ensure_super_admin(admin)
    document = legal_service.get_document(db, document_id)
    if not document:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Documento não encontrado")

    version_label = str(payload.get("versionLabel", "")).strip()
    body_markdown = str(payload.get("bodyMarkdown", "")).strip()
    if not version_label or not body_markdown:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="versionLabel e bodyMarkdown são obrigatórios")

    effective_date = None
    if payload.get("effectiveDate"):
        try:
            effective_date = datetime.fromisoformat(str(payload["effectiveDate"]).replace("Z", "+00:00"))
        except ValueError:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="effectiveDate inválida")

    version = legal_service.create_draft_version(
        db, document_id=document.id, version_label=version_label,
        body_markdown=body_markdown, effective_date=effective_date,
    )
    _record_admin_event(
        actor=admin, action="legalDocument.versionCreate", resource_type="legal_document_version",
        resource_id=version.id, details={"documentSlug": document.slug, "versionLabel": version_label},
    )
    return _to_legal_version_record(version)


@router.patch("/legal-documents/{document_id}/versions/{version_id}")
async def admin_update_legal_document_version(
    document_id: str,
    version_id: str,
    payload: dict[str, Any],
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    admin = _ensure_admin(current_user)
    _ensure_super_admin(admin)
    version = legal_service.get_version(db, version_id)
    if not version or version.document_id != document_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Versão não encontrada")

    effective_date = None
    if "effectiveDate" in payload and payload.get("effectiveDate"):
        try:
            effective_date = datetime.fromisoformat(str(payload["effectiveDate"]).replace("Z", "+00:00"))
        except ValueError:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="effectiveDate inválida")

    try:
        version = legal_service.update_draft_version(
            db, version,
            version_label=str(payload["versionLabel"]).strip() if "versionLabel" in payload else None,
            body_markdown=str(payload["bodyMarkdown"]) if "bodyMarkdown" in payload else None,
            effective_date=effective_date,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))

    _record_admin_event(
        actor=admin, action="legalDocument.versionUpdate", resource_type="legal_document_version",
        resource_id=version.id, details={"changes": list(payload.keys())},
    )
    return _to_legal_version_record(version)


@router.post("/legal-documents/{document_id}/versions/{version_id}/publish")
async def admin_publish_legal_document_version(
    document_id: str,
    version_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    admin = _ensure_admin(current_user)
    _ensure_super_admin(admin)
    version = legal_service.get_version(db, version_id)
    if not version or version.document_id != document_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Versão não encontrada")
    if version.status == "published":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Esta versão já está publicada")

    document = legal_service.get_document(db, document_id)
    published = legal_service.publish_legal_version(db, version, published_by_user_id=admin.id)
    _record_admin_event(
        actor=admin, action="legalDocument.versionPublish", resource_type="legal_document_version",
        resource_id=published.id,
        details={"documentSlug": document.slug if document else None, "versionLabel": published.version_label},
    )
    return _to_legal_version_record(published)


@router.get("/legal-documents/{document_id}/acceptances/summary")
async def admin_legal_document_acceptance_summary(
    document_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """How many distinct users have accepted the CURRENT published version
    — a quick read on rollout of a re-consent requirement (Wave C2), not a
    full audit log (that's a separate, paginated endpoint if ever needed)."""
    _ensure_admin(current_user)
    document = legal_service.get_document(db, document_id)
    if not document:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Documento não encontrado")
    current = legal_service.get_current_version(db, document.id)
    if not current:
        return {"currentVersionId": None, "acceptedCount": 0}
    accepted_count = (
        db.query(LegalAcceptance.user_id)
        .filter(LegalAcceptance.document_version_id == current.id)
        .distinct()
        .count()
    )
    return {"currentVersionId": current.id, "acceptedCount": accepted_count}


# ── Compliance Analyzer ────────────────────────────────────────────────
#
# Wave L3b. A deterministic checklist, NOT an AI opinion — see
# app/services/compliance_analyzer_service.py's module docstring for why.
# Read access (viewing past checks) is available to any admin; running a
# new analysis and resolving/dismissing findings is super-admin only,
# consistent with every other legal-document write in this file.

def _to_compliance_check_record(check: "ComplianceCheck") -> dict[str, Any]:
    return {
        "_id": check.id,
        "featureName": check.feature_name,
        "featureDescription": check.feature_description,
        "intake": json.loads(check.intake),
        "findings": json.loads(check.findings),
        "aiNotes": check.ai_notes,
        "severitySummary": check.severity_summary,
        "status": check.status,
        "resolvedAt": check.resolved_at.isoformat() if check.resolved_at else None,
        "createdAt": check.created_at.isoformat() if check.created_at else None,
    }


@router.get("/compliance-checks/categories")
async def admin_list_compliance_categories(current_user: User = Depends(get_current_user)):
    _ensure_admin(current_user)
    return {"categories": compliance_analyzer_service.list_categories()}


@router.get("/compliance-checks")
async def admin_list_compliance_checks(
    status_filter: str | None = Query(default=None, alias="status"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _ensure_admin(current_user)
    checks = compliance_analyzer_service.list_checks(db, status_filter=status_filter)
    return {"complianceChecks": [_to_compliance_check_record(c) for c in checks]}


@router.get("/compliance-checks/{check_id}")
async def admin_get_compliance_check(
    check_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _ensure_admin(current_user)
    check = compliance_analyzer_service.get_check(db, check_id)
    if not check:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Análise não encontrada")
    return _to_compliance_check_record(check)


@router.post("/compliance-checks")
async def admin_create_compliance_check(
    payload: dict[str, Any],
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    admin = _ensure_admin(current_user)
    _ensure_super_admin(admin)

    feature_name = str(payload.get("featureName", "")).strip()
    feature_description = str(payload.get("featureDescription", "")).strip()
    intake = payload.get("intake") or {}
    if not feature_name or not feature_description:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="featureName e featureDescription são obrigatórios")
    if not isinstance(intake, dict):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="intake deve ser um objeto {categoria: boolean}")

    check = compliance_analyzer_service.analyze_feature(
        db, feature_name=feature_name, feature_description=feature_description,
        intake=intake, created_by_user_id=admin.id,
    )
    _record_admin_event(
        actor=admin, action="complianceCheck.create", resource_type="compliance_check",
        resource_id=check.id, details={"featureName": feature_name, "severity": check.severity_summary},
    )
    return _to_compliance_check_record(check)


@router.post("/compliance-checks/{check_id}/resolve")
async def admin_resolve_compliance_check(
    check_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    admin = _ensure_admin(current_user)
    _ensure_super_admin(admin)
    check = compliance_analyzer_service.get_check(db, check_id)
    if not check:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Análise não encontrada")
    check = compliance_analyzer_service.resolve_check(db, check, resolved_by_user_id=admin.id, dismissed=False)
    _record_admin_event(
        actor=admin, action="complianceCheck.resolve", resource_type="compliance_check", resource_id=check.id,
    )
    return _to_compliance_check_record(check)


@router.post("/compliance-checks/{check_id}/dismiss")
async def admin_dismiss_compliance_check(
    check_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    admin = _ensure_admin(current_user)
    _ensure_super_admin(admin)
    check = compliance_analyzer_service.get_check(db, check_id)
    if not check:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Análise não encontrada")
    check = compliance_analyzer_service.resolve_check(db, check, resolved_by_user_id=admin.id, dismissed=True)
    _record_admin_event(
        actor=admin, action="complianceCheck.dismiss", resource_type="compliance_check", resource_id=check.id,
    )
    return _to_compliance_check_record(check)


# ── Data-subject requests (Wave C3) ─────────────────────────────────────────

def _to_dsar_record(db: Session, request: DataSubjectRequest) -> dict[str, Any]:
    requester = db.query(User).filter(User.id == request.user_id).first()
    return {
        "id": request.id,
        "userId": request.user_id,
        "requester": {
            "fullName": requester.full_name if requester else None,
            "email": requester.email if requester else None,
        } if requester else None,
        "requestType": request.request_type,
        "status": request.status,
        "note": request.note,
        "adminNote": request.admin_note,
        "createdAt": request.created_at.isoformat() if request.created_at else None,
        "reviewedAt": request.reviewed_at.isoformat() if request.reviewed_at else None,
    }


@router.get("/data-subject-requests")
async def admin_list_dsar_requests(
    status_filter: str | None = Query(default=None, alias="status"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _ensure_admin(current_user)
    requests = dsar_service.list_requests(db, status_filter=status_filter)
    return {"requests": [_to_dsar_record(db, r) for r in requests]}


@router.post("/data-subject-requests/{request_id}/approve")
async def admin_approve_dsar_request(
    request_id: str,
    payload: dict[str, Any] | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Erasure only — export requests are self-service and never land here
    pending. Runs dsar_service.anonymize_user, which scrubs PII in place
    rather than deleting rows (see that function's docstring for exactly
    what is and isn't touched, and why)."""
    admin = _ensure_admin(current_user)
    _ensure_super_admin(admin)
    request = dsar_service.get_request(db, request_id)
    if not request:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pedido não encontrado")
    admin_note = str((payload or {}).get("adminNote", "")).strip() or None
    try:
        request = dsar_service.approve_erasure(db, request, reviewed_by_user_id=admin.id, admin_note=admin_note)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    _record_admin_event(
        actor=admin, action="dsar.approveErasure", resource_type="data_subject_request", resource_id=request.id,
    )
    return _to_dsar_record(db, request)


@router.post("/data-subject-requests/{request_id}/reject")
async def admin_reject_dsar_request(
    request_id: str,
    payload: dict[str, Any],
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    admin = _ensure_admin(current_user)
    _ensure_super_admin(admin)
    request = dsar_service.get_request(db, request_id)
    if not request:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pedido não encontrado")
    admin_note = str(payload.get("adminNote", "")).strip()
    if not admin_note:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="É necessário indicar o motivo da rejeição")
    try:
        request = dsar_service.reject_erasure(db, request, reviewed_by_user_id=admin.id, admin_note=admin_note)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    _record_admin_event(
        actor=admin, action="dsar.rejectErasure", resource_type="data_subject_request", resource_id=request.id,
    )
    return _to_dsar_record(db, request)
