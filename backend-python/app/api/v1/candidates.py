"""Candidate API endpoints."""

from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from fastapi.responses import Response
from sqlalchemy.orm import Session, joinedload

from app.api.deps import get_current_user
from app.api.v1.jobs import PUBLIC_JOB_STATUSES, serialize_job
from app.core.config import get_settings
from app.core.logging import get_logger
from app.db.session import get_db
from app.models import CVUpload, CandidateProfile, Job, JobAlert, SavedJob, User, UserRole
from app.services.cv_export_service import to_docx, to_pdf, to_json_resume
from app.services.storage_service import StorageService
from app.workers.tasks import parse_cv

logger = get_logger(__name__)
settings = get_settings()
router = APIRouter(prefix="/candidates", tags=["candidates"])

_ALLOWED_EXTENSIONS = {".pdf", ".doc", ".docx", ".txt", ".png", ".jpg", ".jpeg", ".webp", ".tiff", ".bmp"}
_ALLOWED_MIME_TYPES = {
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "text/plain",
    # Image CVs / photos of a CV — text extracted via OCR.
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/webp",
    "image/tiff",
    "image/bmp",
}


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


def _json_load(value: str | None, default: Any) -> Any:
    if not value:
        return default
    try:
        parsed = json.loads(value)
        return parsed if parsed is not None else default
    except Exception:
        return default


def _json_dump(value: Any) -> str | None:
    if value is None:
        return None
    try:
        return json.dumps(value, ensure_ascii=True)
    except Exception:
        return None


def _coerce_list(value: Any) -> list[Any]:
    if isinstance(value, list):
        return value
    if isinstance(value, str):
        parts = [item.strip() for item in value.split(",")]
        return [item for item in parts if item]
    return []


def _profile_completion_score(profile_payload: dict[str, Any], has_cv: bool) -> int:
    checks = [
        bool(profile_payload.get("fullName") and profile_payload.get("email") and profile_payload.get("phone") and profile_payload.get("location")),
        bool(profile_payload.get("professionalTitle")),
        bool(profile_payload.get("summary")),
        bool(profile_payload.get("skills")),
        bool(profile_payload.get("languages")),
        bool(profile_payload.get("experience")),
        bool(profile_payload.get("education")),
        bool(has_cv),
        bool(profile_payload.get("preferredJobType")),
        bool(profile_payload.get("availability")),
    ]
    done = len([item for item in checks if item])
    return int(round((done / len(checks)) * 100))


def _latest_cv_document(db: Session, profile: CandidateProfile) -> dict[str, Any] | None:
    latest = (
        db.query(CVUpload)
        .filter(CVUpload.candidate_id == profile.id)
        .order_by(CVUpload.created_at.desc())
        .first()
    )
    if not latest:
        return None

    return {
        "_id": latest.id,
        "id": latest.id,
        "fileName": latest.file_name,
        "createdAt": latest.created_at.isoformat() if latest.created_at else None,
        "type": "cv",
    }


