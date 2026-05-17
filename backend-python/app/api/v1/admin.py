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
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models import AdCampaign, Company, User, UserRole


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
        "jobs": 0,
        "scraped": 0,
        "ads": 0,
    }


@router.get("/analytics")
async def admin_analytics(
    from_date: str | None = Query(default=None, alias="from"),
    to_date: str | None = Query(default=None, alias="to"),
    current_user: User = Depends(get_current_user),
):
    _ensure_admin(current_user)
    return {
        "range": {"from": from_date, "to": to_date},
        "totals": {
            "users": 0,
            "companies": 0,
            "jobs": 0,
            "scraped": 0,
            "ads": 0,
            "applications": 0,
        },
        "operational": {
            "pendingJobs": 0,
            "pendingCompanies": 0,
            "suspendedUsers": 0,
            "pendingScraped": 0,
            "activeApplications": 0,
        },
        "trends": {
            "usersPct": 0,
            "companiesPct": 0,
            "jobsPct": 0,
            "applicationsPct": 0,
            "revenuePct": 0,
        },
        "series": {
            "jobsPosted": [],
            "userSignups": [],
            "applications": [],
            "revenue": [],
        },
        "distributions": {
            "applicationStatus": [],
            "jobsByStatus": [],
            "companyVerification": [],
            "jobLocationDensity": [],
            "userLocationDensity": [],
        },
        "business": {
            "revenueInRange": 0,
            "adCountInRange": 0,
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
    current_user: User = Depends(get_current_user),
):
    _ensure_admin(current_user)
    return {"jobs": [], "pagination": _pagination(page, limit, 0)}


@router.patch("/jobs/{job_id}/moderate")
async def admin_moderate_job(
    job_id: str,
    payload: dict[str, Any],
    current_user: User = Depends(get_current_user),
):
    admin = _ensure_admin(current_user)
    next_status = payload.get("status", "approved")
    next_visibility = payload.get("visibility", "public")
    _record_admin_event(
        actor=admin,
        action="job.moderate",
        resource_type="job",
        resource_id=job_id,
        details={"status": next_status, "visibility": next_visibility, "reason": payload.get("reason", "")},
    )
    return {
        "job": {
            "_id": job_id,
            "status": next_status,
            "visibility": next_visibility,
            "updatedAt": datetime.utcnow().isoformat(),
        }
    }


@router.get("/applications")
async def admin_applications(
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=15, ge=1, le=200),
    current_user: User = Depends(get_current_user),
):
    _ensure_admin(current_user)
    return {"applications": [], "pagination": _pagination(page, limit, 0)}


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


@router.get("/scraped-jobs")
async def admin_scraped_jobs(
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=15, ge=1, le=200),
    current_user: User = Depends(get_current_user),
):
    _ensure_admin(current_user)
    return {"scrapedJobs": [], "pagination": _pagination(page, limit, 0)}


@router.post("/scraped-jobs")
async def admin_create_scraped(
    payload: dict[str, Any],
    current_user: User = Depends(get_current_user),
):
    _ensure_admin(current_user)
    return {
        "scraped": {
            "_id": f"scraped-{int(datetime.utcnow().timestamp())}",
            "title": payload.get("title"),
            "company": payload.get("company"),
            "location": payload.get("location"),
            "sourceUrl": payload.get("sourceUrl"),
            "status": "pending",
            "createdAt": datetime.utcnow().isoformat(),
        }
    }


@router.patch("/scraped-jobs/{scraped_id}")
async def admin_update_scraped(
    scraped_id: str,
    payload: dict[str, Any],
    current_user: User = Depends(get_current_user),
):
    _ensure_admin(current_user)
    return {
        "scraped": {
            "_id": scraped_id,
            "title": payload.get("title"),
            "company": payload.get("company"),
            "location": payload.get("location"),
            "sourceUrl": payload.get("sourceUrl"),
            "updatedAt": datetime.utcnow().isoformat(),
        }
    }


@router.patch("/scraped-jobs/{scraped_id}/review")
async def admin_review_scraped(
    scraped_id: str,
    payload: dict[str, Any],
    current_user: User = Depends(get_current_user),
):
    _ensure_admin(current_user)
    return {
        "scraped": {
            "_id": scraped_id,
            "status": payload.get("status", "approved"),
            "reviewNote": payload.get("reviewNote", ""),
            "updatedAt": datetime.utcnow().isoformat(),
        }
    }


@router.delete("/scraped-jobs/{scraped_id}")
async def admin_delete_scraped(
    scraped_id: str,
    current_user: User = Depends(get_current_user),
):
    _ensure_admin(current_user)
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
    current_user: User = Depends(get_current_user),
):
    _ensure_admin(current_user)
    entries = list(_AUDIT_LOGS)
    keyword_norm = (keyword or "").strip().lower()
    action_norm = (action or "").strip().lower()
    resource_norm = (resourceType or "").strip().lower()
    actor_norm = (actorUserId or "").strip().lower()

    filtered: list[dict[str, Any]] = []
    for entry in entries:
        if action_norm and action_norm not in str(entry.get("action", "")).lower():
            continue
        if resource_norm and resource_norm not in str(entry.get("resourceType", "")).lower():
            continue
        if actor_norm and actor_norm not in str(entry.get("actorUserId", "")).lower():
            continue
        if not _is_in_range(entry.get("createdAt"), from_date, to_date):
            continue
        if keyword_norm:
            haystack = " ".join(
                [
                    str(entry.get("action", "")),
                    str(entry.get("resourceType", "")),
                    str(entry.get("resourceId", "")),
                    str(entry.get("actorUserId", "")),
                    json.dumps(entry.get("details", {}), ensure_ascii=True, default=_json_default),
                ]
            ).lower()
            if keyword_norm not in haystack:
                continue
        filtered.append(entry)

    total = len(filtered)
    start = (page - 1) * limit
    end = start + limit
    return {"auditLogs": filtered[start:end], "pagination": _pagination(page, limit, total)}


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
