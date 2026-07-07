"""Application submission and listing endpoints."""
from __future__ import annotations

from pathlib import Path
import secrets
import uuid

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.config import get_settings
from app.db.session import get_db
from app.models import (
    CandidateProfile, Company, Job, JobApplication, ApplicationNote, CVUpload, User, UserRole,
)


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


from app.services.storage_service import StorageService
from app.workers.tasks import send_application_received_email, send_application_status_email, send_templated_email
from app.services.email_service import EmailService
from app.services.notification_service import create_notification
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


def _serialize_application(item: JobApplication) -> dict:
    return {
        "_id": item.id,
        "status": item.status,
        "candidateUserId": item.candidate_user_id,
        "companyId": item.company_id,
        "profileSource": item.profile_source,
        "profileSnapshot": {
            "fullName": item.applicant_full_name,
            "email": item.applicant_email,
        },
        "jobId": {
            "_id": item.job_id,
            "title": f"Vaga {item.job_id}",
        },
        "createdAt": item.created_at.isoformat() if item.created_at else None,
    }


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
    customCv: UploadFile | None = File(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Submit an application for an authenticated candidate."""
    if current_user.role != UserRole.candidate:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Candidate access required")

    use_latest_cv = str(useLatestCv).strip().lower() in {"1", "true", "yes", "on"}
    if use_latest_cv and not (savedCvDocumentId or "").strip():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="savedCvDocumentId is required when useLatestCv is true")
    if not use_latest_cv and customCv is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="customCv file is required when useLatestCv is false")

    candidate_profile = db.query(CandidateProfile).filter(CandidateProfile.user_id == current_user.id).first()

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
        profile_source="main_profile" if use_latest_cv else "custom_cv",
        status="submitted",
        cv_file_path=cv_file_path,
        saved_cv_document_id=(savedCvDocumentId or "").strip() or None,
    )
    db.add(application)
    db.commit()
    db.refresh(application)

    send_application_received_email.delay(current_user.email, current_user.full_name, jobId)
    _notify_company_new_applicant(db, application.company_id, jobId, current_user.full_name)

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
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Verificação anti-robô falhou. Tente novamente.")
    full_name = (fullName or "").strip()
    applicant_email = (email or "").strip().lower()
    if not full_name or not applicant_email:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="fullName and email are required")

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

    pagination = _pagination(page, limit, total)
    return {
        "applications": [_serialize_application(item) for item in items],
        **pagination,
        "pagination": pagination,
    }


async def list_company_applications(
    page: int = 1,
    limit: int = 20,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List applications mapped to the authenticated company owner."""
    if current_user.role != UserRole.company:
        return {"applications": [], **_pagination(page, limit, 0)}

    company = db.query(Company).filter(Company.owner_user_id == current_user.id).first()
    if not company:
        return {"applications": [], **_pagination(page, limit, 0)}

    page = max(1, page)
    limit = max(1, min(limit, 100))

    query = db.query(JobApplication).filter(JobApplication.company_id == company.id)
    total = query.count()
    items = (
        query.order_by(JobApplication.created_at.desc())
        .offset((page - 1) * limit)
        .limit(limit)
        .all()
    )

    pagination = _pagination(page, limit, total)
    return {
        "applications": [_serialize_application(item) for item in items],
        **pagination,
        "pagination": pagination,
    }


@router.get("/applications")
async def list_applications(
    page: int = 1,
    limit: int = 20,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List applications relevant to current user role."""
    if current_user.role == UserRole.candidate:
        return await list_candidate_applications(page=page, limit=limit, db=db, current_user=current_user)
    if current_user.role == UserRole.company:
        return await list_company_applications(page=page, limit=limit, db=db, current_user=current_user)

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


@router.patch("/applications/{application_id}/status")
async def update_application_status(
    application_id: str,
    payload: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Move an application along the hiring pipeline (company owner or admin)."""
    app_row = db.query(JobApplication).filter(JobApplication.id == application_id).first()
    if not app_row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Application not found")
    if current_user.role != UserRole.admin:
        co = db.query(Company).filter(Company.owner_user_id == current_user.id).first()
        if not co or app_row.company_id != co.id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sem permissão")
    new_status = str(payload.get("status", "")).strip().lower()
    if new_status not in _HIRING_STATUSES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Estado inválido")
    previous_status = app_row.status
    app_row.status = new_status
    db.commit()
    db.refresh(app_row)

    # Notify the candidate when the status meaningfully changes (skip self-service
    # states and no-op updates). Sent async so the API stays fast.
    if new_status != previous_status and new_status not in {"submitted", "withdrawn"}:
        recipient = app_row.applicant_email
        job = db.query(Job).filter(Job.id == app_row.job_id).first()
        job_title = job.title if job else ""
        if recipient:
            try:
                send_application_status_email.delay(
                    recipient, app_row.applicant_full_name or "Candidato/a", job_title, new_status,
                )
            except Exception as e:  # never block the status update on the mail queue
                logger.warning(f"Could not enqueue status email: {e}")
        # In-app notification for the candidate (if they have an account).
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

    return {"application": {"_id": app_row.id, "status": app_row.status}}


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
        co = db.query(Company).filter(Company.owner_user_id == current_user.id).first()
        if not co or app_row.company_id != co.id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sem permissão")

    candidate = {
        "fullName": app_row.applicant_full_name,
        "email": app_row.applicant_email,
        "location": app_row.applicant_location,
        "professionalTitle": None,
        "summary": app_row.cover_letter,
        "skills": [],
    }
    documents = []
    if app_row.candidate_user_id:
        profile = db.query(CandidateProfile).filter(CandidateProfile.user_id == app_row.candidate_user_id).first()
        if profile:
            candidate["professionalTitle"] = profile.job_title
            candidate["summary"] = profile.professional_summary or candidate["summary"]
            candidate["skills"] = _json_list_safe(profile.skills)
            cvs = db.query(CVUpload).filter(CVUpload.candidate_id == profile.id).order_by(CVUpload.created_at.desc()).all()
            documents = [
                {"_id": c.id, "fileName": c.file_name, "mimeType": c.mime_type,
                 "createdAt": c.created_at.isoformat() if c.created_at else None,
                 "signedUrl": StorageService.signed_url(getattr(c, "file_path", None))}
                for c in cvs
            ]
    return {"candidate": candidate, "documents": documents}


# ── Application notes / ratings (mini-ATS) ──────────────────────────────────

def _company_owns_application(db: Session, user: User, application: JobApplication) -> bool:
    if user.role == UserRole.admin:
        return True
    co = db.query(Company).filter(Company.owner_user_id == user.id).first()
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


@router.get("/public/candidates/{user_id}")
async def public_candidate_profile(user_id: str, db: Session = Depends(get_db)):
    """Public, read-only candidate profile (shareable)."""
    user = db.query(User).filter(User.id == user_id, User.role == UserRole.candidate).first()
    profile = db.query(CandidateProfile).filter(CandidateProfile.user_id == user_id).first()
    if not user or not profile:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Profile not found")
    return {"profile": {
        "id": user.id,
        "fullName": user.full_name,
        "jobTitle": profile.job_title,
        "location": profile.location,
        "professionalSummary": profile.professional_summary,
        "yearsOfExperience": profile.years_of_experience,
        "skills": _json_list_safe(profile.skills),
        "languages": _json_list_safe(profile.languages),
        "experience": _json_list_safe(profile.work_experience),
        "education": _json_list_safe(profile.education),
        "linkedinUrl": profile.linkedin_url,
        "portfolioUrl": profile.portfolio_url,
        "githubUrl": profile.github_url,
    }}
