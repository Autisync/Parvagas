"""ATS and hiring pipeline endpoints."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models import ATSStage, ATSPipelineItem, CandidateProfile, Company, JobApplication, User, UserRole
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

DEFAULT_STAGE_NAMES = ["Novo", "Em Análise", "Entrevista", "Oferta", "Contratado", "Rejeitado"]


def _company_for_user(db: Session, user: User) -> Company | None:
    return db.query(Company).filter(Company.owner_user_id == user.id).first()


def _ensure_default_stages(db: Session, company: Company) -> list[ATSStage]:
    """Seeds the standard stage set the first time a company's pipeline is
    viewed, so a brand-new company doesn't hit an empty board with no way
    to create one (there's no separate "set up your pipeline" step)."""
    existing = db.query(ATSStage).filter(ATSStage.company_id == company.id).order_by(ATSStage.position).all()
    if existing:
        return existing

    stages = [
        ATSStage(company_id=company.id, name=name, position=index, is_default=True)
        for index, name in enumerate(DEFAULT_STAGE_NAMES)
    ]
    db.add_all(stages)
    db.commit()
    for stage in stages:
        db.refresh(stage)
    return stages


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

    return _ensure_default_stages(db, company)


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
        position=request.position or 0,
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
    if request.position is not None:
        stage.position = request.position

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

    application = (
        db.query(JobApplication)
        .filter(JobApplication.id == request.application_id, JobApplication.company_id == company.id)
        .first()
    )
    if not application:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Application not found")

    existing = (
        db.query(ATSPipelineItem)
        .filter(ATSPipelineItem.company_id == company.id, ATSPipelineItem.application_id == application.id)
        .first()
    )
    if existing:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="This application already has a pipeline item")

    if request.stage_id:
        stage = db.query(ATSStage).filter(ATSStage.id == request.stage_id, ATSStage.company_id == company.id).first()
        if not stage:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Stage not found")
    else:
        stages = _ensure_default_stages(db, company)
        stage = min(stages, key=lambda s: s.position)

    candidate_profile_id = None
    if application.candidate_user_id:
        profile = db.query(CandidateProfile).filter(CandidateProfile.user_id == application.candidate_user_id).first()
        candidate_profile_id = profile.id if profile else None

    item = ATSPipelineItem(
        company_id=company.id,
        application_id=application.id,
        candidate_profile_id=candidate_profile_id,
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
