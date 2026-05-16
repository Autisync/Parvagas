"""Candidate API endpoints."""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.models import User, CandidateProfile, UserRole
from app.schemas import CandidateProfileResponse, CandidateProfileUpdateRequest
from app.core.logging import get_logger

logger = get_logger(__name__)
router = APIRouter(prefix="/candidates", tags=["candidates"])


def get_current_user(token: str = None, db: Session = Depends(get_db)) -> User:
    """Get current authenticated user (placeholder)."""
    # This would be implemented with JWT token verification
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    # TODO: Decode JWT and fetch user
    return None


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
