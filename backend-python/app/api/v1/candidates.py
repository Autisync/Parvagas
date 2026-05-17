"""Candidate API endpoints."""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.models import User, CandidateProfile, UserRole
from app.schemas import CandidateProfileResponse, CandidateProfileUpdateRequest
from app.core.logging import get_logger
from app.api.deps import get_current_user

logger = get_logger(__name__)
router = APIRouter(prefix="/candidates", tags=["candidates"])


@router.get("/profile", response_model=CandidateProfileResponse)
async def get_candidate_profile(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get current candidate profile."""
    profile = db.query(CandidateProfile).filter(
        CandidateProfile.user_id == current_user.id
    ).first()
    
    if not profile:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Profile not found")
    
    return profile


@router.put("/profile", response_model=CandidateProfileResponse)
async def update_candidate_profile(
    request: CandidateProfileUpdateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Update candidate profile."""
    profile = db.query(CandidateProfile).filter(
        CandidateProfile.user_id == current_user.id
    ).first()
    
    if not profile:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Profile not found")
    
    # Update fields
    update_data = request.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(profile, key, value)
    
    db.commit()
    db.refresh(profile)
    
    return profile
