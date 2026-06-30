"""Public job browsing endpoints (list + detail).

Serializes the SQLAlchemy ``Job`` model into the Mongo-style shape the Next.js
frontend expects (``_id``, populated ``companyId``, camelCase fields).
"""
import json
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import text
from sqlalchemy.orm import Session, joinedload

from app.db.session import get_db
from app.models import Job, Company, CareerPost
from app.content import career_posts
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
        "status": company.status,
        "verified": company.status == "active",  # drives the "empresa verificada" badge
        "whatsapp": getattr(company, "phone", None),  # for WhatsApp quick-apply
        "angolanizacao": bool(getattr(company, "angolanizacao", False)),
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
        "source": getattr(job, "source", None),
        "sourceUrl": getattr(job, "source_url", None),
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

    keyword_clean = keyword.strip() if keyword else ""
    # Postgres full-text search (ranked, accent/stemming-aware) with ilike fallback.
    _fts_expr = (
        "to_tsvector('portuguese', coalesce(jobs.title,'') || ' ' || "
        "coalesce(jobs.description,'') || ' ' || coalesce(jobs.required_skills,'') || ' ' || "
        "coalesce(jobs.category,''))"
    )
    use_fts = bool(keyword_clean) and db.bind.dialect.name == "postgresql"
    if use_fts:
        query = query.filter(
            text(f"{_fts_expr} @@ websearch_to_tsquery('portuguese', :kw)")
        ).params(kw=keyword_clean)
    elif keyword_clean:
        like = f"%{keyword_clean}%"
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
    elif sort == "relevance" and use_fts:
        order = text(f"ts_rank({_fts_expr}, websearch_to_tsquery('portuguese', :kw)) DESC")
    elif sort == "relevance" and keyword_clean:
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


@router.post("/jobs/{job_id}/report")
async def report_job(job_id: str, payload: dict[str, Any] | None = None, db: Session = Depends(get_db)):
    """Public anti-fraud report — flags a job for admin review (no account needed)."""
    job = db.query(Job).filter(Job.id == job_id).first()
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")
    reason = str((payload or {}).get("reason", "")).strip()[:200] or "denúncia de utilizador"
    flags = _json_list(job.spam_flags)
    flags.append(reason)
    job.spam_flags = json.dumps(flags, ensure_ascii=True)
    job.spam_score = min(100, (job.spam_score or 0) + 30)
    # Auto-pull from public view once it crosses the threshold, pending re-review.
    if job.spam_score >= 60 and job.status in PUBLIC_JOB_STATUSES:
        job.status = "pending_platform_review"
    db.commit()

    # Alert admins of the report.
    try:
        from app.workers.tasks import send_templated_email
        from app.services.notification_service import admin_emails
        for admin_email in admin_emails(db):
            send_templated_email.delay("send_admin_job_reported_email", {
                "email": admin_email, "job_title": job.title or "(sem título)", "reason": reason,
            })
    except Exception as e:
        logger.warning(f"Could not enqueue admin job-reported alert: {e}")

    return {"reported": True, "jobId": job_id}


# ── Career posts: DB-row serializers (with static fallback when table empty) ──
def _career_card(post: CareerPost) -> dict[str, Any]:
    return {
        "_id": post.id,
        "slug": post.slug,
        "title": post.title,
        "category": post.category,
        "excerpt": post.excerpt,
        "readTime": post.read_time,
        "publishedAt": post.published_at.isoformat() if post.published_at else None,
        "featuredOnHome": bool(post.featured_on_home),
    }


def _career_detail(post: CareerPost) -> dict[str, Any]:
    card = _career_card(post)
    card.update(
        {
            "author": post.author,
            "coverImage": post.cover_image,
            "body": _json_list(post.body),
            "takeaways": _json_list(post.takeaways),
        }
    )
    return card


def _published_career_cards(db: Session) -> list[dict[str, Any]]:
    """All published posts (newest first); falls back to curated content."""
    rows = (
        db.query(CareerPost)
        .filter(CareerPost.published.is_(True))
        .order_by(CareerPost.published_at.desc(), CareerPost.created_at.desc())
        .all()
    )
    if rows:
        return [_career_card(r) for r in rows]
    return career_posts.list_posts()


def _featured_career_cards(db: Session, limit: int = 3) -> list[dict[str, Any]]:
    rows = (
        db.query(CareerPost)
        .filter(CareerPost.published.is_(True), CareerPost.featured_on_home.is_(True))
        .order_by(CareerPost.published_at.desc(), CareerPost.created_at.desc())
        .limit(limit)
        .all()
    )
    if rows:
        return [_career_card(r) for r in rows]
    # Only fall back to curated content when there are no DB posts at all,
    # so an admin who unfeatures everything genuinely sees an empty section.
    if db.query(CareerPost).filter(CareerPost.published.is_(True)).count() == 0:
        return career_posts.featured_posts(limit=limit)
    return []


@router.get("/public/homepage")
async def public_homepage(
    jobsLimit: int = Query(default=6, ge=1, le=24),
    postsLimit: int = Query(default=3, ge=1, le=12),
    db: Session = Depends(get_db),
):
    """Homepage payload: featured live jobs + featured career posts."""
    rows = (
        db.query(Job)
        .options(joinedload(Job.company))
        .filter(Job.status.in_(PUBLIC_JOB_STATUSES), Job.visibility == "public")
        .order_by(Job.created_at.desc())
        .limit(jobsLimit)
        .all()
    )
    return {
        "featuredJobs": [serialize_job(j) for j in rows],
        "featuredCareerPosts": _featured_career_cards(db, limit=postsLimit),
    }


@router.get("/public/career/posts")
async def public_career_posts(
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=12, ge=1, le=50),
    db: Session = Depends(get_db),
):
    """Paginated career-tips / blog listing (DB-managed, static fallback)."""
    all_posts = _published_career_cards(db)
    total = len(all_posts)
    start = (page - 1) * limit
    page_items = all_posts[start : start + limit]
    return {
        "posts": page_items,
        "pagination": {
            "page": page,
            "limit": limit,
            "total": total,
            "totalPages": max(1, (total + limit - 1) // limit),
        },
    }


@router.get("/public/career/posts/{slug}")
async def public_career_post_detail(slug: str, db: Session = Depends(get_db)):
    """Single published career article by slug (DB-managed, static fallback)."""
    row = (
        db.query(CareerPost)
        .filter(CareerPost.slug == slug, CareerPost.published.is_(True))
        .first()
    )
    post = _career_detail(row) if row else career_posts.get_post(slug)
    if not post:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Artigo não encontrado")
    return {"post": post}
