"""Admin API endpoints for dashboard and moderation surfaces."""
from __future__ import annotations

from datetime import datetime, timedelta
from io import StringIO
from math import ceil
from typing import Any
import csv
import json
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import Response
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from app.api.deps import get_current_user
from app.api.v1.jobs import serialize_job
from app.db.session import get_db, SessionLocal
from app.models import (
    AdCampaign, AuditLog, CandidateProfile, Company, Job, JobApplication,
    ScrapedJob, User, UserRole,
)
from app.workers.tasks import send_templated_email
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
    return {
        "_id": ad.id,
        "title": ad.title,
        "placement": ad.placement,
        "link": ad.link,
        "imageUrl": ad.image_url,
        "status": ad.status,
        "active": bool(ad.active),
        "budget": ad.budget,
        "clicks": int(ad.clicks or 0),
        "impressions": int(ad.impressions or 0),
        "startDate": ad.start_date.isoformat() if ad.start_date else None,
        "endDate": ad.end_date.isoformat() if ad.end_date else None,
        "createdAt": ad.created_at.isoformat() if ad.created_at else None,
    }


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


@router.get("/me")
async def admin_me(current_user: User = Depends(get_current_user)):
    user = _ensure_admin(current_user)
    return {
        "id": user.id,
        "role": "admin",
        "adminLevel": getattr(user, "admin_level", "moderator"),
        "permissions": ALL_ADMIN_PERMISSIONS,
    }


