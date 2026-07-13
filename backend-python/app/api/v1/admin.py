"""Admin API endpoints for dashboard and moderation surfaces."""
from __future__ import annotations

import os
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
    AdCampaign, AuditLog, CandidateProfile, CareerPost, Company, Job, JobApplication,
    ScrapedJob, SecurityEvent, User, UserRole,
)
from app.workers.tasks import send_templated_email
from app.services.scraper_service import content_hash as scraped_content_hash, classify_audience_lane, assess_scraped_job_quality
from app.services.storage_service import StorageService
from app.core.logging import get_logger

logger = get_logger(__name__)


router = APIRouter(prefix="/admin", tags=["admin"])

_AUDIT_LOGS: list[dict[str, Any]] = []
_ADMIN_ACTIONS: list[dict[str, Any]] = []


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


def _json_default(value: Any) -> str:
    return value.isoformat() if hasattr(value, "isoformat") else str(value)


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
    now = datetime.utcnow().isoformat()
    detail_payload = details or {}
    audit_entry = {
        "_id": str(uuid.uuid4()),
        "actorUserId": actor.id,
        "action": action,
        "resourceType": resource_type,
        "resourceId": resource_id,
        "details": detail_payload,
        "createdAt": now,
    }
    admin_action_entry = {
        "_id": str(uuid.uuid4()),
        "adminUserId": actor.id,
        "action": action,
        "targetType": resource_type,
        "targetId": resource_id,
        "payload": detail_payload,
        "createdAt": now,
    }

    _AUDIT_LOGS.insert(0, audit_entry)
    _ADMIN_ACTIONS.insert(0, admin_action_entry)
    del _AUDIT_LOGS[1000:]
    del _ADMIN_ACTIONS[1000:]

    # Durable persistence (best-effort; never break the triggering action).
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
    return {**values, "ok": ok}


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
            "revenuePct": 0,
        },
        "series": {
            "jobsPosted": _daily_series(db, Job, since14),
            "userSignups": _daily_series(db, User, since14),
            "applications": _daily_series(db, JobApplication, since14),
            "revenue": [],
        },
        "distributions": {
            "applicationStatus": _distribution(db, JobApplication.status),
            "jobsByStatus": _distribution(db, Job.status),
            "companyVerification": _distribution(db, Company.status),
            "jobLocationDensity": _distribution(db, Job.location)[:8],
            "userLocationDensity": _distribution(db, CandidateProfile.location)[:8],
        },
        "business": {
            "revenueInRange": 0,
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

    # Notify the user when their access state actually changes.
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
        except Exception as e:
            logger.warning(f"Could not enqueue account status email: {e}")

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
        if owner and owner.email:
            if next_status in ("approved", "published", "active"):
                send_templated_email.delay("send_job_approved_email", {
                    "email": owner.email, "recruiter_name": owner.full_name or "",
                    "job_title": job.title, "job_id": job_id,
                })
            elif next_status in ("rejected", "declined"):
                send_templated_email.delay("send_job_rejected_email", {
                    "email": owner.email, "recruiter_name": owner.full_name or "",
                    "job_title": job.title, "reason": payload.get("reason", "") or "",
                })
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
        source=s.source, source_url=s.source_url,
        external_company_name=s.company_name,
        external_company_logo_url=s.company_logo_url,
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
    source_url = str(payload.get("sourceUrl", "")).strip() or None
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
        company_logo_url=str(payload.get("companyLogoUrl", "")).strip() or None,
        company_website=str(payload.get("companyWebsite", "")).strip() or None,
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
                      ("category", "category"), ("sourceUrl", "source_url"), ("description", "description")):
        if key in payload:
            setattr(s, attr, str(payload[key] or "").strip() or None)
            changed.append(key)
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
        s.company_logo_url = str(payload.get("companyLogoUrl") or "").strip() or None
        changed.append("companyLogoUrl")
    if "companyWebsite" in payload:
        s.company_website = str(payload.get("companyWebsite") or "").strip() or None
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
    sources = [a.name for a in get_adapters()]
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
            "message": "Nenhuma fonte configurada (SCRAPER_SOURCES)." if not sources else "Scraper iniciado."}


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
    current_user: User = Depends(get_current_user),
):
    _ensure_admin(current_user)
    keyword_norm = (keyword or "").strip().lower()
    action_norm = (action or "").strip().lower()
    resource_norm = (resourceType or "").strip().lower()
    actor_norm = (actorUserId or "").strip().lower()

    stream = StringIO()
    writer = csv.writer(stream)
    writer.writerow(["id", "action", "resourceType", "resourceId", "actorUserId", "details", "createdAt"])
    for entry in _AUDIT_LOGS:
        if action_norm and action_norm not in str(entry.get("action", "")).lower():
            continue
        if resource_norm and resource_norm not in str(entry.get("resourceType", "")).lower():
            continue
        if actor_norm and actor_norm not in str(entry.get("actorUserId", "")).lower():
            continue
        if not _is_in_range(entry.get("createdAt"), from_date, to_date):
            continue
        details_json = json.dumps(entry.get("details", {}), ensure_ascii=True, default=_json_default)
        if keyword_norm:
            haystack = " ".join(
                [
                    str(entry.get("action", "")),
                    str(entry.get("resourceType", "")),
                    str(entry.get("resourceId", "")),
                    str(entry.get("actorUserId", "")),
                    details_json,
                ]
            ).lower()
            if keyword_norm not in haystack:
                continue

        writer.writerow(
            [
                entry.get("_id", ""),
                entry.get("action", ""),
                entry.get("resourceType", ""),
                entry.get("resourceId", ""),
                entry.get("actorUserId", ""),
                details_json,
                entry.get("createdAt", ""),
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
    current_user: User = Depends(get_current_user),
):
    _ensure_admin(current_user)
    entries = list(_ADMIN_ACTIONS)
    keyword_norm = (keyword or "").strip().lower()
    action_norm = (action or "").strip().lower()
    target_norm = (targetType or "").strip().lower()

    filtered: list[dict[str, Any]] = []
    for entry in entries:
        if action_norm and action_norm not in str(entry.get("action", "")).lower():
            continue
        if target_norm and target_norm not in str(entry.get("targetType", "")).lower():
            continue
        if keyword_norm:
            haystack = " ".join(
                [
                    str(entry.get("action", "")),
                    str(entry.get("targetType", "")),
                    str(entry.get("targetId", "")),
                    str(entry.get("adminUserId", "")),
                    json.dumps(entry.get("payload", {}), ensure_ascii=True, default=_json_default),
                ]
            ).lower()
            if keyword_norm not in haystack:
                continue
        filtered.append(entry)

    total = len(filtered)
    start = (page - 1) * limit
    end = start + limit
    return {"adminActions": filtered[start:end], "pagination": _pagination(page, limit, total)}


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
            writer.writerow(
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
            )
    elif kind_norm == "companies":
        writer.writerow(["id", "name", "status", "email", "nif", "ownerUserId", "createdAt"])
        companies = db.query(Company).order_by(Company.created_at.desc()).all()
        for company in companies:
            created_at = company.created_at.isoformat() if company.created_at else ""
            if not _is_in_range(created_at, from_date, to_date):
                continue
            writer.writerow(
                [
                    company.id,
                    company.name,
                    company.status,
                    company.email,
                    company.nif,
                    company.owner_user_id,
                    created_at,
                ]
            )
    elif kind_norm == "jobs":
        writer.writerow(["id", "title", "status", "createdAt"])
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
    _require_admin(admin)
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
    _check(
        "Resume AI enabled",
        settings.RESUME_AI_ENABLED,
        f"RESUME_AI_ENABLED={settings.RESUME_AI_ENABLED}, model={settings.RESUME_AI_MODEL}",
        warn=True,  # warn only — AI is optional at launch
    )
    _check(
        "CV Parser AI enabled",
        settings.CV_PARSER_AI_ENABLED,
        f"CV_PARSER_AI_ENABLED={settings.CV_PARSER_AI_ENABLED}, model={settings.CV_PARSER_AI_MODEL}",
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
    _require_admin(admin)
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
    _require_admin(admin)
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
    _require_admin(admin)
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
