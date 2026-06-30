"""CV upload and parsing endpoints."""
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.config import get_settings
from app.core.logging import get_logger
from app.db.session import get_db
from app.models import User, CandidateProfile, CVUpload
from app.schemas import CVUploadResponse
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
