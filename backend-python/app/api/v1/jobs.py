"""Public job browsing endpoints (list + detail).

Serializes the SQLAlchemy ``Job`` model into the Mongo-style shape the Next.js
frontend expects (``_id``, populated ``companyId``, camelCase fields).
"""
import json
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session, joinedload

from app.db.session import get_db
from app.models import Job, Company
from app.core.logging import get_logger

logger = get_logger(__name__)
router = APIRouter(tags=["jobs"])

# Statuses considered live/visible on the public site.
PUBLIC_JOB_STATUSES = ("approved", "published", "active")


def _json_list(value: Optional[str]) -> list[Any]:
    if not value:
        return []
    try:
        parsed = json.loads(value)
        return parsed if isinstance(parsed, list) else []
    except Exception:
        return []


def _company_payload(company: Optional[Company]) -> Optional[dict[str, Any]]:
    if not company:
        return None
    return {
        "_id": company.id,
        "name": company.name,
        "website": company.website,
        "description": company.description,
        "logo": company.logo_url,
    }


def serialize_job(job: Job, *, detail: bool = False) -> dict[str, Any]:
    """Serialize a Job to the frontend shape. ``detail`` adds heavy fields."""
    payload: dict[str, Any] = {
        "_id": job.id,
        "title": job.title,
        "location": job.location,
        "workMode": job.work_mode,
        "mode": job.work_mode,
        "category": job.category,
        "contractType": job.contract_type,
        "jobType": job.job_type,
        "salaryRange": job.salary_range,
        "salaryMin": job.salary_min,
        "salaryMax": job.salary_max,
        "experienceLevel": job.experience_level,
        "requiredExperienceYears": job.required_experience_years,
        "requiredSkills": _json_list(job.required_skills),
        "status": job.status,
        "visibility": job.visibility,
        "views": job.views or 0,
        "expiresAt": job.expires_at.isoformat() if job.expires_at else None,
        "createdAt": job.created_at.isoformat() if job.created_at else None,
        "companyId": _company_payload(getattr(job, "company", None)),
    }
    if detail:
        payload.update(
            {
                "description": job.description,
                "responsibilities": _json_list(job.responsibilities),
                "requirements": _json_list(job.requirements),
                "preferredSkills": _json_list(job.preferred_skills),
                "languages": _json_list(job.languages),
                "publishedAt": job.published_at.isoformat() if job.published_at else None,
                "spamScore": job.spam_score or 0,
                "spamFlags": _json_list(job.spam_flags),
            }
        )
    return payload


@router.get("/jobs")
async def list_public_jobs(
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=12, ge=1, le=100),
    keyword: Optional[str] = None,
    provinceCity: Optional[str] = None,
    category: Optional[str] = None,
    workMode: Optional[str] = None,
    contractType: Optional[str] = None,
    seniority: Optional[str] = None,
    salaryMin: Optional[int] = None,
    datePostedDays: Optional[int] = None,
    sort: str = "recent",
    db: Session = Depends(get_db),
):
    """Public, paginated, filterable list of live job postings."""
    from datetime import datetime, timedelta

    query = (
        db.query(Job)
        .options(joinedload(Job.company))  # eager-load company to avoid N+1 in serialize_job
        .filter(Job.status.in_(PUBLIC_JOB_STATUSES))
        .filter(Job.visibility == "public")
    )

    if keyword and keyword.strip():
        like = f"%{keyword.strip()}%"
        # Title OR description OR skills match (broader than title-only).
        query = query.filter(
            Job.title.ilike(like) | Job.description.ilike(like) | Job.required_skills.ilike(like)
        )
    if provinceCity and provinceCity.strip():
        query = query.filter(Job.location.ilike(f"%{provinceCity.strip()}%"))
    if category and category.strip() and category != "all":
        query = query.filter(Job.category == category.strip())
    if workMode and workMode.strip() and workMode != "all":
        query = query.filter(Job.work_mode == workMode.strip())
    if contractType and contractType.strip() and contractType != "all":
        query = query.filter(Job.contract_type == contractType.strip())
    if seniority and seniority.strip() and seniority != "all":
        query = query.filter(Job.experience_level == seniority.strip())
    if salaryMin:
        query = query.filter(Job.salary_max >= salaryMin)
    if datePostedDays:
        cutoff = datetime.utcnow() - timedelta(days=int(datePostedDays))
        query = query.filter(Job.created_at >= cutoff)

    total = query.count()
    if sort == "salary":
        order = Job.salary_max.desc()
    elif sort == "relevance" and keyword:
        order = Job.views.desc()  # proxy for relevance/popularity
    else:
        order = Job.created_at.desc()
    rows = (
        query.order_by(order)
        .offset((page - 1) * limit)
        .limit(limit)
        .all()
    )

    pagination = {
        "page": page,
        "limit": limit,
        "total": total,
        "totalPages": max(1, (total + limit - 1) // limit),
    }
    return {"jobs": [serialize_job(j) for j in rows], **pagination, "pagination": pagination}


@router.get("/jobs/{job_id}")
async def get_public_job(job_id: str, db: Session = Depends(get_db)):
    """Public detail for a single live job."""
    job = (
        db.query(Job).options(joinedload(Job.company)).filter(Job.id == job_id).first()
    )
    if not job or job.status not in PUBLIC_JOB_STATUSES or job.visibility != "public":
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")
    # Best-effort view tracking for employer analytics.
    try:
        job.views = (job.views or 0) + 1
        db.commit()
    except Exception:
        db.rollback()
    return {"job": serialize_job(job, detail=True)}
