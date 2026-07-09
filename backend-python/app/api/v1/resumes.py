"""Resume API endpoints."""

from __future__ import annotations

import json
from typing import Any
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.logging import get_logger
from app.db.session import get_db
from app.models import (
    CandidateProfile,
    Resume,
    ResumeTemplate,
    ResumeVersion,
    CoverLetter,
    CandidateScore,
    JobMatch,
    User,
    UserRole,
)
from app.schemas import (
    CoverLetterCreateRequest,
    CoverLetterResponse,
    JobMatchResponse,
    MessageResponse,
    ResumeCreateRequest,
    ResumeResponse,
    ResumeRewriteRequest,
    ResumeRewriteResponse,
    ResumeScoreResponse,
    ResumeTemplateResponse,
    ResumeUpdateRequest,
)
from app.services.resume_ai_service import ResumeAIService
from app.models import CandidateCVSubscription

logger = get_logger(__name__)
router = APIRouter(prefix="/resumes", tags=["resumes"])


def _ensure_candidate_user(current_user: User) -> None:
    if current_user.role != UserRole.candidate:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Candidate access required")


def _ensure_candidate_profile(db: Session, current_user: User) -> CandidateProfile:
    profile = db.query(CandidateProfile).filter(CandidateProfile.user_id == current_user.id).first()
    if profile:
        return profile

    profile = CandidateProfile(user_id=current_user.id)
    db.add(profile)
    db.commit()
    db.refresh(profile)
    return profile


def _load_json_field(value: str | None) -> Any:
    if not value:
        return None
    try:
        return json.loads(value)
    except Exception:
        return None


def _resume_payload(resume: Resume) -> dict[str, Any]:
    return {
        "id": resume.id,
        "candidate_profile_id": resume.candidate_profile_id,
        "title": resume.title,
        "summary": resume.summary,
        "template_id": resume.template_id,
        "data": _load_json_field(resume.data),
        "is_draft": bool(resume.is_draft),
        "is_published": bool(resume.is_published),
        "share_slug": resume.share_slug,
        "created_at": resume.created_at,
        "updated_at": resume.updated_at,
    }


def _save_resume_score(db: Session, profile: CandidateProfile, resume: Resume, score_data: dict[str, Any]) -> None:
    candidate_score = db.query(CandidateScore).filter(
        CandidateScore.resume_id == resume.id,
        CandidateScore.candidate_profile_id == profile.id,
    ).first()

    if not candidate_score:
        candidate_score = CandidateScore(
            candidate_profile_id=profile.id,
            resume_id=resume.id,
        )

    candidate_score.overall_score = score_data.get("overall_score")
    candidate_score.skills_score = score_data.get("skills_score")
    candidate_score.experience_score = score_data.get("experience_score")
    candidate_score.formatting_score = score_data.get("formatting_score")
    candidate_score.ats_score = score_data.get("ats_score")
    candidate_score.score_metadata = json.dumps(score_data.get("metadata", {}), ensure_ascii=False)

    db.add(candidate_score)
    db.commit()


def _create_resume_version(db: Session, resume: Resume, user_id: str, notes: str) -> None:
    version_number = len(resume.versions) + 1
    resume_version = ResumeVersion(
        resume_id=resume.id,
        version_number=version_number,
        title=resume.title,
        summary=resume.summary,
        data=resume.data,
        change_summary=notes,
        created_by_user_id=user_id,
    )
    db.add(resume_version)
    db.commit()


@router.get("/templates", response_model=list[ResumeTemplateResponse])
async def list_resume_templates(
    db: Session = Depends(get_db),
):
    templates = db.query(ResumeTemplate).filter(ResumeTemplate.is_active == True).order_by(ResumeTemplate.name.asc()).all()
    return templates


