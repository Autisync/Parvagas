"""Application submission and listing endpoints."""
from __future__ import annotations

from datetime import datetime
from pathlib import Path
import secrets
import uuid

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, UploadFile, status
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.config import get_settings
from app.core.security import has_leading_formula_char, is_valid_email_format
from app.db.session import get_db
from app.models import (
    CandidateProfile, Company, Job, JobApplication, ApplicationNote, ApplicationMessage, CVUpload, Resume, User, UserRole,
)
from app.services.cv_export_service import to_pdf


def _resolve_company_id(db, job_id: str, provided: str | None) -> str | None:
    """Use the explicit companyId, else derive it from the job so applications
    are never orphaned from the employer's pipeline view."""
    cid = (provided or "").strip()
    if cid:
        return cid
    job = db.query(Job).filter(Job.id == job_id).first()
    return job.company_id if job else None


def _resolve_applicant_field(submitted: str | None, fallback: str | None) -> str | None:
    """Prefer a value typed for this specific application over the profile
    default, so per-application edits (e.g. a different phone number) take
    effect instead of being silently discarded."""
    trimmed = (submitted or "").strip()
    return trimmed or fallback


def _auto_create_pipeline_item(db, application: "JobApplication") -> None:
    """Drops every new application straight into the company's ATS board
    (lowest-position stage) so the pipeline reflects reality without the
    company having to manually add each one. Best-effort: a company with no
    real account (aggregated/scraped job listings) or any ATS setup issue
    must never block application submission itself."""
    if not application.company_id:
        return
    try:
        from app.models import ATSPipelineItem
        from app.api.v1.ats import _ensure_default_stages

        company = db.query(Company).filter(Company.id == application.company_id).first()
        if not company:
            return

        stages = _ensure_default_stages(db, company)
        first_stage = min(stages, key=lambda s: s.position)

        candidate_profile_id = None
        if application.candidate_user_id:
            profile = db.query(CandidateProfile).filter(CandidateProfile.user_id == application.candidate_user_id).first()
            candidate_profile_id = profile.id if profile else None

        db.add(ATSPipelineItem(
            company_id=company.id,
            application_id=application.id,
            candidate_profile_id=candidate_profile_id,
            stage_id=first_stage.id,
        ))
        db.commit()
    except Exception as e:
        logger.warning(f"Could not auto-create ATS pipeline item for application {application.id}: {e}")


from app.services.storage_service import StorageService
from app.workers.tasks import send_application_received_email, send_application_status_email, send_templated_email
from app.services.email_service import EmailService
from app.services.notification_service import create_notification
from app.services.company_access_service import resolve_company_for_user_or_none, require_role
from app.core.logging import get_logger

logger = get_logger(__name__)
import json as _json

router = APIRouter(tags=["applications"])


def _notify_company_new_applicant(db: Session, company_id: str, job_id: str, candidate_name: str) -> None:
    """Notify the employer that a new candidate applied. Never blocks the apply.

    Two independent notification paths, since a job's `company_id` always
    resolves to a real Company row (aggregated/scraped jobs point at the
    synthetic "Parvagas Aggregator" company) but the REAL hiring company for
    those postings usually has no Parvagas account at all:
      - The resolved company's owner (if any) gets the normal portal-style
        notification — keeps admin visibility into aggregator-job activity.
      - `job.external_contact_email` (admin-curated, when set) additionally
        gets a dedicated email with a no-login "view applications for this
        job" link, since that's the only way this employer can ever see it.
    """
    try:
        job = db.query(Job).filter(Job.id == job_id).first()

        company = db.query(Company).filter(Company.id == company_id).first() if company_id else None
        if company and company.owner_user_id:
            owner = db.query(User).filter(User.id == company.owner_user_id).first()
            if owner and owner.email:
                send_templated_email.delay("send_new_applicant_email", {
                    "email": owner.email,
                    "recruiter_name": owner.full_name or "",
                    "candidate_name": candidate_name or "Candidato",
                    "job_title": job.title if job else "",
                })
            if owner:
                create_notification(
                    db, owner.id, type="new_applicant",
                    title="Nova candidatura recebida",
                    body=f"{candidate_name or 'Um candidato'} candidatou-se a {job.title if job else 'uma vaga'}.",
                    link=f"/Portal/Empresa/Candidaturas?jobId={job_id}",
                )

        if job and job.external_contact_email:
            if not job.employer_access_token:
                job.employer_access_token = secrets.token_urlsafe(32)
                db.commit()
            base = (get_settings().FRONTEND_URL or "https://parvagas.pt").rstrip("/")
            view_url = f"{base}/Empresa/Candidaturas-Externas/{job.id}?token={job.employer_access_token}"
            claim_url = f"{base}/Signup?role=company"
            send_templated_email.delay("send_external_employer_new_applicant_email", {
                "email": job.external_contact_email,
                "company_name": job.external_company_name or "",
                "candidate_name": candidate_name or "Candidato",
                "job_title": job.title if job else "",
                "view_url": view_url,
                "claim_url": claim_url,
            })
    except Exception as e:
        logger.warning(f"Could not enqueue new-applicant email: {e}")


