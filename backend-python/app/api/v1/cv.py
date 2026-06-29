"""CV upload, parsing, and export endpoints."""
import json
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query, status, UploadFile, File
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.config import get_settings
from app.core.logging import get_logger
from app.db.session import get_db
from app.models import User, CandidateProfile, CVUpload
from app.schemas import CVUploadResponse
from app.services.cv_export_service import to_docx, to_pdf, to_json_resume
from app.services.cv_parser_service import CVParserService
from app.services.storage_service import StorageService
from app.workers.tasks import parse_cv

logger = get_logger(__name__)
settings = get_settings()
router = APIRouter(prefix="/cv", tags=["cv"])


@router.post("/upload", response_model=CVUploadResponse)
async def upload_cv(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Upload and parse CV file."""
    try:
        # Get candidate profile
        profile = db.query(CandidateProfile).filter(
            CandidateProfile.user_id == current_user.id
        ).first()
        
        if not profile:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Candidate profile not found")
        
        # Validate file type
        allowed_mime_types = [
            "application/pdf",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "text/plain",
            # Image CVs / photos of a CV — text extracted via OCR.
            "image/jpeg",
            "image/jpg",
            "image/png",
            "image/webp",
            "image/tiff",
            "image/bmp",
        ]

        if file.content_type not in allowed_mime_types:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid file type. Allowed: PDF, DOCX, TXT, imagem (PNG/JPG)"
            )

        # Enforce the upload size cap BEFORE buffering the whole file in memory.
        # Reject early on the declared size when present, then re-check the real
        # bytes (a client can lie about Content-Length).
        max_bytes = settings.MAX_UPLOAD_MB * 1024 * 1024
        too_large = HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"Ficheiro demasiado grande. Tamanho máximo: {settings.MAX_UPLOAD_MB} MB.",
        )
        if getattr(file, "size", None) and file.size > max_bytes:
            raise too_large

        # Save file
        file_content = await file.read()
        if len(file_content) > max_bytes:
            raise too_large
        file_name = f"{uuid.uuid4()}_{file.filename}"
        file_path = StorageService.save_file(file_content, file_name)
        
        # Create CV upload record
        cv_upload = CVUpload(
            candidate_id=profile.id,
            file_name=file.filename,
            file_path=file_path,
            file_size=len(file_content),
            mime_type=file.content_type,
            parse_status="pending"
        )
        
        db.add(cv_upload)
        db.commit()
        db.refresh(cv_upload)
        
        # Parse CV async
        parse_cv.delay(str(cv_upload.id))
        
        return {
            "success": True,
            "warnings": ["CV parsing started in background. Results will be available soon."]
        }
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"CV upload error: {str(e)}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


@router.get("/export")
async def export_cv(
    format: str = Query(default="pdf", pattern="^(pdf|docx|json)$"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Export the candidate's profile as a formatted CV.

    ``format`` may be ``pdf`` (default), ``docx``, or ``json`` (JSON-Resume).
    Returns the file as a binary download with the correct Content-Type.
    """
    profile = db.query(CandidateProfile).filter(
        CandidateProfile.user_id == current_user.id
    ).first()
    if not profile:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Perfil de candidato não encontrado.")

    def _json_load(value, default):
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
        "postcode": profile.postcode or "",
        "linkedinUrl": profile.linkedin_url or "",
        "portfolioUrl": profile.portfolio_url or "",
        "githubUrl": profile.github_url or "",
        "professionalTitle": profile.job_title or "",
        "professionalSummary": profile.professional_summary or "",
        "yearsOfExperience": profile.years_of_experience,
        "skills": _json_load(profile.skills, []),
        "hardSkills": _json_load(getattr(profile, "hard_skills", None), []),
        "techniques": _json_load(getattr(profile, "techniques", None), []),
        "tools": _json_load(getattr(profile, "tools", None), []),
        "languages": _json_load(profile.languages, []),
        "certifications": _json_load(profile.certifications, []),
        "workExperience": _json_load(profile.work_experience, []),
        "education": _json_load(profile.education, []),
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
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                            detail="Erro ao gerar CV. Tente novamente.")
