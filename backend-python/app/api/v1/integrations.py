"""Integration endpoints for external systems."""

from __future__ import annotations

import json
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.auth import extract_bearer_token
from app.core.config import get_settings
from app.core.logging import get_logger
from app.db.session import get_db
from app.models import CandidateProfile, Resume, ResumeTemplate, User

logger = get_logger(__name__)
settings = get_settings()

router = APIRouter(prefix="/integrations/cv-builder", tags=["integrations"])


class ResumeSyncPayload(BaseModel):
    action: Literal["create", "update", "patch", "import", "duplicate", "delete"]
    userId: str
    resumeId: str
    resume: dict[str, Any] | None = None
    app: str | None = None
    timestamp: str | None = None


def _ensure_candidate_profile(db: Session, user_id: str) -> CandidateProfile:
    profile = db.query(CandidateProfile).filter(CandidateProfile.user_id == user_id).first()
    if profile:
        return profile

    profile = CandidateProfile(user_id=user_id)
    db.add(profile)
    db.commit()
    db.refresh(profile)
    return profile


def _valid_template_id(db: Session, template_id: str | None) -> str | None:
    if not template_id:
        return None
    template = db.query(ResumeTemplate).filter(ResumeTemplate.id == template_id).first()
    return template.id if template else None


@router.post("/resumes/sync")
async def sync_resume_from_cv_builder(
    payload: ResumeSyncPayload,
    request: Request,
    db: Session = Depends(get_db),
):
    authorization = request.headers.get("Authorization")
    token = extract_bearer_token(authorization)
    expected_token = settings.RESUME_BUILDER_SECRET.strip()

    if expected_token and token != expected_token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid integration token")

    source = request.headers.get("X-Source", "unknown")
    if source != "parvagas-cv-builder":
        logger.warning("Unexpected integration source header", extra={"source": source})

    user = db.query(User).filter(User.id == payload.userId).first()
    if not user:
        logger.warning(
            "CV Builder sync skipped: user not found",
            extra={"user_id": payload.userId, "resume_id": payload.resumeId, "action": payload.action},
        )
        return {
            "accepted": False,
            "action": payload.action,
            "resume_id": payload.resumeId,
            "reason": "user_not_found",
        }

    profile = _ensure_candidate_profile(db, payload.userId)

    resume = (
        db.query(Resume)
        .filter(Resume.id == payload.resumeId, Resume.candidate_profile_id == profile.id)
        .first()
    )

    if payload.action == "delete":
        if resume:
            db.delete(resume)
            db.commit()

        return {
            "accepted": True,
            "action": payload.action,
            "resume_id": payload.resumeId,
            "candidate_profile_id": profile.id,
        }

    if payload.resume is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="resume payload is required")

    title = str(payload.resume.get("title") or "Curriculum Vitae").strip() or "Curriculum Vitae"
    summary = payload.resume.get("summary")
    template_id = _valid_template_id(db, payload.resume.get("templateId"))
    share_slug = payload.resume.get("slug")
    is_public = bool(payload.resume.get("visibility") == "public")
    is_draft = bool(payload.resume.get("visibility") != "public")

    resume_data = payload.resume.get("data", payload.resume)
    serialized_data = json.dumps(resume_data, ensure_ascii=False)

    if resume is None:
        resume = Resume(
            id=payload.resumeId,
            candidate_profile_id=profile.id,
            title=title,
            summary=str(summary).strip() if summary else None,
            template_id=template_id,
            data=serialized_data,
            is_draft=is_draft,
            is_published=is_public,
            share_slug=share_slug,
        )
        db.add(resume)
    else:
        resume.title = title
        resume.summary = str(summary).strip() if summary else None
        resume.template_id = template_id
        resume.data = serialized_data
        resume.is_draft = is_draft
        resume.is_published = is_public
        resume.share_slug = share_slug

    db.commit()

    return {
        "accepted": True,
        "action": payload.action,
        "resume_id": resume.id,
        "candidate_profile_id": profile.id,
    }
