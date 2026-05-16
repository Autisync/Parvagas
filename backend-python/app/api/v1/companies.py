"""Company API endpoints."""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.models import User, Company
from app.schemas import CompanyProfileResponse, CompanyProfileUpdateRequest
from app.core.logging import get_logger

logger = get_logger(__name__)
router = APIRouter(prefix="/companies", tags=["companies"])


def get_current_user(token: str = None, db: Session = Depends(get_db)) -> User:
    """Get current authenticated user (placeholder)."""
    # This would be implemented with JWT token verification
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    # TODO: Decode JWT and fetch user
    return None


@router.get("/profile", response_model=CompanyProfileResponse)
async def get_company_profile(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get current company profile."""
    company = db.query(Company).filter(
        Company.owner_user_id == current_user.id
    ).first()
    
    if not company:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Company not found")
    
    return company


@router.put("/profile", response_model=CompanyProfileResponse)
async def update_company_profile(
    request: CompanyProfileUpdateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Update company profile."""
    company = db.query(Company).filter(
        Company.owner_user_id == current_user.id
    ).first()
    
    if not company:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Company not found")
    
    # Update fields
    update_data = request.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(company, key, value)
    
    db.commit()
    db.refresh(company)
    
    return company