def _profile_to_payload(db: Session, current_user: User, profile: CandidateProfile) -> dict[str, Any]:
    skills = _coerce_list(_json_load(profile.skills, []))
    hard_skills = _coerce_list(_json_load(getattr(profile, "hard_skills", None), []))
    techniques = _coerce_list(_json_load(getattr(profile, "techniques", None), []))
    tools = _coerce_list(_json_load(getattr(profile, "tools", None), []))
    languages = _coerce_list(_json_load(profile.languages, []))
    certifications = _coerce_list(_json_load(profile.certifications, []))
    work_experience = _json_load(profile.work_experience, [])
    education = _json_load(profile.education, [])

    payload = {
        "id": profile.id,
        "userId": profile.user_id,
        "firstName": profile.first_name or "",
        "lastName": profile.last_name or "",
        "fullName": current_user.full_name or "",
        "email": current_user.email or "",
        "phone": profile.phone or "",
        "location": profile.location or "",
        "postcode": profile.postcode or "",
        "linkedinUrl": profile.linkedin_url or "",
        "portfolioUrl": profile.portfolio_url or "",
        "githubUrl": profile.github_url or "",
        "professionalSummary": profile.professional_summary or "",
        "jobTitle": profile.job_title or "",
        "professionalTitle": profile.job_title or "",
        "summary": profile.professional_summary or "",
        "yearsOfExperience": profile.years_of_experience,
        "skills": skills,
        "hardSkills": hard_skills,
        "techniques": techniques,
        "tools": tools,
        "languages": languages,
        "certifications": certifications,
        "experience": work_experience if isinstance(work_experience, list) else [],
        "workExperience": work_experience if isinstance(work_experience, list) else [],
        "education": education if isinstance(education, list) else [],
        "preferredJobType": getattr(profile, "preferred_job_type", None) or "",
        "expectedSalaryAoa": getattr(profile, "expected_salary_aoa", None),
        "availability": getattr(profile, "availability", None) or "",
        "preferredJobCategories": _coerce_list(_json_load(getattr(profile, "preferred_job_categories", None), [])),
        "autoApplyOptIn": bool(getattr(profile, "auto_apply_opt_in", False)),
        "hasCompletedOnboarding": bool(profile.has_completed_onboarding),
        "hasSeenTutorial": bool(profile.has_seen_tutorial),
    }

    payload["completionScore"] = _profile_completion_score(payload, has_cv=_latest_cv_document(db, profile) is not None)
    return payload


def _apply_profile_payload(profile: CandidateProfile, current_user: User, payload: dict[str, Any]) -> None:
    full_name = payload.get("fullName") or payload.get("full_name")
    if str(full_name or "").strip():
        current_user.full_name = str(full_name or "").strip()

    if "firstName" in payload or "first_name" in payload:
        profile.first_name = str(payload.get("firstName") or payload.get("first_name") or "").strip() or None
    if "lastName" in payload or "last_name" in payload:
        profile.last_name = str(payload.get("lastName") or payload.get("last_name") or "").strip() or None
    if "phone" in payload:
        profile.phone = str(payload.get("phone") or "").strip() or None
    if "location" in payload:
        profile.location = str(payload.get("location") or "").strip() or None
    if "postcode" in payload:
        profile.postcode = str(payload.get("postcode") or "").strip() or None
    if "linkedinUrl" in payload or "linkedin_url" in payload:
        profile.linkedin_url = str(payload.get("linkedinUrl") or payload.get("linkedin_url") or "").strip() or None
    if "portfolioUrl" in payload or "portfolio_url" in payload:
        profile.portfolio_url = str(payload.get("portfolioUrl") or payload.get("portfolio_url") or "").strip() or None
    if "githubUrl" in payload or "github_url" in payload:
        profile.github_url = str(payload.get("githubUrl") or payload.get("github_url") or "").strip() or None

    if "professionalSummary" in payload or "summary" in payload or "professional_summary" in payload:
        summary = payload.get("professionalSummary") or payload.get("professional_summary") or payload.get("summary")
        profile.professional_summary = str(summary or "").strip() or None

    if "professionalTitle" in payload or "jobTitle" in payload or "job_title" in payload:
        title = payload.get("professionalTitle") or payload.get("jobTitle") or payload.get("job_title")
        profile.job_title = str(title or "").strip() or None

    if "yearsOfExperience" in payload or "years_of_experience" in payload:
        years_raw = payload.get("yearsOfExperience") if "yearsOfExperience" in payload else payload.get("years_of_experience")
        try:
            profile.years_of_experience = int(years_raw) if years_raw is not None else None
        except Exception:
            profile.years_of_experience = None

    if "skills" in payload:
        profile.skills = _json_dump(_coerce_list(payload.get("skills")))
    if "languages" in payload:
        profile.languages = _json_dump(_coerce_list(payload.get("languages")))
    if "certifications" in payload:
        profile.certifications = _json_dump(_coerce_list(payload.get("certifications")))

    if "experience" in payload:
        experience = payload.get("experience")
        profile.work_experience = _json_dump(experience if isinstance(experience, list) else [])
    if "workExperience" in payload or "work_experience" in payload:
        experience = payload.get("workExperience") if "workExperience" in payload else payload.get("work_experience")
        profile.work_experience = _json_dump(experience if isinstance(experience, list) else [])
    if "education" in payload:
        education = payload.get("education")
        profile.education = _json_dump(education if isinstance(education, list) else [])

    # Job preferences
    if "preferredJobType" in payload or "preferred_job_type" in payload:
        pref = payload.get("preferredJobType") if "preferredJobType" in payload else payload.get("preferred_job_type")
        profile.preferred_job_type = str(pref or "").strip() or None
    if "availability" in payload:
        profile.availability = str(payload.get("availability") or "").strip() or None
    if "expectedSalaryAoa" in payload or "expected_salary_aoa" in payload:
        salary_raw = payload.get("expectedSalaryAoa") if "expectedSalaryAoa" in payload else payload.get("expected_salary_aoa")
        try:
            salary_val = int(salary_raw) if salary_raw not in (None, "") else None
            profile.expected_salary_aoa = salary_val if (salary_val is None or salary_val >= 0) else None
        except (TypeError, ValueError):
            profile.expected_salary_aoa = None

    # Auto-apply preferences (preference capture only — see model comment).
    if "preferredJobCategories" in payload or "preferred_job_categories" in payload:
        categories = payload.get("preferredJobCategories") if "preferredJobCategories" in payload else payload.get("preferred_job_categories")
        profile.preferred_job_categories = _json_dump(_coerce_list(categories))
    if "autoApplyOptIn" in payload or "auto_apply_opt_in" in payload:
        opt_in = payload.get("autoApplyOptIn") if "autoApplyOptIn" in payload else payload.get("auto_apply_opt_in")
        profile.auto_apply_opt_in = bool(opt_in)


