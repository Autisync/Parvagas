"""Application submission and listing endpoints."""
from __future__ import annotations

from pathlib import Path
import uuid

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models import CandidateProfile, Company, JobApplication, User, UserRole
from app.services.storage_service import StorageService
from app.workers.tasks import send_application_received_email

router = APIRouter(tags=["applications"])

_ALLOWED_UPLOAD_EXTENSIONS = {".pdf", ".docx"}
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
        file_ext = Path(customCv.filename or "").suffix.lower() or ".pdf"
        file_name = f"application-{uuid.uuid4()}{file_ext}"
        cv_file_path = StorageService.save_file(file_bytes, file_name)

    application = JobApplication(
        job_id=jobId,
        company_id=(companyId or "").strip() or None,
        candidate_user_id=current_user.id,
        applicant_full_name=current_user.full_name,
        applicant_email=current_user.email,
        applicant_phone=candidate_profile.phone if candidate_profile else None,
        applicant_location=candidate_profile.location if candidate_profile else None,
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

    return {
        "message": "Application submitted successfully.",
        "applicationId": application.id,
    }


@router.post("/public/jobs/{job_id}/quick-apply")
async def submit_quick_apply(
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
    full_name = (fullName or "").strip()
    applicant_email = (email or "").strip().lower()
    if not full_name or not applicant_email:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="fullName and email are required")

    _validate_upload(cv)
    file_bytes = await cv.read()
    file_ext = Path(cv.filename or "").suffix.lower() or ".pdf"
    file_name = f"quick-apply-{uuid.uuid4()}{file_ext}"
    cv_file_path = StorageService.save_file(file_bytes, file_name)

    application = JobApplication(
        job_id=job_id,
        company_id=(companyId or "").strip() or None,
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
    )
    db.add(application)
    db.commit()
    db.refresh(application)

    send_application_received_email.delay(applicant_email, full_name, job_id)

    return {
        "message": "Quick apply submitted successfully.",
        "applicationId": application.id,
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
