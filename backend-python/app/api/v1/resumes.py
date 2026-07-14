"""Resume API endpoints — the native CV builder (EXECUTION_PLAN_NATIVE_CV_BUILDER.md).

`Resume.data`'s canonical shape is deliberately identical to the flat
profile dict app.services.cv_export_service already consumes (fullName,
email, phone, location, linkedinUrl, portfolioUrl, githubUrl,
professionalTitle, professionalSummary, skills/hardSkills/techniques/tools,
languages, certifications, workExperience, education) — see
_profile_to_resume_data() below. This means export needs zero translation
layer: `json.loads(resume.data)` is already what to_pdf/to_docx/
to_json_resume expect.

Deliberately does NOT use `from __future__ import annotations` — every
@limiter.limit(...)-decorated endpoint here takes a Pydantic body param, and
on this repo's pinned fastapi==0.104.1, deferred (string/ForwardRef) type
hints combined with slowapi's decorator wrapping breaks FastAPI/Pydantic's
ability to resolve the body model at request time (either silently
misreading it as a missing query param, or crashing with
`PydanticUserError: ... is not fully defined`). Every other file in this
API package has the future import; this one must not, precisely because it
has the most decorator+body-param endpoints of any of them.
"""

import json
import secrets
import uuid
from datetime import datetime, timedelta
from typing import Any
from fastapi import APIRouter, Body, Depends, HTTPException, Query, Request, status
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.logging import get_logger
from app.core.observability import limiter
from app.db.session import get_db
from app.models import (
    CandidateProfile,
    CVUpload,
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
    CoverLetterUpdateRequest,
    JobMatchResponse,
    MessageResponse,
    ResumeApplyToProfileResponse,
    ResumeCreateRequest,
    ResumeResponse,
    ResumeRewriteRequest,
    ResumeRewriteResponse,
    ResumeScoreResponse,
    ResumeTemplateResponse,
    ResumeUpdateRequest,
)
from app.core.config import get_settings
from app.services.auth_service import AuthService
from app.services.resume_ai_service import ResumeAIService
from app.services.cv_export_service import letter_to_pdf, to_docx, to_json_resume, to_pdf
from app.services import resume_render_service
from app.services.storage_service import StorageService
from app.services.candidate_billing_service import (
    assert_cover_letters_allowed,
    assert_resume_quota,
    cv_uses_free_ai_tier,
)
from app.workers.tasks import send_guest_cv_claim_email

settings = get_settings()

logger = get_logger(__name__)
router = APIRouter(prefix="/resumes", tags=["resumes"])


def _maybe_send_guest_claim_email(db: Session, current_user: User) -> None:
    """C5 (EXECUTION_PLAN_NATIVE_CV_BUILDER.md): one-time "O seu CV está
    guardado" nudge, fired on a guest account's first export. Rate-limited
    to once-ever via guest_claim_email_sent_at, not a rolling window — this
    is a one-shot conversion nudge, not a recurring notification."""
    if not current_user.is_guest_account or current_user.guest_claim_email_sent_at:
        return
    raw_token = AuthService.create_password_reset_token(db, current_user)
    current_user.guest_claim_email_sent_at = datetime.utcnow()
    db.commit()
    send_guest_cv_claim_email.delay(str(current_user.id), raw_token)


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


def _template_slug(db: Session, template_id: str | None) -> str | None:
    """resume_render_service.TEMPLATES is keyed by ResumeTemplate.slug
    (e.g. "ats-classic"), but Resume.template_id stores the FK's uuid — this
    resolves one to the other. None falls through to the render service's
    own default."""
    if not template_id:
        return None
    template = db.query(ResumeTemplate).filter(ResumeTemplate.id == template_id).first()
    return template.slug if template else None


