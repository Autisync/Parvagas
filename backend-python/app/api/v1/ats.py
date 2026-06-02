"""ATS and hiring pipeline endpoints."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models import ATSStage, ATSPipelineItem, Company, User, UserRole
from app.schemas import (
    ATSStageCreateRequest,
    ATSStageResponse,
    ATSStageUpdateRequest,
    ATSPipelineItemCreateRequest,
    ATSPipelineItemMoveRequest,
    ATSPipelineItemResponse,
    MessageResponse,
)

router = APIRouter(tags=["ats"])


def _company_for_user(db: Session, user: User) -> Company | None:
    return db.query(Company).filter(Company.owner_user_id == user.id).first()


@router.get("/ats/stages", response_model=list[ATSStageResponse])
async def list_ats_stages(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role != UserRole.company:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Company access required")

    company = _company_for_user(db, current_user)
    if not company:
        return []

    stages = db.query(ATSStage).filter(ATSStage.company_id == company.id).order_by(ATSStage.sort_order).all()
    return stages


@router.post("/ats/stages", response_model=ATSStageResponse, status_code=status.HTTP_201_CREATED)
async def create_ats_stage(
    request: ATSStageCreateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role != UserRole.company:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Company access required")

    company = _company_for_user(db, current_user)
    if not company:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Company not found")

    stage = ATSStage(
        company_id=company.id,
        name=request.name.strip(),
        description=request.description,
        sort_order=request.sort_order or 0,
    )
    db.add(stage)
    db.commit()
    db.refresh(stage)
    return stage


@router.patch("/ats/stages/{stage_id}", response_model=ATSStageResponse)
async def update_ats_stage(
    stage_id: str,
    request: ATSStageUpdateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role != UserRole.company:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Company access required")

    company = _company_for_user(db, current_user)
    if not company:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Company not found")

    stage = db.query(ATSStage).filter(ATSStage.id == stage_id, ATSStage.company_id == company.id).first()
    if not stage:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Stage not found")

    if request.name is not None:
        stage.name = request.name.strip()
    if request.description is not None:
        stage.description = request.description
    if request.sort_order is not None:
        stage.sort_order = request.sort_order

    db.commit()
    db.refresh(stage)
    return stage


@router.delete("/ats/stages/{stage_id}", response_model=MessageResponse)
async def delete_ats_stage(
    stage_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role != UserRole.company:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Company access required")

    company = _company_for_user(db, current_user)
    if not company:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Company not found")

    stage = db.query(ATSStage).filter(ATSStage.id == stage_id, ATSStage.company_id == company.id).first()
    if not stage:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Stage not found")

    db.delete(stage)
    db.commit()
    return {"message": "ATS stage deleted."}


@router.get("/ats/pipeline", response_model=list[ATSPipelineItemResponse])
async def list_pipeline_items(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role != UserRole.company:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Company access required")

    company = _company_for_user(db, current_user)
    if not company:
        return []

    return (
        db.query(ATSPipelineItem)
        .filter(ATSPipelineItem.company_id == company.id)
        .order_by(ATSPipelineItem.updated_at.desc())
        .all()
    )


@router.post("/ats/pipeline", response_model=ATSPipelineItemResponse, status_code=status.HTTP_201_CREATED)
async def create_pipeline_item(
    request: ATSPipelineItemCreateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role != UserRole.company:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Company access required")

    company = _company_for_user(db, current_user)
    if not company:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Company not found")

    stage = db.query(ATSStage).filter(ATSStage.id == request.stage_id, ATSStage.company_id == company.id).first()
    if not stage:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Stage not found")

    item = ATSPipelineItem(
        company_id=company.id,
        candidate_profile_id=request.candidate_profile_id,
        job_match_id=request.job_match_id,
        stage_id=stage.id,
        notes=request.notes,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


@router.patch("/ats/pipeline/{item_id}/move", response_model=ATSPipelineItemResponse)
async def move_pipeline_item(
    item_id: str,
    request: ATSPipelineItemMoveRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role != UserRole.company:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Company access required")

    company = _company_for_user(db, current_user)
    if not company:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Company not found")

    item = db.query(ATSPipelineItem).filter(ATSPipelineItem.id == item_id, ATSPipelineItem.company_id == company.id).first()
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pipeline item not found")

    stage = db.query(ATSStage).filter(ATSStage.id == request.stage_id, ATSStage.company_id == company.id).first()
    if not stage:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Stage not found")

    item.stage_id = stage.id
    db.commit()
    db.refresh(item)
    return item