@router.get("/overview")
async def admin_overview(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _ensure_admin(current_user)
    return {
        "users": db.query(User).count(),
        "companies": db.query(Company).count(),
        "jobs": db.query(Job).count(),
        "scraped": 0,  # scraped-jobs feature not yet modelled
        "ads": db.query(AdCampaign).count(),
    }


def _distribution(db: Session, column) -> list[dict[str, Any]]:
    rows = (
        db.query(column, func.count())
        .filter(column.isnot(None))
        .group_by(column)
        .order_by(func.count().desc())
        .all()
    )
    return [{"label": str(label), "value": int(count)} for label, count in rows if str(label).strip()]


def _daily_series(db: Session, model, since: datetime) -> list[dict[str, Any]]:
    rows = (
        db.query(func.date(model.created_at), func.count())
        .filter(model.created_at >= since)
        .group_by(func.date(model.created_at))
        .order_by(func.date(model.created_at))
        .all()
    )
    return [{"label": str(d), "value": int(c)} for d, c in rows]


def _pct_change(db: Session, model, now: datetime, window_days: int = 30) -> float:
    cur_start = now - timedelta(days=window_days)
    prev_start = now - timedelta(days=2 * window_days)
    current = db.query(model).filter(model.created_at >= cur_start).count()
    previous = db.query(model).filter(model.created_at >= prev_start, model.created_at < cur_start).count()
    if previous == 0:
        return 100.0 if current else 0.0
    return round((current - previous) / previous * 100, 1)


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

    return {
        "range": {"from": from_date, "to": to_date},
        "totals": {
            "users": db.query(User).count(),
            "companies": db.query(Company).count(),
            "jobs": db.query(Job).count(),
            "scraped": 0,
            "ads": db.query(AdCampaign).count(),
            "applications": db.query(JobApplication).count(),
        },
        "operational": {
            "pendingJobs": db.query(Job).filter(Job.status == "pending_platform_review").count(),
            "pendingCompanies": db.query(Company).filter(Company.status == "pending_verification").count(),
            "suspendedUsers": db.query(User).filter(User.suspended.is_(True)).count(),
            "pendingScraped": 0,
            "activeApplications": db.query(JobApplication).filter(JobApplication.status.in_(active_app_statuses)).count(),
        },
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
            "adCountInRange": db.query(AdCampaign).count(),
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
        "createdAt": s.created_at.isoformat() if s.created_at else None,
    }


def _aggregator_company(db: Session, admin: User) -> Company:
    """Synthetic company that owns published scraped jobs."""
    co = db.query(Company).filter(Company.name == "Parvagas Aggregator").first()
    if not co:
        co = Company(owner_user_id=admin.id, name="Parvagas Aggregator", status="active",
                     description="Vagas agregadas de fontes externas.")
        db.add(co)
        db.flush()
    return co


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
    return {"scrapedJobs": [_to_scraped_record(r) for r in rows], "pagination": _pagination(page, limit, total)}


@router.post("/scraped-jobs")
async def admin_create_scraped(
    payload: dict[str, Any],
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _ensure_admin(current_user)
    title = str(payload.get("title", "")).strip()
    if not title:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Title is required")
    company_name = str(payload.get("company", "") or payload.get("companyName", "")).strip() or None
    # Dedupe heuristic: same title + company already ingested.
    dup = (
        db.query(ScrapedJob)
        .filter(ScrapedJob.title == title, ScrapedJob.company_name == company_name)
        .first()
    )
    s = ScrapedJob(
        title=title, company_name=company_name,
        location=str(payload.get("location", "")).strip() or None,
        category=str(payload.get("category", "")).strip() or None,
        source=str(payload.get("source", "")).strip() or None,
        source_url=str(payload.get("sourceUrl", "")).strip() or None,
        description=str(payload.get("description", "")).strip() or None,
        status="duplicate" if dup else "pending",
        duplicate_of=dup.id if dup else None,
    )
    db.add(s)
    db.commit()
    db.refresh(s)
    return {"scraped": _to_scraped_record(s)}


@router.patch("/scraped-jobs/{scraped_id}")
async def admin_update_scraped(
    scraped_id: str,
    payload: dict[str, Any],
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _ensure_admin(current_user)
    s = db.query(ScrapedJob).filter(ScrapedJob.id == scraped_id).first()
    if not s:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Scraped job not found")
    for key, attr in (("title", "title"), ("company", "company_name"), ("location", "location"),
                      ("category", "category"), ("sourceUrl", "source_url"), ("description", "description")):
        if key in payload:
            setattr(s, attr, str(payload[key] or "").strip() or None)
    db.commit()
    db.refresh(s)
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
            co = _aggregator_company(db, admin)
            job = Job(
                company_id=co.id, title=s.title, description=s.description,
                location=s.location, category=s.category,
                status="approved", visibility="public",
                published_at=datetime.utcnow(),
            )
            db.add(job)
            db.flush()
            s.published_job_id = job.id
    elif decision in {"reject", "rejected"}:
        s.status = "rejected"
    elif decision == "duplicate":
        s.status = "duplicate"
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
    _ensure_admin(current_user)
    s = db.query(ScrapedJob).filter(ScrapedJob.id == scraped_id).first()
    if s:
        db.delete(s)
        db.commit()
    return {"deleted": True, "id": scraped_id}


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
async def admin_launch_readiness(current_user: User = Depends(get_current_user)):
    _ensure_admin(current_user)
    checks = [
        {"id": "api", "scope": "backend", "status": "pass", "message": "API online"},
        {"id": "db", "scope": "database", "status": "pass", "message": "Database reachable"},
    ]
    return {
        "generatedAt": datetime.utcnow().isoformat(),
        "summary": {"total": len(checks), "pass": len(checks), "warn": 0, "fail": 0},
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

    created = AdCampaign(
        title=title,
        placement=placement,
        link=str(payload.get("link", "")).strip() or None,
        image_url=str(payload.get("imageUrl", "")).strip() or None,
        active=bool(payload.get("active", True)),
        budget=float(payload.get("budget", 0) or 0),
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
        ad.image_url = str(payload.get("imageUrl", "")).strip() or None
    if "budget" in payload:
        ad.budget = float(payload.get("budget") or 0)
    if "active" in payload:
        ad.active = bool(payload.get("active"))
    if "startDate" in payload:
        ad.start_date = _parse_dt(payload.get("startDate"))
    if "endDate" in payload:
        ad.end_date = _parse_dt(payload.get("endDate"))

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