@router.get("/profile")
async def get_candidate_profile(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get current candidate profile using frontend-compatible payload shape."""
    _ensure_candidate_user(current_user)
    profile = _ensure_candidate_profile(db, current_user)

    return {
        "profile": _profile_to_payload(db, current_user, profile),
        "latestCvDocument": _latest_cv_document(db, profile),
    }


@router.patch("/profile")
async def patch_candidate_profile(
    payload: dict[str, Any],
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Patch candidate profile from onboarding/profile pages."""
    _ensure_candidate_user(current_user)
    profile = _ensure_candidate_profile(db, current_user)

    _apply_profile_payload(profile, current_user, payload or {})
    db.commit()
    db.refresh(profile)
    db.refresh(current_user)

    return {
        "profile": _profile_to_payload(db, current_user, profile),
        "latestCvDocument": _latest_cv_document(db, profile),
    }


@router.put("/profile")
async def update_candidate_profile(
    payload: dict[str, Any],
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Backward-compatible full update endpoint."""
    return await patch_candidate_profile(payload=payload, db=db, current_user=current_user)


@router.patch("/onboarding/complete")
async def complete_onboarding(
    payload: dict[str, Any],
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Mark onboarding complete and persist the provided profile draft."""
    _ensure_candidate_user(current_user)
    profile = _ensure_candidate_profile(db, current_user)

    _apply_profile_payload(profile, current_user, payload or {})
    profile.has_completed_onboarding = True

    db.commit()
    db.refresh(profile)
    db.refresh(current_user)

    return {
        "message": "Onboarding concluido com sucesso.",
        "profile": _profile_to_payload(db, current_user, profile),
    }


@router.patch("/tutorial/seen")
async def mark_candidate_tutorial_seen(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Mark tutorial as seen for candidate users to avoid onboarding shell 404s."""
    _ensure_candidate_user(current_user)
    profile = _ensure_candidate_profile(db, current_user)
    profile.has_seen_tutorial = True
    db.commit()
    db.refresh(profile)

    return {"message": "Tutorial marcado como visto.", "profile": _profile_to_payload(db, current_user, profile)}


@router.post("/profile/summary-draft")
async def generate_summary_draft(
    payload: dict[str, Any],
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Generate a simple summary draft from provided profile data."""
    _ensure_candidate_user(current_user)
    profile_data = payload.get("profile") if isinstance(payload, dict) else None
    profile = profile_data if isinstance(profile_data, dict) else {}

    name = str(profile.get("fullName") or current_user.full_name or "Profissional").strip()
    title = str(profile.get("professionalTitle") or profile.get("jobTitle") or "").strip()
    location = str(profile.get("location") or "").strip()
    skills = _coerce_list(profile.get("skills"))

    parts: list[str] = []
    parts.append(f"{name} e um profissional")
    if title:
        parts[-1] += f" focado em {title}"
    if location:
        parts[-1] += f", baseado em {location}"
    parts[-1] += "."

    if skills:
        top_skills = ", ".join(skills[:5])
        parts.append(f"Tem experiencia pratica em {top_skills}.")

    parts.append("Procura contribuir com impacto, colaboracao e foco em resultados.")
    summary = " ".join(parts)

    return {"summary": summary, "draft": summary}


@router.post("/cv/parse")
async def parse_candidate_cv(
    cv: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Upload CV and enqueue async parsing job."""
    _ensure_candidate_user(current_user)
    profile = _ensure_candidate_profile(db, current_user)

    suffix = Path(cv.filename or "").suffix.lower()
    if suffix not in _ALLOWED_EXTENSIONS and (cv.content_type or "") not in _ALLOWED_MIME_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Formato invalido. Use PDF, DOC ou DOCX.",
        )

    file_content = await cv.read()
    if not file_content:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Ficheiro vazio.")

    max_bytes = max(1, settings.CV_PARSE_MAX_UPLOAD_MB) * 1024 * 1024
    if len(file_content) > max_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"Ficheiro excede o limite de {settings.CV_PARSE_MAX_UPLOAD_MB}MB.",
        )

    day_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    jobs_today = (
        db.query(CVUpload)
        .filter(CVUpload.candidate_id == profile.id, CVUpload.created_at >= day_start)
        .count()
    )
    if jobs_today >= settings.CV_PARSE_MAX_JOBS_PER_USER_PER_DAY:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Limite diario de processamentos de CV atingido. Tente novamente amanha.",
        )

    # Sanitize the storage-key suffix: keep only the basename and strip any path
    # separators / traversal sequences so the upload can never write outside the
    # upload dir (local fallback) or create stray nested keys (S3/MinIO).
    safe_suffix = Path(cv.filename or "cv").name.replace("/", "_").replace("\\", "_") or "cv"
    file_name = f"{uuid.uuid4()}_{safe_suffix}"
    file_path = StorageService.save_file(file_content, file_name)

    cv_upload = CVUpload(
        candidate_id=profile.id,
        file_name=cv.filename or file_name,
        file_path=file_path,
        file_size=len(file_content),
        mime_type=cv.content_type or "application/octet-stream",
        parse_status="pending",
    )
    db.add(cv_upload)
    db.commit()
    db.refresh(cv_upload)

    parse_cv.delay(str(cv_upload.id))

    return {
        "success": True,
        "parseRunId": cv_upload.id,
        "status": "pending",
        "message": "CV recebido. Processamento em fila.",
        "file": {
            "id": cv_upload.id,
            "filename": cv_upload.file_name,
            "mimeType": cv_upload.mime_type,
            "size": cv_upload.file_size,
        },
    }


@router.get("/cv/parse/{parse_run_id}")
async def get_candidate_cv_parse_status(
    parse_run_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get async CV parsing status and parsed draft when available."""
    _ensure_candidate_user(current_user)
    profile = _ensure_candidate_profile(db, current_user)

    cv_upload = (
        db.query(CVUpload)
        .filter(CVUpload.id == parse_run_id, CVUpload.candidate_id == profile.id)
        .first()
    )
    if not cv_upload:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Execucao de parse nao encontrada.")

    if cv_upload.parse_status in {"pending", "processing"}:
        return {
            "success": True,
            "parseRunId": cv_upload.id,
            "status": cv_upload.parse_status,
            "message": "CV ainda em processamento.",
        }

    if cv_upload.parse_status == "failed":
        warnings = _json_load(cv_upload.parse_error, [])
        if not isinstance(warnings, list):
            warnings = [str(cv_upload.parse_error or "Falha no processamento do CV.")]
        return {
            "success": False,
            "parseRunId": cv_upload.id,
            "status": "failed",
            "warnings": warnings,
            "parserError": str(warnings[0]) if warnings else "Falha no processamento do CV.",
        }

    normalized_draft = _profile_to_payload(db, current_user, profile)
    missing_fields = [
        field
        for field in ["fullName", "email", "phone", "skills", "experience", "education"]
        if not normalized_draft.get(field)
    ]

    return {
        "success": True,
        "parseRunId": cv_upload.id,
        "status": "completed",
        "parsedProfile": normalized_draft,
        "profileDraft": normalized_draft,
        "confidence": {},
        "warnings": [],
        "missingFields": missing_fields,
        "file": {
            "id": cv_upload.id,
            "filename": cv_upload.file_name,
            "mimeType": cv_upload.mime_type,
            "size": cv_upload.file_size,
        },
    }


@router.get("/cv/documents")
async def list_candidate_cv_documents(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List uploaded candidate CV documents."""
    _ensure_candidate_user(current_user)
    profile = _ensure_candidate_profile(db, current_user)

    docs = (
        db.query(CVUpload)
        .filter(CVUpload.candidate_id == profile.id)
        .order_by(CVUpload.created_at.desc())
        .all()
    )
    return {
        "documents": [
            {
                "_id": item.id,
                "id": item.id,
                "fileName": item.file_name,
                "type": "cv",
                "createdAt": item.created_at.isoformat() if item.created_at else None,
            }
            for item in docs
        ]
    }


@router.delete("/cv/documents/{document_id}")
async def delete_candidate_cv_document(
    document_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete an uploaded candidate CV document."""
    _ensure_candidate_user(current_user)
    profile = _ensure_candidate_profile(db, current_user)

    doc = db.query(CVUpload).filter(CVUpload.id == document_id, CVUpload.candidate_id == profile.id).first()
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Documento nao encontrado.")

    StorageService.delete_file(doc.file_path)
    db.delete(doc)
    db.commit()
    return {"message": "Documento removido."}


@router.get("/cv/export")
async def export_candidate_cv(
    format: str = Query(default="pdf", pattern="^(pdf|docx|json)$"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Export the candidate's saved profile as a formatted CV (PDF, DOCX, or JSON-Resume)."""
    _ensure_candidate_user(current_user)
    profile = _ensure_candidate_profile(db, current_user)

    def _jl(value, default):
        if not value:
            return default
        try:
            return json.loads(value)
        except Exception:
            return default

    profile_dict = {
        "fullName": current_user.full_name or "",
        "email": current_user.email or "",
        "phone": profile.phone or "",
        "location": profile.location or "",
        "linkedinUrl": profile.linkedin_url or "",
        "portfolioUrl": profile.portfolio_url or "",
        "githubUrl": profile.github_url or "",
        "professionalTitle": profile.job_title or "",
        "professionalSummary": profile.professional_summary or "",
        "skills": _jl(profile.skills, []),
        "hardSkills": _jl(getattr(profile, "hard_skills", None), []),
        "techniques": _jl(getattr(profile, "techniques", None), []),
        "tools": _jl(getattr(profile, "tools", None), []),
        "languages": _jl(profile.languages, []),
        "certifications": _jl(profile.certifications, []),
        "workExperience": _jl(profile.work_experience, []),
        "education": _jl(profile.education, []),
    }

    safe_name = (current_user.full_name or "cv").replace(" ", "_").lower()

    try:
        if format == "docx":
            data = to_docx(profile_dict)
            return Response(
                content=data,
                media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                headers={"Content-Disposition": f'attachment; filename="{safe_name}_cv.docx"'},
            )
        elif format == "json":
            data = json.dumps(to_json_resume(profile_dict), ensure_ascii=False, indent=2).encode("utf-8")
            return Response(
                content=data,
                media_type="application/json",
                headers={"Content-Disposition": f'attachment; filename="{safe_name}_cv.json"'},
            )
        else:  # pdf
            data = to_pdf(profile_dict)
            return Response(
                content=data,
                media_type="application/pdf",
                headers={"Content-Disposition": f'attachment; filename="{safe_name}_cv.pdf"'},
            )
    except Exception as exc:
        logger.error(f"CV export error: {exc}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Erro ao gerar CV. Tente novamente.",
        )


@router.post("/profile/approve")
async def approve_profile_from_cv(
    payload: dict[str, Any],
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Apply a reviewed parsed profile draft to the candidate profile."""
    _ensure_candidate_user(current_user)
    profile = _ensure_candidate_profile(db, current_user)

    profile_draft = payload.get("profileDraft") if isinstance(payload, dict) else None
    if not isinstance(profile_draft, dict):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Perfil para aprovacao invalido.")

    _apply_profile_payload(profile, current_user, profile_draft)
    db.commit()
    db.refresh(profile)
    db.refresh(current_user)

    return {
        "message": "Perfil atualizado com sucesso.",
        "profile": _profile_to_payload(db, current_user, profile),
    }


# ── Candidate job discovery & bookmarks ─────────────────────────────────────

def _live_jobs_query(db: Session):
    return (
        db.query(Job)
        .options(joinedload(Job.company))  # avoid N+1 when serializing
        .filter(Job.status.in_(PUBLIC_JOB_STATUSES))
        .filter(Job.visibility == "public")
    )


@router.get("/jobs/recommended")
async def recommended_jobs(
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Recommend live jobs for the candidate.

    Heuristic v1: rank by overlap between the job category/skills and the
    candidate's skills, falling back to most-recent. (No external AI dependency.)
    """
    if current_user.role != UserRole.candidate:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Candidate access required")

    profile = db.query(CandidateProfile).filter(CandidateProfile.user_id == current_user.id).first()
    skills = set()
    if profile and profile.skills:
        skills = {str(s).strip().lower() for s in _json_load(profile.skills, []) if str(s).strip()}

    rows = _live_jobs_query(db).order_by(Job.created_at.desc()).limit(200).all()

    def _score(job: Job) -> int:
        if not skills:
            return 0
        haystack = " ".join(
            filter(None, [job.title or "", job.category or "", job.required_skills or ""])
        ).lower()
        return sum(1 for skill in skills if skill and skill in haystack)

    ranked = sorted(rows, key=_score, reverse=True)
    total = len(ranked)
    start = (page - 1) * limit
    page_rows = ranked[start : start + limit]

    pagination = {
        "page": page,
        "limit": limit,
        "total": total,
        "totalPages": max(1, (total + limit - 1) // limit),
    }
    return {"jobs": [serialize_job(j) for j in page_rows], "pagination": pagination}


@router.get("/jobs/saved")
async def list_saved_jobs(
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List the candidate's saved jobs (newest first)."""
    query = (
        db.query(SavedJob, Job)
        .join(Job, Job.id == SavedJob.job_id)
        .filter(SavedJob.candidate_user_id == current_user.id)
        .order_by(SavedJob.created_at.desc())
    )
    total = query.count()
    rows = query.offset((page - 1) * limit).limit(limit).all()

    items = [
        {
            "_id": saved.id,
            "status": "saved",
            "savedAt": saved.created_at.isoformat() if saved.created_at else None,
            "job": serialize_job(job),
        }
        for saved, job in rows
    ]
    pagination = {
        "page": page,
        "limit": limit,
        "total": total,
        "totalPages": max(1, (total + limit - 1) // limit),
    }
    return {"jobs": items, "savedJobs": items, "pagination": pagination}


@router.post("/jobs/save")
async def save_job(
    payload: dict[str, Any],
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Bookmark a job for the candidate (idempotent)."""
    job_id = str(payload.get("jobId", "")).strip()
    if not job_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="jobId is required")

    job = db.query(Job).filter(Job.id == job_id).first()
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")

    existing = (
        db.query(SavedJob)
        .filter(SavedJob.candidate_user_id == current_user.id, SavedJob.job_id == job_id)
        .first()
    )
    if existing:
        return {"message": "Already saved", "savedJobId": existing.id}

    saved = SavedJob(candidate_user_id=current_user.id, job_id=job_id)
    db.add(saved)
    db.commit()
    db.refresh(saved)
    return {"message": "Job saved", "savedJobId": saved.id}


@router.delete("/jobs/saved/{job_id}")
async def unsave_job(
    job_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Remove a saved job by job id."""
    saved = (
        db.query(SavedJob)
        .filter(SavedJob.candidate_user_id == current_user.id, SavedJob.job_id == job_id)
        .first()
    )
    if not saved:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Saved job not found")
    db.delete(saved)
    db.commit()
    return {"deleted": True, "jobId": job_id}


# ── Job alerts (saved searches) ─────────────────────────────────────────────

def _serialize_alert(a: JobAlert) -> dict[str, Any]:
    return {
        "_id": a.id,
        "keyword": a.keyword,
        "location": a.location,
        "category": a.category,
        "workMode": a.work_mode,
        "frequency": a.frequency,
        "active": bool(a.active),
        "lastNotifiedAt": a.last_notified_at.isoformat() if a.last_notified_at else None,
        "createdAt": a.created_at.isoformat() if a.created_at else None,
    }


def _alert_match_count(db: Session, a: JobAlert) -> int:
    q = _live_jobs_query(db)
    if a.keyword:
        q = q.filter(Job.title.ilike(f"%{a.keyword}%"))
    if a.location:
        q = q.filter(Job.location.ilike(f"%{a.location}%"))
    if a.category:
        q = q.filter(Job.category == a.category)
    if a.work_mode:
        q = q.filter(Job.work_mode == a.work_mode)
    return q.count()


@router.get("/alerts")
async def list_alerts(
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = db.query(JobAlert).filter(JobAlert.candidate_user_id == current_user.id).order_by(JobAlert.created_at.desc())
    total = query.count()
    rows = query.offset((page - 1) * limit).limit(limit).all()
    alerts = [{**_serialize_alert(a), "matchCount": _alert_match_count(db, a)} for a in rows]
    pagination = {"page": page, "limit": limit, "total": total, "totalPages": max(1, (total + limit - 1) // limit)}
    return {"alerts": alerts, "pagination": pagination}


@router.post("/alerts")
async def create_alert(
    payload: dict[str, Any],
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _ensure_candidate_user(current_user)
    freq = str(payload.get("frequency", "daily")).strip().lower()
    if freq == "immediate":
        freq = "instant"
    if freq not in {"instant", "daily", "weekly"}:
        freq = "daily"
    alert = JobAlert(
        candidate_user_id=current_user.id,
        keyword=str(payload.get("keyword", "")).strip() or None,
        location=str(payload.get("location", "")).strip() or None,
        category=str(payload.get("category", "")).strip() or None,
        work_mode=str(payload.get("workMode", "")).strip() or None,
        frequency=freq,
        active=bool(payload.get("active", True)),
    )
    db.add(alert)
    db.commit()
    db.refresh(alert)
    return {"alert": {**_serialize_alert(alert), "matchCount": _alert_match_count(db, alert)}}


@router.patch("/alerts/{alert_id}")
async def update_alert(
    alert_id: str,
    payload: dict[str, Any],
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    alert = db.query(JobAlert).filter(JobAlert.id == alert_id, JobAlert.candidate_user_id == current_user.id).first()
    if not alert:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Alert not found")
    for key, attr in (("keyword", "keyword"), ("location", "location"), ("category", "category"), ("workMode", "work_mode")):
        if key in payload:
            setattr(alert, attr, str(payload[key] or "").strip() or None)
    if "frequency" in payload and str(payload["frequency"]).lower() in {"instant", "daily", "weekly"}:
        alert.frequency = str(payload["frequency"]).lower()
    if "active" in payload:
        alert.active = bool(payload["active"])
    db.commit()
    db.refresh(alert)
    return {"alert": _serialize_alert(alert)}


@router.delete("/alerts/{alert_id}")
async def delete_alert(
    alert_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    alert = db.query(JobAlert).filter(JobAlert.id == alert_id, JobAlert.candidate_user_id == current_user.id).first()
    if not alert:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Alert not found")
    db.delete(alert)
    db.commit()
    return {"deleted": True, "alertId": alert_id}


# ── Notification preferences ────────────────────────────────────────────────

_DEFAULT_PREFS = {
    "emailJobAlerts": True,
    "emailApplicationUpdates": True,
    "emailMarketing": False,
    "smsAlerts": False,
    "whatsappAlerts": False,
}


@router.get("/notifications/preferences")
async def get_notification_preferences(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    profile = db.query(CandidateProfile).filter(CandidateProfile.user_id == current_user.id).first()
    prefs = dict(_DEFAULT_PREFS)
    if profile and getattr(profile, "certifications", None):
        # Reuse no extra column; preferences stored client-side for now. Return defaults.
        pass
    return {"preferences": prefs}


@router.patch("/notifications/preferences")
async def update_notification_preferences(
    payload: dict[str, Any],
    current_user: User = Depends(get_current_user),
):
    merged = {**_DEFAULT_PREFS, **{k: bool(v) for k, v in (payload or {}).items() if k in _DEFAULT_PREFS}}
    return {"preferences": merged}


# ── Generated (tailored) CV profiles ────────────────────────────────────────

@router.get("/cv-profiles")
async def list_cv_profiles(current_user: User = Depends(get_current_user)):
    """Tailored CV variants. (Storage model pending — returns empty set for now.)"""
    return {"profiles": []}


@router.post("/cv-profiles/generate")
async def generate_cv_profile(
    payload: dict[str, Any],
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    profile = db.query(CandidateProfile).filter(CandidateProfile.user_id == current_user.id).first()
    target = str(payload.get("targetField", "")).strip() or "Geral"
    generated = {
        "_id": str(uuid.uuid4()),
        "targetField": target,
        "label": f"CV — {target}",
        "professionalSummary": (profile.professional_summary if profile else "") or "",
        "keySkills": _coerce_list(_json_load(profile.skills, [])) if profile else [],
        "experienceHighlights": [],
        "suggestedKeywords": [],
        "coverLetterDraft": "",
        "approved": False,
        "updatedAt": datetime.now(timezone.utc).isoformat(),
    }
    return {"profile": generated}


@router.post("/cv-profiles/{profile_id}/duplicate")
async def duplicate_cv_profile(profile_id: str, current_user: User = Depends(get_current_user)):
    return {"profile": {"_id": str(uuid.uuid4()), "label": "CV (cópia)", "approved": False}}


@router.delete("/cv-profiles/{profile_id}")
async def delete_cv_profile(profile_id: str, current_user: User = Depends(get_current_user)):
    return {"deleted": True, "id": profile_id}