def _json_list_safe(value):
    if not value:
        return []
    try:
        out = _json.loads(value)
        return out if isinstance(out, list) else []
    except Exception:
        return []

_MAX_UPLOAD_BYTES = 5 * 1024 * 1024  # 5 MB
_ALLOWED_UPLOAD_EXTENSIONS = {".pdf", ".docx"}


def _check_bytes(data: bytes) -> None:
    if len(data) > _MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Ficheiro demasiado grande (máx. 5 MB)")
    if not StorageService.scan_clean(data):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Ficheiro rejeitado pela verificação de segurança")
_ALLOWED_MIME_TYPES = {
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
}


def _pagination(page: int, limit: int, total: int) -> dict:
    total_pages = max(1, (total + limit - 1) // limit)
    return {
        "page": page,
        "limit": limit,
        "total": total,
        "totalPages": total_pages,
    }


def _serialize_application(
    item: JobApplication, job_title: str | None = None, skills: list | None = None,
    message_meta: dict | None = None,
) -> dict:
    meta = message_meta or {}
    return {
        "_id": item.id,
        "status": item.status,
        "candidateUserId": item.candidate_user_id,
        "companyId": item.company_id,
        "profileSource": item.profile_source,
        "profileSnapshot": {
            "fullName": item.applicant_full_name,
            "email": item.applicant_email,
            "phone": item.applicant_phone,
            "skills": skills or [],
        },
        "jobId": {
            # Falls back to the placeholder only when the caller couldn't
            # resolve the real job (e.g. it was deleted) — every list
            # endpoint below now batch-fetches real titles.
            "_id": item.job_id,
            "title": job_title or f"Vaga {item.job_id}",
        },
        "createdAt": item.created_at.isoformat() if item.created_at else None,
        "interview": {
            "scheduledAt": item.interview_scheduled_at.isoformat() if item.interview_scheduled_at else None,
            "location": item.interview_location,
            "meetingLink": item.interview_meeting_link,
        } if item.interview_scheduled_at or item.interview_location or item.interview_meeting_link else None,
        "unreadMessageCount": meta.get("unreadCount", 0),
        # Candidate-side gate: the "Mensagens" button only shows once the
        # company has actually said something (see app.api.v1.messages —
        # the company must initiate every thread).
        "hasCompanyMessage": meta.get("hasCompanyMessage", False),
    }


def _message_meta_for(db: Session, application_ids: list[str], viewer_role: str) -> dict[str, dict]:
    """Batched per-application message metadata for a list endpoint — one
    unread-count query + one has-company-message query total, not N+1.
    `viewer_role` is whose inbox this is ("company" or "candidate"): unread
    counts only the OTHER party's messages, since your own sent messages
    are never "unread" to you."""
    if not application_ids:
        return {}
    from sqlalchemy import func as _func

    other_role = "candidate" if viewer_role == "company" else "company"
    unread = dict(
        db.query(ApplicationMessage.application_id, _func.count(ApplicationMessage.id))
        .filter(
            ApplicationMessage.application_id.in_(application_ids),
            ApplicationMessage.sender_role == other_role,
            ApplicationMessage.read_at.is_(None),
        )
        .group_by(ApplicationMessage.application_id)
        .all()
    )
    has_company = {
        row[0]
        for row in (
            db.query(ApplicationMessage.application_id)
            .filter(ApplicationMessage.application_id.in_(application_ids), ApplicationMessage.sender_role == "company")
            .distinct()
            .all()
        )
    }
    return {
        app_id: {"unreadCount": unread.get(app_id, 0), "hasCompanyMessage": app_id in has_company}
        for app_id in application_ids
    }


def _job_titles_for(db: Session, job_ids: list[str]) -> dict[str, str]:
    """Batch title lookup — avoids an N+1 query per application row.
    _serialize_application previously never looked this up at all and
    fabricated "Vaga {job_id}" as the title for every application."""
    if not job_ids:
        return {}
    return {j.id: j.title for j in db.query(Job.id, Job.title).filter(Job.id.in_(job_ids)).all()}


def _skills_for_candidates(db: Session, candidate_user_ids: list[str]) -> dict[str, list]:
    """Batch skills lookup by candidate_user_id, for applications whose
    profileSnapshot should show the candidate's declared skills."""
    if not candidate_user_ids:
        return {}
    profiles = (
        db.query(CandidateProfile.user_id, CandidateProfile.skills)
        .filter(CandidateProfile.user_id.in_(candidate_user_ids))
        .all()
    )
    return {user_id: _json_list_safe(skills) for user_id, skills in profiles}


def _validate_upload(file: UploadFile) -> None:
    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in _ALLOWED_UPLOAD_EXTENSIONS:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only PDF or DOCX files are allowed")
    if file.content_type and file.content_type not in _ALLOWED_MIME_TYPES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid file type")


@router.post("/candidates/jobs/apply")
async def submit_candidate_application(
    jobId: str = Form(...),
    companyId: str | None = Form(default=None),
    useLatestCv: str = Form("true"),
    coverLetter: str = Form(""),
    phone: str | None = Form(default=None),
    location: str | None = Form(default=None),
    savedCvDocumentId: str | None = Form(default=None),
    resumeId: str | None = Form(default=None),
    customCv: UploadFile | None = File(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Submit an application for an authenticated candidate."""
    if current_user.role != UserRole.candidate:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Candidate access required")

    resume_id = (resumeId or "").strip() or None
    use_latest_cv = str(useLatestCv).strip().lower() in {"1", "true", "yes", "on"}
    if resume_id is None:
        if use_latest_cv and not (savedCvDocumentId or "").strip():
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="savedCvDocumentId is required when useLatestCv is true")
        if not use_latest_cv and customCv is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="customCv file is required when useLatestCv is false")

    candidate_profile = db.query(CandidateProfile).filter(CandidateProfile.user_id == current_user.id).first()

    if resume_id is not None:
        # D1 (EXECUTION_PLAN_NATIVE_CV_BUILDER.md): a Construtor de CV
        # resume — verified owned by this candidate before it's attached
        # to the application, same ownership rule as /resumes itself.
        owned_resume = (
            db.query(Resume)
            .filter(Resume.id == resume_id, Resume.candidate_profile_id == (candidate_profile.id if candidate_profile else None))
            .first()
        )
        if not owned_resume:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="CV não encontrado")

    cv_file_path = None
    if customCv is not None:
        _validate_upload(customCv)
        file_bytes = await customCv.read()
        _check_bytes(file_bytes)
        file_ext = Path(customCv.filename or "").suffix.lower() or ".pdf"
        file_name = f"application-{uuid.uuid4()}{file_ext}"
        cv_file_path = StorageService.save_file(file_bytes, file_name)

    application = JobApplication(
        job_id=jobId,
        company_id=_resolve_company_id(db, jobId, companyId),
        candidate_user_id=current_user.id,
        applicant_full_name=current_user.full_name,
        applicant_email=current_user.email,
        applicant_phone=_resolve_applicant_field(phone, candidate_profile.phone if candidate_profile else None),
        applicant_location=_resolve_applicant_field(location, candidate_profile.location if candidate_profile else None),
        cover_letter=(coverLetter or "").strip() or None,
        profile_source="native_resume" if resume_id else ("main_profile" if use_latest_cv else "custom_cv"),
        status="submitted",
        cv_file_path=cv_file_path,
        saved_cv_document_id=(savedCvDocumentId or "").strip() or None,
        resume_id=resume_id,
    )
    db.add(application)
    db.commit()
    db.refresh(application)
    _auto_create_pipeline_item(db, application)

    send_application_received_email.delay(current_user.email, current_user.full_name, jobId)
    _notify_company_new_applicant(db, application.company_id, jobId, current_user.full_name)
    job_for_notice = db.query(Job).filter(Job.id == jobId).first()
    create_notification(
        db, current_user.id, type="application_submitted",
        title="Candidatura enviada",
        body=f"A sua candidatura a {job_for_notice.title if job_for_notice else 'esta vaga'} foi recebida.",
        link="/Portal/Candidato/Candidaturas",
    )

    return {
        "message": "Application submitted successfully.",
        "applicationId": application.id,
    }


@router.post("/public/jobs/{job_id}/quick-apply")
async def submit_quick_apply(
    request: Request,
    job_id: str,
    companyId: str | None = Form(default=None),
    fullName: str = Form(...),
    email: str = Form(...),
    phone: str = Form(...),
    location: str = Form(...),
    coverLetter: str = Form(""),
    cv: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    """Submit a guest quick apply application."""
    from app.core.captcha import verify_captcha
    _ip = request.client.host if request.client else None
    if not await verify_captcha(request.headers.get("x-captcha-token"), action="apply", remote_ip=_ip):
        from app.services.security_service import record_security_event
        record_security_event(db, event_type="captcha_failed", ip_address=_ip, user_agent=request.headers.get("user-agent"), details={"action": "apply"})
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Verificação anti-robô falhou. Tente novamente.")
    full_name = (fullName or "").strip()
    applicant_email = (email or "").strip().lower()
    if not full_name or not applicant_email:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="fullName and email are required")
    if not is_valid_email_format(applicant_email):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="E-mail inválido.")
    if len(full_name) > 200:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Nome demasiado longo.")
    if has_leading_formula_char(full_name) or has_leading_formula_char(applicant_email):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Nome ou e-mail contém um carácter não permitido.")

    _validate_upload(cv)
    file_bytes = await cv.read()
    _check_bytes(file_bytes)
    file_ext = Path(cv.filename or "").suffix.lower() or ".pdf"
    file_name = f"quick-apply-{uuid.uuid4()}{file_ext}"
    cv_file_path = StorageService.save_file(file_bytes, file_name)

    application = JobApplication(
        job_id=job_id,
        company_id=_resolve_company_id(db, job_id, companyId),
        candidate_user_id=None,
        applicant_full_name=full_name,
        applicant_email=applicant_email,
        applicant_phone=(phone or "").strip() or None,
        applicant_location=(location or "").strip() or None,
        cover_letter=(coverLetter or "").strip() or None,
        profile_source="quick_apply",
        status="submitted",
        cv_file_path=cv_file_path,
        saved_cv_document_id=None,
        # No account exists to track this from — a token link is the only
        # way this applicant can ever check their status again.
        tracking_token=secrets.token_urlsafe(32),
    )
    db.add(application)
    db.commit()
    db.refresh(application)
    _auto_create_pipeline_item(db, application)

    base = (get_settings().FRONTEND_URL or "https://parvagas.pt").rstrip("/")
    tracking_url = f"{base}/Candidaturas/Acompanhar?token={application.tracking_token}"
    send_application_received_email.delay(applicant_email, full_name, job_id, tracking_url)
    _notify_company_new_applicant(db, application.company_id, job_id, full_name)

    return {
        "message": "Quick apply submitted successfully.",
        "trackingUrl": tracking_url,
        "applicationId": application.id,
    }


# ── No-account tracking (guest applicants + employers without a company account) ──

@router.get("/public/applications/track")
async def track_guest_application(token: str, db: Session = Depends(get_db)):
    """Let a guest (no-account) applicant check their own application status
    using the token link emailed to them at submission time. No auth — the
    token itself is the credential, scoped to exactly one application."""
    token = (token or "").strip()
    if not token:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Token em falta")
    app_row = db.query(JobApplication).filter(JobApplication.tracking_token == token).first()
    if not app_row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Candidatura não encontrada")

    job = db.query(Job).filter(Job.id == app_row.job_id).first()
    company_name = None
    if job:
        company_name = job.external_company_name
        if not company_name and job.company_id:
            company = db.query(Company).filter(Company.id == job.company_id).first()
            company_name = company.name if company else None

    status_label, status_message = EmailService._STATUS_COPY.get(
        app_row.status, ("Candidatura recebida", "A sua candidatura foi recebida e será analisada em breve.")
    )
    return {
        "application": {
            "_id": app_row.id,
            "status": app_row.status,
            "statusLabel": status_label,
            "statusMessage": status_message,
            "submittedAt": app_row.created_at.isoformat() if app_row.created_at else None,
            "job": {"_id": job.id, "title": job.title, "location": job.location} if job else None,
            "companyName": company_name,
        }
    }


@router.get("/public/jobs/{job_id}/applications")
async def view_external_job_applications(job_id: str, token: str, db: Session = Depends(get_db)):
    """Let a real hiring company with no Parvagas account view every
    application received for one specific job, using the token link emailed
    to them. No auth — the token is scoped to exactly this job."""
    token = (token or "").strip()
    if not token:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Token em falta")
    job = db.query(Job).filter(Job.id == job_id).first()
    if not job or not job.employer_access_token or job.employer_access_token != token:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vaga não encontrada")

    rows = (
        db.query(JobApplication)
        .filter(JobApplication.job_id == job_id)
        .order_by(JobApplication.created_at.desc())
        .all()
    )
    applications = []
    for a in rows:
        cv_url = None
        if a.cv_file_path:
            cv_url = StorageService.signed_url(a.cv_file_path)
        elif a.candidate_user_id:
            profile = db.query(CandidateProfile).filter(CandidateProfile.user_id == a.candidate_user_id).first()
            latest_cv = (
                db.query(CVUpload).filter(CVUpload.candidate_id == profile.id).order_by(CVUpload.created_at.desc()).first()
                if profile else None
            )
            cv_url = StorageService.signed_url(latest_cv.file_path) if latest_cv else None
        applications.append({
            "_id": a.id,
            "fullName": a.applicant_full_name,
            "email": a.applicant_email,
            "phone": a.applicant_phone,
            "location": a.applicant_location,
            "coverLetter": a.cover_letter,
            "status": a.status,
            "cvUrl": cv_url,
            "submittedAt": a.created_at.isoformat() if a.created_at else None,
        })
    return {
        "job": {"_id": job.id, "title": job.title, "companyName": job.external_company_name},
        "applications": applications,
    }


@router.get("/candidates/applications")
async def list_candidate_applications(
    page: int = 1,
    limit: int = 20,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List applications of the authenticated candidate."""
    if current_user.role != UserRole.candidate:
        return {"applications": [], **_pagination(page, limit, 0)}

    page = max(1, page)
    limit = max(1, min(limit, 100))

    query = db.query(JobApplication).filter(JobApplication.candidate_user_id == current_user.id)
    total = query.count()
    items = (
        query.order_by(JobApplication.created_at.desc())
        .offset((page - 1) * limit)
        .limit(limit)
        .all()
    )
    titles = _job_titles_for(db, [item.job_id for item in items])
    message_meta = _message_meta_for(db, [item.id for item in items], viewer_role="candidate")

    pagination = _pagination(page, limit, total)
    return {
        "applications": [
            _serialize_application(item, job_title=titles.get(item.job_id), message_meta=message_meta.get(item.id))
            for item in items
        ],
        **pagination,
        "pagination": pagination,
    }


async def list_company_applications(
    page: int = 1,
    limit: int = 20,
    job_id: str | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List applications mapped to the authenticated company owner (or
    invited team member — see resolve_company_for_user_or_none). Optionally
    scoped to a single job via `job_id` — previously every call returned
    every application across every job, and the frontend's search/filter
    box only ever filtered the one already-loaded page of 20, not the
    company's full applicant pool."""
    if current_user.role != UserRole.company:
        return {"applications": [], **_pagination(page, limit, 0)}

    company = resolve_company_for_user_or_none(db, current_user)
    if not company:
        return {"applications": [], **_pagination(page, limit, 0)}

    page = max(1, page)
    limit = max(1, min(limit, 100))

    query = db.query(JobApplication).filter(JobApplication.company_id == company.id)
    if job_id:
        query = query.filter(JobApplication.job_id == job_id)
    total = query.count()
    items = (
        query.order_by(JobApplication.created_at.desc())
        .offset((page - 1) * limit)
        .limit(limit)
        .all()
    )
    titles = _job_titles_for(db, [item.job_id for item in items])
    skills = _skills_for_candidates(db, [item.candidate_user_id for item in items if item.candidate_user_id])
    message_meta = _message_meta_for(db, [item.id for item in items], viewer_role="company")

    pagination = _pagination(page, limit, total)
    return {
        "applications": [
            _serialize_application(
                item, job_title=titles.get(item.job_id), skills=skills.get(item.candidate_user_id),
                message_meta=message_meta.get(item.id),
            )
            for item in items
        ],
        **pagination,
        "pagination": pagination,
    }


@router.get("/applications")
async def list_applications(
    page: int = 1,
    limit: int = 20,
    jobId: str | None = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List applications relevant to current user role."""
    if current_user.role == UserRole.candidate:
        return await list_candidate_applications(page=page, limit=limit, db=db, current_user=current_user)
    if current_user.role == UserRole.company:
        return await list_company_applications(page=page, limit=limit, job_id=jobId, db=db, current_user=current_user)

    # Admin listing remains scoped to dedicated admin endpoints.
    page = max(1, page)
    limit = max(1, min(limit, 100))
    pagination = _pagination(page, limit, 0)
    return {
        "applications": [],
        **pagination,
        "pagination": pagination,
    }


_HIRING_STATUSES = {"submitted", "under_review", "viewed", "shortlisted", "interview", "offer", "rejected", "hired", "withdrawn"}


def _apply_status_change(
    db: Session, app_row: JobApplication, new_status: str, custom_message: str | None,
    interview_details: dict | None = None,
) -> None:
    """Shared by the single and bulk status-update endpoints: flips the
    status, persists interview details when moving to "interview", then
    notifies the candidate (email + in-app) exactly like the
    single-application path always has. Caller is responsible for the
    db.commit() — bulk callers batch many of these into one transaction."""
    previous_status = app_row.status
    app_row.status = new_status

    if new_status == "interview" and interview_details:
        when = interview_details.get("when")
        if when:
            try:
                app_row.interview_scheduled_at = datetime.fromisoformat(when)
            except ValueError:
                pass
        if interview_details.get("location"):
            app_row.interview_location = str(interview_details["location"])[:500]
        if interview_details.get("meetingLink"):
            app_row.interview_meeting_link = str(interview_details["meetingLink"])[:500]

    if new_status == previous_status or new_status in {"submitted", "withdrawn"}:
        return
    recipient = app_row.applicant_email
    job = db.query(Job).filter(Job.id == app_row.job_id).first()
    job_title = job.title if job else ""
    if recipient:
        try:
            send_application_status_email.delay(
                recipient, app_row.applicant_full_name or "Candidato/a", job_title, new_status, custom_message,
                interview_details if new_status == "interview" else None,
            )
        except Exception as e:  # never block the status update on the mail queue
            logger.warning(f"Could not enqueue status email: {e}")
    if app_row.candidate_user_id:
        label, _msg = EmailService._STATUS_COPY.get(
            new_status, ("Atualização da candidatura", "")
        )
        create_notification(
            db, app_row.candidate_user_id,
            type="application_status",
            title=label,
            body=f"{job_title}".strip() or "A sua candidatura foi atualizada.",
            link="/Portal/Candidato",
        )


def _extract_interview_details(payload: dict) -> dict | None:
    details = {
        "when": str(payload.get("interviewDate", "")).strip() or None,
        "location": str(payload.get("interviewLocation", "")).strip() or None,
        "meetingLink": str(payload.get("interviewMeetingLink", "")).strip() or None,
    }
    return details if any(details.values()) else None


@router.patch("/applications/{application_id}/status")
async def update_application_status(
    application_id: str,
    payload: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Move an application along the hiring pipeline (company owner/recruiter or admin)."""
    app_row = db.query(JobApplication).filter(JobApplication.id == application_id).first()
    if not app_row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Application not found")
    if current_user.role != UserRole.admin:
        co = resolve_company_for_user_or_none(db, current_user)
        if not co or app_row.company_id != co.id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sem permissão")
        require_role(db, current_user, co, {"owner", "recruiter"})
    new_status = str(payload.get("status", "")).strip().lower()
    if new_status not in _HIRING_STATUSES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Estado inválido")
    custom_message = str(payload.get("message", "")).strip()[:1000] or None

    _apply_status_change(db, app_row, new_status, custom_message, _extract_interview_details(payload))
    db.commit()
    db.refresh(app_row)

    return {"application": {"_id": app_row.id, "status": app_row.status}}


@router.patch("/applications/bulk-status")
async def bulk_update_application_status(
    payload: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Move several applications along the pipeline in one call — triaging a
    stack of candidates previously meant clicking through each one
    individually. Same permission/status rules as the single-application
    endpoint, applied per row; silently skips ids outside the caller's
    company rather than 403ing the whole batch, since a stale selection
    (e.g. one application reassigned mid-session) shouldn't block the rest."""
    application_ids = payload.get("applicationIds")
    if not isinstance(application_ids, list) or not application_ids:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="applicationIds é obrigatório")
    if len(application_ids) > 100:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Máximo de 100 candidaturas por lote")

    new_status = str(payload.get("status", "")).strip().lower()
    if new_status not in _HIRING_STATUSES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Estado inválido")
    custom_message = str(payload.get("message", "")).strip()[:1000] or None

    co = None
    if current_user.role != UserRole.admin:
        co = resolve_company_for_user_or_none(db, current_user)
        if not co:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sem permissão")
        require_role(db, current_user, co, {"owner", "recruiter"})

    query = db.query(JobApplication).filter(JobApplication.id.in_(application_ids))
    if co is not None:
        query = query.filter(JobApplication.company_id == co.id)
    rows = query.all()

    interview_details = _extract_interview_details(payload)
    updated_ids = []
    for app_row in rows:
        _apply_status_change(db, app_row, new_status, custom_message, interview_details)
        updated_ids.append(app_row.id)
    db.commit()

    return {"updated": len(updated_ids), "applicationIds": updated_ids}


@router.get("/applications/{application_id}/candidate-cv")
async def application_candidate_cv(
    application_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Candidate snapshot + CV documents for an application (company owner/admin)."""
    app_row = db.query(JobApplication).filter(JobApplication.id == application_id).first()
    if not app_row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Application not found")
    if current_user.role != UserRole.admin:
        co = resolve_company_for_user_or_none(db, current_user)
        if not co or app_row.company_id != co.id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sem permissão")

    candidate = {
        "fullName": app_row.applicant_full_name,
        "email": app_row.applicant_email,
        "phone": app_row.applicant_phone,
        "location": app_row.applicant_location,
        "professionalTitle": None,
        "coverLetter": app_row.cover_letter,
        "summary": None,
        "skills": [],
    }
    documents = []
    # The file actually attached to THIS application — covers guest/
    # quick-apply candidates (no account, so no CandidateProfile/CVUpload
    # row exists at all) and logged-in candidates who chose to upload a
    # one-off CV for this specific job instead of their saved profile CV.
    # Neither path ever creates a CVUpload row, so without this the
    # "Ver CV" modal showed "Sem CV disponível" despite a real file sitting
    # in storage — already handled correctly by the unauthenticated
    # external-employer view of the same data (view_external_job_applications
    # above); this mirrors that same check.
    if app_row.cv_file_path:
        documents.append({
            "_id": f"{app_row.id}-application-cv",
            "fileName": "CV enviado com a candidatura",
            "mimeType": None,
            "createdAt": app_row.created_at.isoformat() if app_row.created_at else None,
            "signedUrl": StorageService.signed_url(app_row.cv_file_path),
        })
    if app_row.candidate_user_id:
        profile = db.query(CandidateProfile).filter(CandidateProfile.user_id == app_row.candidate_user_id).first()
        if profile:
            candidate["professionalTitle"] = profile.job_title
            # Kept distinct from coverLetter — the application-specific letter
            # this candidate wrote used to be silently overwritten by their
            # generic profile summary the moment they had one, with the UI
            # showing a single undifferentiated field either way.
            candidate["summary"] = profile.professional_summary
            candidate["skills"] = _json_list_safe(profile.skills)
            cvs = db.query(CVUpload).filter(CVUpload.candidate_id == profile.id).order_by(CVUpload.created_at.desc()).all()
            documents = [
                {"_id": c.id, "fileName": c.file_name, "mimeType": c.mime_type,
                 "createdAt": c.created_at.isoformat() if c.created_at else None,
                 "signedUrl": StorageService.signed_url(getattr(c, "file_path", None))}
                for c in cvs
            ]

    if app_row.resume_id:
        # D1: rendered on-demand from Resume.data, not a stored file — no
        # signedUrl to hand out, so the frontend downloads it via the
        # authenticated /resume-cv endpoint below instead of a bare <a href>.
        resume = db.query(Resume).filter(Resume.id == app_row.resume_id).first()
        if resume:
            documents.insert(0, {
                "_id": resume.id,
                "fileName": f"{resume.title or 'CV'}.pdf",
                "mimeType": "application/pdf",
                "createdAt": resume.updated_at.isoformat() if resume.updated_at else None,
                "signedUrl": None,
                "isNativeResume": True,
            })

    return {"candidate": candidate, "documents": documents}


@router.get("/applications/{application_id}/resume-cv")
async def application_resume_cv(
    application_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """PDF download of the native Construtor de CV resume attached to an
    application (D1) — company owner/admin only, mirrors candidate-cv's
    ownership check. Rendered on demand (Phase A reportlab path — same as
    the candidate's own default export) since a native resume has no
    stored file to sign a URL for."""
    app_row = db.query(JobApplication).filter(JobApplication.id == application_id).first()
    if not app_row or not app_row.resume_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Application or resume not found")
    if current_user.role != UserRole.admin:
        co = resolve_company_for_user_or_none(db, current_user)
        if not co or app_row.company_id != co.id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sem permissão")

    resume = db.query(Resume).filter(Resume.id == app_row.resume_id).first()
    if not resume:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="CV not found")

    try:
        resume_data = _json.loads(resume.data) if resume.data else {}
        if not isinstance(resume_data, dict):
            resume_data = {}
    except Exception:
        resume_data = {}
    try:
        pdf_bytes = to_pdf(resume_data)
    except Exception as exc:
        logger.error(f"Application resume export error: {exc}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Erro ao gerar CV.")

    safe_name = (resume.title or "cv").strip().replace(" ", "_").lower() or "cv"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{safe_name}.pdf"'},
    )


# ── Application notes / ratings (mini-ATS) ──────────────────────────────────

def _company_owns_application(db: Session, user: User, application: JobApplication) -> bool:
    """Whether `user` may act on `application` as its owning company — any
    team seat (owner/recruiter/viewer), not just the owner. Previously
    owner-only here (same bug class W0.1 fixed everywhere else this
    session): an invited team member got 403'd trying to view or add ATS
    notes."""
    if user.role == UserRole.admin:
        return True
    co = resolve_company_for_user_or_none(db, user)
    return bool(co and application.company_id == co.id)


@router.get("/applications/{application_id}/notes")
async def list_application_notes(
    application_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    app_row = db.query(JobApplication).filter(JobApplication.id == application_id).first()
    if not app_row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Application not found")
    if not _company_owns_application(db, current_user, app_row):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sem permissão")
    rows = (
        db.query(ApplicationNote)
        .filter(ApplicationNote.application_id == application_id)
        .order_by(ApplicationNote.created_at.desc())
        .all()
    )
    return {"notes": [
        {"_id": n.id, "body": n.body, "rating": n.rating, "authorUserId": n.author_user_id,
         "createdAt": n.created_at.isoformat() if n.created_at else None}
        for n in rows
    ]}


@router.post("/applications/{application_id}/notes")
async def add_application_note(
    application_id: str,
    payload: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    app_row = db.query(JobApplication).filter(JobApplication.id == application_id).first()
    if not app_row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Application not found")
    if not _company_owns_application(db, current_user, app_row):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sem permissão")
    rating = payload.get("rating")
    try:
        rating = int(rating) if rating is not None else None
    except (TypeError, ValueError):
        rating = None
    note = ApplicationNote(
        application_id=application_id, author_user_id=current_user.id,
        body=str(payload.get("body", "")).strip() or None, rating=rating,
    )
    db.add(note)
    db.commit()
    db.refresh(note)
    return {"note": {"_id": note.id, "body": note.body, "rating": note.rating,
                     "createdAt": note.created_at.isoformat() if note.created_at else None}}

# GET /public/candidates/{user_id} (unauthenticated, unfiltered candidate
# profile lookup) was removed here — W5.2 found it live with zero frontend
# callers and no ownership/visibility check at all. Replaced by
# app.api.v1.candidate_search.view_candidate_profile, which requires
# company auth, the Business-plan gate, and the candidate's
# discoverable_opt_in flag.
