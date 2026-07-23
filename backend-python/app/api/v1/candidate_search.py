"""Candidate directory search (overnight-audit W5.2) — companies could
previously only see a candidate after that candidate applied to one of
their jobs. This is the first channel that surfaces a profile before any
application exists, so every query here is hard-scoped to
`CandidateProfile.discoverable_opt_in.is_(True)` and gated behind the
Business plan (assert_candidate_search_access) — see
company_billing_service.py and the plan this shipped from for why.
"""
from __future__ import annotations

from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.api.v1.jobs import _json_list
from app.db.session import get_db
from app.models import CandidateProfile, User
from app.services.company_access_service import resolve_company_for_user, require_role
from app.services.company_billing_service import assert_candidate_search_access

router = APIRouter(tags=["candidate-search"])


def _serialize_search_result(profile: CandidateProfile, user: User) -> dict[str, Any]:
    """Result-card shape — deliberately no phone/email. See
    _serialize_full_profile for the full-profile view."""
    return {
        "userId": user.id,
        "fullName": user.full_name,
        "jobTitle": profile.job_title,
        "location": profile.location,
        "yearsOfExperience": profile.years_of_experience,
        "skills": _json_list(profile.skills),
        "summary": (profile.professional_summary or "")[:280],
    }


def _serialize_full_profile(profile: CandidateProfile, user: User) -> dict[str, Any]:
    return {
        "userId": user.id,
        "fullName": user.full_name,
        "email": user.email,
        "phone": profile.phone,
        "jobTitle": profile.job_title,
        "location": profile.location,
        "professionalSummary": profile.professional_summary,
        "yearsOfExperience": profile.years_of_experience,
        "skills": _json_list(profile.skills),
        "languages": _json_list(profile.languages),
        "experience": _json_list(profile.work_experience),
        "education": _json_list(profile.education),
        "linkedinUrl": profile.linkedin_url,
        "portfolioUrl": profile.portfolio_url,
        "githubUrl": profile.github_url,
    }


@router.get("/companies/candidates/search")
async def search_candidate_directory(
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1, le=100),
    keyword: Optional[str] = None,
    location: Optional[str] = None,
    minYears: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    company = resolve_company_for_user(db, current_user)
    require_role(db, current_user, company, {"owner", "recruiter", "viewer"})
    assert_candidate_search_access(db, company)

    query = (
        db.query(CandidateProfile, User)
        .join(User, User.id == CandidateProfile.user_id)
        .filter(CandidateProfile.discoverable_opt_in.is_(True))
    )

    keyword_clean = (keyword or "").strip()
    _fts_expr = (
        "to_tsvector('portuguese', coalesce(candidate_profiles.job_title,'') || ' ' || "
        "coalesce(candidate_profiles.professional_summary,'') || ' ' || "
        "coalesce(candidate_profiles.skills,''))"
    )
    use_fts = bool(keyword_clean) and db.bind.dialect.name == "postgresql"
    if use_fts:
        query = query.filter(
            text(f"{_fts_expr} @@ websearch_to_tsquery('portuguese', :kw)")
        ).params(kw=keyword_clean)
    elif keyword_clean:
        like = f"%{keyword_clean}%"
        query = query.filter(
            CandidateProfile.job_title.ilike(like)
            | CandidateProfile.professional_summary.ilike(like)
            | CandidateProfile.skills.ilike(like)
        )

    if location and location.strip():
        query = query.filter(CandidateProfile.location.ilike(f"%{location.strip()}%"))
    if minYears is not None:
        query = query.filter(CandidateProfile.years_of_experience >= minYears)

    total = query.count()
    rows = (
        query.order_by(CandidateProfile.updated_at.desc())
        .offset((page - 1) * limit)
        .limit(limit)
        .all()
    )

    pagination = {
        "page": page, "limit": limit, "total": total,
        "totalPages": max(1, (total + limit - 1) // limit),
    }
    return {
        "candidates": [_serialize_search_result(profile, user) for profile, user in rows],
        **pagination, "pagination": pagination,
    }


@router.get("/companies/candidates/{user_id}")
async def view_candidate_profile(
    user_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    company = resolve_company_for_user(db, current_user)
    require_role(db, current_user, company, {"owner", "recruiter", "viewer"})
    assert_candidate_search_access(db, company)

    row = (
        db.query(CandidateProfile, User)
        .join(User, User.id == CandidateProfile.user_id)
        .filter(User.id == user_id, CandidateProfile.discoverable_opt_in.is_(True))
        .first()
    )
    if not row:
        # Intentionally identical whether the profile doesn't exist or
        # simply isn't opted in — no reason to leak which.
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Perfil não encontrado")
    profile, user = row
    return {"profile": _serialize_full_profile(profile, user)}