def _profile_to_resume_data(current_user: User, profile: CandidateProfile) -> dict[str, Any]:
    """Canonical Resume.data shape — identical to the profile dict
    cv_export_service consumes, so export needs no translation layer.
    Mirrors the local dict built in candidates.py's /cv/export endpoint."""
    def _jl(value, default):
        if not value:
            return default
        try:
            return json.loads(value)
        except Exception:
            return default

    return {
        "fullName": current_user.full_name or "",
        "email": current_user.email or "",
        "phone": profile.phone or "",
        "location": profile.location or "",
        "postcode": profile.postcode or "",
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


VERSION_SNAPSHOT_MIN_INTERVAL_SECONDS = 30 * 60


def _snapshot_due(db: Session, resume: Resume) -> bool:
    """True when the newest version is old enough (or absent) that another
    automatic snapshot is worth keeping — see update_resume. A single
    MAX() aggregate instead of loading resume.versions (this runs on every
    autosave, so a full-collection lazy-load here would be a real N+1)."""
    latest = (
        db.query(func.max(ResumeVersion.created_at))
        .filter(ResumeVersion.resume_id == resume.id)
        .scalar()
    )
    if latest is None:
        return True
    return datetime.utcnow() - latest > timedelta(seconds=VERSION_SNAPSHOT_MIN_INTERVAL_SECONDS)


def _create_resume_version(db: Session, resume: Resume, user_id: str, notes: str) -> None:
    # COUNT() instead of len(resume.versions) — avoids loading every prior
    # snapshot's full data payload just to number the next one.
    version_number = (
        db.query(func.count(ResumeVersion.id)).filter(ResumeVersion.resume_id == resume.id).scalar() or 0
    ) + 1
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


# NOTE: /matches (and any other static single-segment GET route) must be
# registered before GET /{resume_id} — Starlette matches routes in
# registration order, so a static route defined after a dynamic one is
# unreachable (GET /resumes/matches would match /{resume_id} first with
# resume_id="matches" and 404). This was a pre-existing bug; fixed by
# ordering, not by changing the URL shape.
@router.get("/matches", response_model=list[JobMatchResponse])
async def list_job_matches(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _ensure_candidate_user(current_user)
    profile = _ensure_candidate_profile(db, current_user)
    matches = db.query(JobMatch).filter(JobMatch.candidate_profile_id == profile.id).order_by(JobMatch.match_percentage.desc()).all()
    return matches


# Same registration-order rule as /matches above — /cover-letters (static)
# must come before GET /{resume_id} (dynamic).
@router.get("/cover-letters", response_model=list[CoverLetterResponse])
async def list_cover_letters(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _ensure_candidate_user(current_user)
    profile = _ensure_candidate_profile(db, current_user)
    letters = db.query(CoverLetter).filter(CoverLetter.candidate_profile_id == profile.id).order_by(CoverLetter.updated_at.desc()).all()
    return letters


@router.post("/", response_model=ResumeResponse)
@limiter.limit("30/hour")
async def create_resume(
    payload: ResumeCreateRequest = Body(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    request: Request = None,
):
    _ensure_candidate_user(current_user)
    profile = _ensure_candidate_profile(db, current_user)
    assert_resume_quota(db, profile.id)

    data = _profile_to_resume_data(current_user, profile) if payload.from_profile else (payload.data or {})
    summary = (payload.summary or "").strip() or (data.get("professionalSummary") if payload.from_profile else None)

    resume = Resume(
        candidate_profile_id=profile.id,
        title=payload.title.strip(),
        summary=summary,
        template_id=payload.template_id,
        data=json.dumps(data, ensure_ascii=False),
        is_draft=bool(payload.is_draft),
        is_published=not bool(payload.is_draft),
    )
    db.add(resume)
    db.commit()
    db.refresh(resume)
    return _resume_payload(resume)


@router.post("/{resume_id}/duplicate", response_model=ResumeResponse)
@limiter.limit("30/hour")
async def duplicate_resume(
    resume_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    request: Request = None,
):
    """Clone a resume — the core "tailor per application" flow: keep the
    original, duplicate it, adapt the copy for a specific job."""
    _ensure_candidate_user(current_user)
    profile = _ensure_candidate_profile(db, current_user)
    original = db.query(Resume).filter(Resume.id == resume_id, Resume.candidate_profile_id == profile.id).first()
    if not original:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Resume not found")
    assert_resume_quota(db, profile.id)

    copy = Resume(
        candidate_profile_id=profile.id,
        title=f"{original.title} (cópia)",
        summary=original.summary,
        template_id=original.template_id,
        data=original.data,
        is_draft=True,
        is_published=False,
    )
    db.add(copy)
    db.commit()
    db.refresh(copy)
    return _resume_payload(copy)


# Resume.data field -> CandidateProfile column, for apply_resume_to_profile
# below. Deliberately excludes fullName/email — those live on User, and an
# email change in particular must never happen through a CV sync (it's the
# login identifier; changing it needs a dedicated verified flow, not a
# side-effect of "Aplicar ao perfil"). "skills" (the flat combined list) is
# also excluded: the builder UI has no field for it (only hardSkills/
# techniques/tools), so resume.data never actually carries it — mapping it
# would only ever silently do nothing, not worth the confusion of listing it.
_RESUME_TO_PROFILE_FIELDS: list[tuple[str, str]] = [
    ("phone", "phone"),
    ("location", "location"),
    ("postcode", "postcode"),
    ("linkedinUrl", "linkedin_url"),
    ("portfolioUrl", "portfolio_url"),
    ("githubUrl", "github_url"),
    ("professionalTitle", "job_title"),
    ("professionalSummary", "professional_summary"),
]
_RESUME_TO_PROFILE_JSON_FIELDS: list[tuple[str, str]] = [
    ("hardSkills", "hard_skills"),
    ("techniques", "techniques"),
    ("tools", "tools"),
    ("languages", "languages"),
    ("certifications", "certifications"),
    ("workExperience", "work_experience"),
    ("education", "education"),
]


@router.post("/{resume_id}/apply-to-profile", response_model=ResumeApplyToProfileResponse)
@limiter.limit("20/hour")
async def apply_resume_to_profile(
    resume_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    request: Request = None,
):
    """"Aplicar ao perfil" — the inverse of "A partir do meu perfil":
    syncs this resume's content back onto the candidate's profile, so a CV
    built/edited in the Construtor doesn't require a manual download +
    re-upload round-trip to update the profile recruiters/matching see.

    Never blanks a profile field: a field is only overwritten when the
    resume actually has non-empty content for it. Also renders the resume
    as a PDF and attaches it as the candidate's latest CV document (the
    same CVUpload record CV-e-Documentos/Meu-Perfil already read), via the
    same StorageService path /cv/upload uses — not a raw filesystem path
    (file_path is a "server:<key>" ref)."""
    _ensure_candidate_user(current_user)
    profile = _ensure_candidate_profile(db, current_user)
    resume = db.query(Resume).filter(Resume.id == resume_id, Resume.candidate_profile_id == profile.id).first()
    if not resume:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Resume not found")

    data = _load_json_field(resume.data) or {}
    updated_fields: list[str] = []

    for data_key, profile_attr in _RESUME_TO_PROFILE_FIELDS:
        value = data.get(data_key)
        if isinstance(value, str) and value.strip():
            if getattr(profile, profile_attr) != value:
                setattr(profile, profile_attr, value)
                updated_fields.append(profile_attr)

    for data_key, profile_attr in _RESUME_TO_PROFILE_JSON_FIELDS:
        value = data.get(data_key)
        if isinstance(value, list) and value:
            encoded = json.dumps(value, ensure_ascii=False)
            if getattr(profile, profile_attr) != encoded:
                setattr(profile, profile_attr, encoded)
                updated_fields.append(profile_attr)

    db.commit()

    cv_document_id = None
    try:
        pdf_bytes = None
        if settings.RESUME_WEASYPRINT_ENABLED:
            try:
                pdf_bytes = resume_render_service.render_pdf(data, _template_slug(db, resume.template_id))
            except Exception as exc:
                logger.error(f"WeasyPrint render failed during apply-to-profile, falling back to reportlab: {exc}")
        if pdf_bytes is None:
            pdf_bytes = to_pdf(data)

        safe_name = (resume.title or "cv").strip().replace(" ", "_").lower() or "cv"
        file_name = f"{uuid.uuid4()}_{safe_name}.pdf"
        file_path = StorageService.save_file(pdf_bytes, file_name)
        cv_upload = CVUpload(
            candidate_id=profile.id,
            file_name=f"{resume.title or 'CV'}.pdf",
            file_path=file_path,
            file_size=len(pdf_bytes),
            mime_type="application/pdf",
            parse_status="skipped",  # source is already structured Resume.data — no parsing needed
        )
        db.add(cv_upload)
        db.commit()
        db.refresh(cv_upload)
        cv_document_id = cv_upload.id
    except Exception as exc:
        # Profile fields already synced and committed above — a PDF/storage
        # failure here shouldn't roll that back or fail the whole request.
        logger.error(f"apply-to-profile: failed to attach rendered PDF as CV document: {exc}")

    return ResumeApplyToProfileResponse(updated_fields=updated_fields, cv_document_id=cv_document_id)


@router.post("/{resume_id}/refresh-from-profile", response_model=ResumeResponse)
@limiter.limit("30/hour")
async def refresh_resume_from_profile(
    resume_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    request: Request = None,
):
    """The freshness-nudge action — the reverse of apply-to-profile: pulls
    the candidate's current profile data into this EXISTING resume
    (id/title/template/share_slug untouched), for when the profile changed
    after the resume was created/last edited. Unlike "A partir do meu
    perfil" at create time, this replaces the resume's data wholesale
    (it's an explicit, confirmed refresh — the candidate is choosing to
    pull in whatever the profile currently has, not merge selectively)."""
    _ensure_candidate_user(current_user)
    profile = _ensure_candidate_profile(db, current_user)
    resume = db.query(Resume).filter(Resume.id == resume_id, Resume.candidate_profile_id == profile.id).first()
    if not resume:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Resume not found")

    data = _profile_to_resume_data(current_user, profile)
    resume.data = json.dumps(data, ensure_ascii=False)
    if data.get("professionalSummary"):
        resume.summary = data["professionalSummary"]
    db.commit()
    db.refresh(resume)
    return _resume_payload(resume)


@router.delete("/{resume_id}", response_model=MessageResponse)
async def delete_resume(
    resume_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _ensure_candidate_user(current_user)
    profile = _ensure_candidate_profile(db, current_user)
    resume = db.query(Resume).filter(Resume.id == resume_id, Resume.candidate_profile_id == profile.id).first()
    if not resume:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Resume not found")

    db.query(ResumeVersion).filter(ResumeVersion.resume_id == resume.id).delete()
    db.delete(resume)
    db.commit()
    return {"message": "Resume eliminado."}


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

    # Throttled history snapshot (B4): before overwriting data, capture the
    # outgoing state — but at most once per VERSION_SNAPSHOT_MIN_INTERVAL,
    # since the editor autosaves every ~10s and per-save versions would just
    # be noise. The rewrite endpoint still snapshots unconditionally (an AI
    # rewrite is always a meaningful boundary).
    if payload.data is not None:
        new_data_json = json.dumps(payload.data, ensure_ascii=False)
        if new_data_json != (resume.data or "") and _snapshot_due(db, resume):
            _create_resume_version(db, resume, current_user.id, "Snapshot automático antes de alterações.")

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


@router.get("/{resume_id}/export")
@limiter.limit("60/hour")
async def export_resume(
    resume_id: str,
    format: str = Query(default="pdf", pattern="^(pdf|docx|json)$"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    request: Request = None,
):
    """Export a specific resume document as PDF/DOCX/JSON-Resume.

    Zero translation layer: Resume.data IS already the profile-dict shape
    to_pdf/to_docx/to_json_resume expect (see module docstring)."""
    _ensure_candidate_user(current_user)
    profile = _ensure_candidate_profile(db, current_user)
    resume = db.query(Resume).filter(Resume.id == resume_id, Resume.candidate_profile_id == profile.id).first()
    if not resume:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Resume not found")

    resume_data = _load_json_field(resume.data) or {}
    safe_name = (resume.title or "cv").strip().replace(" ", "_").lower() or "cv"
    _maybe_send_guest_claim_email(db, current_user)

    try:
        if format == "docx":
            data = to_docx(resume_data)
            return Response(
                content=data,
                media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                headers={"Content-Disposition": f'attachment; filename="{safe_name}.docx"'},
            )
        elif format == "json":
            data = json.dumps(to_json_resume(resume_data), ensure_ascii=False, indent=2).encode("utf-8")
            return Response(
                content=data,
                media_type="application/json",
                headers={"Content-Disposition": f'attachment; filename="{safe_name}.json"'},
            )
        else:  # pdf
            data = None
            if settings.RESUME_WEASYPRINT_ENABLED:
                try:
                    data = resume_render_service.render_pdf(resume_data, _template_slug(db, resume.template_id))
                except Exception as exc:
                    # Ship-dark guarantee: a WeasyPrint-specific failure (missing
                    # pango at runtime, a malformed template) never 500s the
                    # export — it silently falls through to the Phase A path.
                    # error (not warning): the fallback renderer is ATS-only —
                    # a template-selecting user's download silently stops
                    # matching their share page. That's a regression worth
                    # paging on, not a quiet log line.
                    logger.error(f"WeasyPrint render failed, falling back to ATS-only reportlab renderer: {exc}")
            if data is None:
                data = to_pdf(resume_data)
            return Response(
                content=data,
                media_type="application/pdf",
                headers={"Content-Disposition": f'attachment; filename="{safe_name}.pdf"'},
            )
    except Exception as exc:
        logger.error(f"Resume export error: {exc}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Erro ao gerar CV. Tente novamente.",
        )


@router.get("/{resume_id}/preview.html")
async def preview_resume_html(
    resume_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Same-origin HTML render of a resume, for iframe-embedding in the
    editor (Phase B) — the same template that drives the PDF export, so the
    preview and the download can never drift apart the way the Phase A
    client-side AtsClassic.tsx and the reportlab to_pdf() can. Dark behind
    RESUME_WEASYPRINT_ENABLED until B2 switches the frontend over to it."""
    if not settings.RESUME_WEASYPRINT_ENABLED:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")

    _ensure_candidate_user(current_user)
    profile = _ensure_candidate_profile(db, current_user)
    resume = db.query(Resume).filter(Resume.id == resume_id, Resume.candidate_profile_id == profile.id).first()
    if not resume:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Resume not found")

    resume_data = _load_json_field(resume.data) or {}
    html = resume_render_service.render_html(resume_data, _template_slug(db, resume.template_id))
    return Response(content=html, media_type="text/html")


class ResumeShareRequest(BaseModel):
    published: bool


@router.post("/{resume_id}/share")
@limiter.limit("30/hour")
async def share_resume(
    resume_id: str,
    payload: ResumeShareRequest = Body(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    request: Request = None,
):
    """Toggle a resume's public share page (Phase B3). First publish mints a
    permanent random share_slug (kept on unpublish so re-publishing restores
    the same URL — links a candidate already sent around don't rot just
    because they toggled visibility twice)."""
    _ensure_candidate_user(current_user)
    profile = _ensure_candidate_profile(db, current_user)
    resume = db.query(Resume).filter(Resume.id == resume_id, Resume.candidate_profile_id == profile.id).first()
    if not resume:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Resume not found")

    if payload.published and not resume.share_slug:
        for _ in range(5):  # share_slug is unique — retry on the (unlikely) collision
            candidate_slug = secrets.token_urlsafe(8)
            if not db.query(Resume).filter(Resume.share_slug == candidate_slug).first():
                resume.share_slug = candidate_slug
                break
        else:
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Erro ao gerar ligação. Tente novamente.")

    resume.is_published = payload.published
    db.commit()
    db.refresh(resume)
    return _resume_payload(resume)


def _owned_resume(db: Session, resume_id: str, current_user: User) -> Resume:
    _ensure_candidate_user(current_user)
    profile = _ensure_candidate_profile(db, current_user)
    resume = db.query(Resume).filter(Resume.id == resume_id, Resume.candidate_profile_id == profile.id).first()
    if not resume:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Resume not found")
    return resume


@router.get("/{resume_id}/versions")
async def list_resume_versions(
    resume_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Version history metadata, newest first — no data payloads (a long
    history of full CV snapshots would be a heavy response for a list the
    UI only renders as rows; GET /versions/{id} fetches one on demand)."""
    resume = _owned_resume(db, resume_id, current_user)
    versions = (
        db.query(ResumeVersion)
        .filter(ResumeVersion.resume_id == resume.id)
        .order_by(ResumeVersion.version_number.desc())
        .all()
    )
    return [
        {
            "id": v.id,
            "version_number": v.version_number,
            "title": v.title,
            "change_summary": v.change_summary,
            "created_at": v.created_at,
        }
        for v in versions
    ]


@router.get("/{resume_id}/versions/{version_id}")
async def get_resume_version(
    resume_id: str,
    version_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """One full snapshot, for the panel's preview pane."""
    resume = _owned_resume(db, resume_id, current_user)
    version = db.query(ResumeVersion).filter(
        ResumeVersion.id == version_id, ResumeVersion.resume_id == resume.id,
    ).first()
    if not version:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Version not found")
    return {
        "id": version.id,
        "version_number": version.version_number,
        "title": version.title,
        "summary": version.summary,
        "data": _load_json_field(version.data) or {},
        "change_summary": version.change_summary,
        "created_at": version.created_at,
    }


@router.post("/{resume_id}/versions/{version_id}/restore")
@limiter.limit("30/hour")
async def restore_resume_version(
    resume_id: str,
    version_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    request: Request = None,
):
    """Restore-as-copy (never destructive, per the plan): the snapshot
    becomes a brand-new draft resume; the current resume and its history
    are untouched."""
    resume = _owned_resume(db, resume_id, current_user)
    version = db.query(ResumeVersion).filter(
        ResumeVersion.id == version_id, ResumeVersion.resume_id == resume.id,
    ).first()
    if not version:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Version not found")
    assert_resume_quota(db, resume.candidate_profile_id)

    copy = Resume(
        candidate_profile_id=resume.candidate_profile_id,
        title=f"{version.title} (v{version.version_number} restaurada)",
        summary=version.summary,
        template_id=resume.template_id,
        data=version.data,
        is_draft=True,
        is_published=False,
    )
    db.add(copy)
    db.commit()
    db.refresh(copy)
    return _resume_payload(copy)


class ResumeAdaptRequest(BaseModel):
    job_id: str


@router.post("/{resume_id}/adapt")
@limiter.limit("30/hour")
async def adapt_resume_to_job(
    resume_id: str,
    payload: ResumeAdaptRequest = Body(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    request: Request = None,
):
    """"Adaptar a esta vaga" (Phase C2): tailor Resume.data toward a job via
    the already-tested inject_job_keywords grounding pipeline. Never
    destructive — the pre-adaptation state is snapshotted as a version
    first, and inject_job_keywords itself only touches summary + skills
    (adding only skills the job actually lists). With
    CV_EXPORT_LLM_INJECTION_ENABLED off or the LLM unreachable, the data
    comes back unchanged and the response says so (changed=false) instead
    of failing."""
    from app.api.v1.jobs import serialize_job
    from app.models import Job
    from app.services.cv_export_service import inject_job_keywords

    resume = _owned_resume(db, resume_id, current_user)
    job = db.query(Job).filter(Job.id == payload.job_id).first()
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")

    original = _load_json_field(resume.data) or {}
    tailored = inject_job_keywords(original, serialize_job(job))

    original_skills = {str(s).lower() for s in (original.get("skills") or [])}
    added_skills = [s for s in (tailored.get("skills") or []) if str(s).lower() not in original_skills]
    summary_changed = (tailored.get("professionalSummary") or "") != (original.get("professionalSummary") or "")
    changed = bool(added_skills or summary_changed)

    # inject_job_keywords appends to the flat `skills` list, but both the
    # editor's Competências section and the exporters render `hardSkills`
    # whenever it's non-empty (flat skills is only their fallback) — so on
    # resumes created from a profile, additions would be invisible. Mirror
    # them into hardSkills so the candidate can actually see and edit them.
    if added_skills and tailored.get("hardSkills"):
        existing_hard = {str(s).lower() for s in tailored["hardSkills"]}
        tailored = dict(tailored)
        tailored["hardSkills"] = list(tailored["hardSkills"]) + [
            s for s in added_skills if str(s).lower() not in existing_hard
        ]

    if changed:
        _create_resume_version(db, resume, current_user.id, f"Antes de adaptar à vaga: {job.title}")
        resume.data = json.dumps(tailored, ensure_ascii=False)
        db.commit()
        db.refresh(resume)

    return {
        "resume": _resume_payload(resume),
        "changed": changed,
        "diff": {"summary_changed": summary_changed, "added_skills": added_skills},
        "job_title": job.title,
    }


# Public share page (B3) — its own router so the URL is /public/resumes/…,
# outside this file's authenticated /resumes prefix, matching the existing
# /public/cv-submissions and /public/resume-sso/* convention.
public_router = APIRouter(prefix="/public/resumes", tags=["resumes"])


@public_router.get("/{share_slug}")
async def get_public_resume(
    share_slug: str,
    db: Session = Depends(get_db),
):
    """Unauthenticated read of a published resume, consumed by the public
    share page (src/app/cv/[slug]/page.tsx). Only is_published rows resolve;
    an unpublished/unknown slug is indistinguishable from a missing one.
    Returns only render-relevant fields — no ids, no draft state."""
    resume = db.query(Resume).filter(Resume.share_slug == share_slug, Resume.is_published == True).first()
    if not resume:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Resume not found")

    return {
        "title": resume.title,
        "data": _load_json_field(resume.data) or {},
        "template_slug": _template_slug(db, resume.template_id),
        "updated_at": resume.updated_at,
    }


@router.post("/score", response_model=ResumeScoreResponse)
@limiter.limit("20/hour")
async def score_resume(
    payload: dict[str, str] = Body(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    request: Request = None,
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
    use_free_tier = cv_uses_free_ai_tier(db, profile.id)

    score_data = ResumeAIService.score_resume(resume, profile, use_free_tier=use_free_tier)
    _save_resume_score(db, profile, resume, score_data)

    return ResumeScoreResponse(
        overall_score=score_data.get("overall_score"),
        skills_score=score_data.get("skills_score"),
        experience_score=score_data.get("experience_score"),
        formatting_score=score_data.get("formatting_score"),
        ats_score=score_data.get("ats_score"),
        metadata=score_data.get("metadata"),
        explanations=score_data.get("explanations"),
    )


@router.post("/rewrite", response_model=ResumeRewriteResponse)
@limiter.limit("15/hour")
async def rewrite_resume(
    payload: ResumeRewriteRequest = Body(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    request: Request = None,
):
    _ensure_candidate_user(current_user)
    profile = _ensure_candidate_profile(db, current_user)
    resume = db.query(Resume).filter(Resume.id == payload.resume_id, Resume.candidate_profile_id == profile.id).first()
    if not resume:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Resume not found")

    # Free-tier candidates get Ollama (limited); paid get cloud AI (full rewrite).
    use_free_tier = cv_uses_free_ai_tier(db, profile.id)

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
@limiter.limit("30/hour")
async def create_cover_letter(
    payload: CoverLetterCreateRequest = Body(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    request: Request = None,
):
    _ensure_candidate_user(current_user)
    profile = _ensure_candidate_profile(db, current_user)
    assert_cover_letters_allowed(db, profile.id)

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


def _owned_cover_letter(db: Session, letter_id: str, current_user: User) -> CoverLetter:
    _ensure_candidate_user(current_user)
    profile = _ensure_candidate_profile(db, current_user)
    letter = db.query(CoverLetter).filter(CoverLetter.id == letter_id, CoverLetter.candidate_profile_id == profile.id).first()
    if not letter:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cover letter not found")
    return letter


@router.patch("/cover-letters/{letter_id}", response_model=CoverLetterResponse)
async def update_cover_letter(
    letter_id: str,
    payload: CoverLetterUpdateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    letter = _owned_cover_letter(db, letter_id, current_user)
    if payload.title is not None:
        letter.title = payload.title.strip() or letter.title
    if payload.content is not None:
        letter.content = payload.content.strip()
    if payload.is_draft is not None:
        letter.is_draft = payload.is_draft
        letter.is_published = not payload.is_draft
    db.commit()
    db.refresh(letter)
    return letter


@router.delete("/cover-letters/{letter_id}", response_model=MessageResponse)
async def delete_cover_letter(
    letter_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    letter = _owned_cover_letter(db, letter_id, current_user)
    db.delete(letter)
    db.commit()
    return {"message": "Cover letter deleted"}


@router.get("/cover-letters/{letter_id}/export")
@limiter.limit("60/hour")
async def export_cover_letter(
    letter_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    request: Request = None,
):
    letter = _owned_cover_letter(db, letter_id, current_user)
    try:
        data = letter_to_pdf(letter.title, letter.content, current_user.full_name or "")
    except Exception as exc:
        logger.error(f"Cover letter export error: {exc}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Erro ao gerar carta. Tente novamente.")

    safe_name = (letter.title or "carta").strip().replace(" ", "_").lower() or "carta"
    return Response(
        content=data,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{safe_name}.pdf"'},
    )