@router.get("/", response_model=list[ResumeResponse])
async def list_resumes(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _ensure_candidate_user(current_user)
    profile = _ensure_candidate_profile(db, current_user)
    resumes = db.query(Resume).filter(Resume.candidate_profile_id == profile.id).order_by(Resume.updated_at.desc()).all()
    return [_resume_payload(resume) for resume in resumes]


@router.post("/", response_model=ResumeResponse)
async def create_resume(
    payload: ResumeCreateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _ensure_candidate_user(current_user)
    profile = _ensure_candidate_profile(db, current_user)

    resume = Resume(
        candidate_profile_id=profile.id,
        title=payload.title.strip(),
        summary=(payload.summary or "").strip() or None,
        template_id=payload.template_id,
        data=json.dumps(payload.data or {}, ensure_ascii=False),
        is_draft=bool(payload.is_draft),
        is_published=not bool(payload.is_draft),
    )
    db.add(resume)
    db.commit()
    db.refresh(resume)
    return _resume_payload(resume)


@router.get("/{resume_id}", response_model=ResumeResponse)
async def get_resume(
    resume_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _ensure_candidate_user(current_user)
    profile = _ensure_candidate_profile(db, current_user)
    resume = db.query(Resume).filter(Resume.id == resume_id, Resume.candidate_profile_id == profile.id).first()
    if not resume:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Resume not found")
    return _resume_payload(resume)


@router.patch("/{resume_id}", response_model=ResumeResponse)
async def update_resume(
    resume_id: str,
    payload: ResumeUpdateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _ensure_candidate_user(current_user)
    profile = _ensure_candidate_profile(db, current_user)
    resume = db.query(Resume).filter(Resume.id == resume_id, Resume.candidate_profile_id == profile.id).first()
    if not resume:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Resume not found")

    if payload.title is not None:
        resume.title = payload.title.strip() or resume.title
    if payload.summary is not None:
        resume.summary = payload.summary.strip() or None
    if payload.template_id is not None:
        resume.template_id = payload.template_id
    if payload.data is not None:
        resume.data = json.dumps(payload.data, ensure_ascii=False)
    if payload.is_draft is not None:
        resume.is_draft = payload.is_draft
    if payload.is_published is not None:
        resume.is_published = payload.is_published

    db.commit()
    db.refresh(resume)
    return _resume_payload(resume)


@router.post("/export", response_model=MessageResponse)
async def export_resume(
    payload: dict[str, str],
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _ensure_candidate_user(current_user)
    resume_id = payload.get("resume_id")
    if not resume_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="resume_id is required")

    resume = db.query(Resume).filter(Resume.id == resume_id, Resume.candidate_profile.has(user_id=current_user.id)).first()
    if not resume:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Resume not found")

    return {"message": "Export endpoint is available. Resume export workflows will be implemented in the next phase."}


@router.post("/score", response_model=ResumeScoreResponse)
async def score_resume(
    payload: dict[str, str],
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _ensure_candidate_user(current_user)
    profile = _ensure_candidate_profile(db, current_user)
    resume_id = payload.get("resume_id")
    if not resume_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="resume_id is required")

    resume = db.query(Resume).filter(Resume.id == resume_id, Resume.candidate_profile_id == profile.id).first()
    if not resume:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Resume not found")

    # Free-tier candidates get Ollama; paid get cloud AI.
    _cv_sub = (db.query(CandidateCVSubscription)
        .filter(CandidateCVSubscription.candidate_profile_id == profile.id,
                CandidateCVSubscription.status == "active")
        .order_by(CandidateCVSubscription.created_at.desc()).first())
    use_free_tier = not _cv_sub or _cv_sub.plan_tier == "free"

    score_data = ResumeAIService.score_resume(resume, profile, use_free_tier=use_free_tier)
    _save_resume_score(db, profile, resume, score_data)

    return ResumeScoreResponse(
        overall_score=score_data.get("overall_score"),
        skills_score=score_data.get("skills_score"),
        experience_score=score_data.get("experience_score"),
        formatting_score=score_data.get("formatting_score"),
        ats_score=score_data.get("ats_score"),
        metadata=score_data.get("metadata"),
    )


@router.post("/rewrite", response_model=ResumeRewriteResponse)
async def rewrite_resume(
    payload: ResumeRewriteRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _ensure_candidate_user(current_user)
    profile = _ensure_candidate_profile(db, current_user)
    resume = db.query(Resume).filter(Resume.id == payload.resume_id, Resume.candidate_profile_id == profile.id).first()
    if not resume:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Resume not found")

    # Free-tier candidates get Ollama (limited); paid get cloud AI (full rewrite).
    _cv_sub2 = (db.query(CandidateCVSubscription)
        .filter(CandidateCVSubscription.candidate_profile_id == profile.id,
                CandidateCVSubscription.status == "active")
        .order_by(CandidateCVSubscription.created_at.desc()).first())
    use_free_tier = not _cv_sub2 or _cv_sub2.plan_tier == "free"

    rewrite_result = ResumeAIService.rewrite_resume(resume, profile, payload.tone or "professional", payload.instructions, use_free_tier=use_free_tier)
    notes = rewrite_result.get("notes", "Resume rewrite completed.")

    _create_resume_version(db, resume, current_user.id, notes)
    resume.title = rewrite_result.get("title", resume.title)
    resume.summary = rewrite_result.get("summary", resume.summary)
    db.commit()
    db.refresh(resume)

    return ResumeRewriteResponse(
        id=resume.id,
        candidate_profile_id=resume.candidate_profile_id,
        title=resume.title,
        summary=resume.summary,
        template_id=resume.template_id,
        data=_load_json_field(resume.data),
        is_draft=bool(resume.is_draft),
        is_published=bool(resume.is_published),
        share_slug=resume.share_slug,
        created_at=resume.created_at,
        updated_at=resume.updated_at,
        notes=notes,
        source=rewrite_result.get("source"),
    )


@router.post("/cover-letters", response_model=CoverLetterResponse)
async def create_cover_letter(
    payload: CoverLetterCreateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _ensure_candidate_user(current_user)
    profile = _ensure_candidate_profile(db, current_user)

    cover_letter = CoverLetter(
        candidate_profile_id=profile.id,
        resume_id=payload.resume_id,
        job_id=payload.job_id,
        title=payload.title.strip(),
        content=payload.content.strip(),
        language=payload.language,
        is_draft=bool(payload.is_draft),
        is_published=not bool(payload.is_draft),
    )
    db.add(cover_letter)
    db.commit()
    db.refresh(cover_letter)

    return cover_letter


@router.get("/matches", response_model=list[JobMatchResponse])
async def list_job_matches(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _ensure_candidate_user(current_user)
    profile = _ensure_candidate_profile(db, current_user)
    matches = db.query(JobMatch).filter(JobMatch.candidate_profile_id == profile.id).order_by(JobMatch.match_percentage.desc()).all()
    return matches
