"""Tests for the ATS pipeline endpoints — every route 500'd before this fix:
the Pydantic schemas and query filters referenced `ATSPipelineItem.company_id`
(never existed on the model) and a `sort_order` column (the model column is
actually `position`). This file is the first test coverage the ATS pipeline
has ever had.
"""
import asyncio
import uuid

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.base import Base
from app.models import ATSPipelineItem, ATSStage, CandidateProfile, Company, JobApplication, User, UserRole
from app.schemas import ATSStageCreateRequest, ATSStageUpdateRequest, ATSPipelineItemCreateRequest, ATSPipelineItemMoveRequest
from app.api.v1.ats import (
    list_ats_stages, create_ats_stage, update_ats_stage, delete_ats_stage,
    list_pipeline_items, create_pipeline_item, move_pipeline_item,
    DEFAULT_STAGE_NAMES,
)


@pytest.fixture()
def db():
    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()


def _make_company_owner(db) -> tuple[User, Company]:
    owner = User(id=str(uuid.uuid4()), email=f"owner-{uuid.uuid4()}@x.com", full_name="Owner", password_hash="x", role=UserRole.company)
    db.add(owner)
    db.flush()
    company = Company(owner_user_id=owner.id, name="Acme", status="active")
    db.add(company)
    db.commit()
    return owner, company


def _make_application(db, company: Company, candidate_user: User | None = None) -> JobApplication:
    application = JobApplication(
        job_id=str(uuid.uuid4()), company_id=company.id,
        candidate_user_id=candidate_user.id if candidate_user else None,
        applicant_full_name="Ana Sousa", applicant_email="ana@x.com", status="submitted",
    )
    db.add(application)
    db.commit()
    return application


def test_list_stages_seeds_default_set_when_empty(db):
    owner, company = _make_company_owner(db)

    stages = asyncio.run(list_ats_stages(db=db, current_user=owner))

    assert [s.name for s in sorted(stages, key=lambda s: s.position)] == DEFAULT_STAGE_NAMES


def test_list_stages_does_not_reseed_when_stages_exist(db):
    owner, company = _make_company_owner(db)
    asyncio.run(list_ats_stages(db=db, current_user=owner))

    stages_again = asyncio.run(list_ats_stages(db=db, current_user=owner))

    assert len(stages_again) == len(DEFAULT_STAGE_NAMES)


def test_create_stage_uses_position_field(db):
    owner, company = _make_company_owner(db)

    stage = asyncio.run(create_ats_stage(ATSStageCreateRequest(name="Triagem", position=1), db=db, current_user=owner))

    assert stage.name == "Triagem"
    assert stage.position == 1
    assert stage.company_id == company.id


def test_update_stage_position(db):
    owner, company = _make_company_owner(db)
    stage = asyncio.run(create_ats_stage(ATSStageCreateRequest(name="Triagem"), db=db, current_user=owner))

    updated = asyncio.run(update_ats_stage(stage.id, ATSStageUpdateRequest(position=5), db=db, current_user=owner))

    assert updated.position == 5


def test_delete_stage(db):
    owner, company = _make_company_owner(db)
    stage = asyncio.run(create_ats_stage(ATSStageCreateRequest(name="Triagem"), db=db, current_user=owner))

    result = asyncio.run(delete_ats_stage(stage.id, db=db, current_user=owner))

    assert "deleted" in result["message"].lower()
    assert db.query(ATSStage).filter(ATSStage.id == stage.id).first() is None


def test_create_pipeline_item_from_application_defaults_to_first_stage(db):
    owner, company = _make_company_owner(db)
    application = _make_application(db, company)

    item = asyncio.run(create_pipeline_item(
        ATSPipelineItemCreateRequest(application_id=application.id), db=db, current_user=owner,
    ))

    assert item.company_id == company.id
    assert item.application_id == application.id
    stage = db.query(ATSStage).filter(ATSStage.id == item.stage_id).first()
    assert stage.position == 0


def test_create_pipeline_item_resolves_candidate_profile_from_application(db):
    owner, company = _make_company_owner(db)
    candidate_user = User(id=str(uuid.uuid4()), email="candidate@x.com", full_name="Cand", password_hash="x", role=UserRole.candidate)
    db.add(candidate_user)
    db.flush()
    profile = CandidateProfile(user_id=candidate_user.id)
    db.add(profile)
    db.commit()
    application = _make_application(db, company, candidate_user=candidate_user)

    item = asyncio.run(create_pipeline_item(
        ATSPipelineItemCreateRequest(application_id=application.id), db=db, current_user=owner,
    ))

    assert item.candidate_profile_id == profile.id


def test_create_pipeline_item_rejects_duplicate_for_same_application(db):
    owner, company = _make_company_owner(db)
    application = _make_application(db, company)
    asyncio.run(create_pipeline_item(ATSPipelineItemCreateRequest(application_id=application.id), db=db, current_user=owner))

    with pytest.raises(HTTPException) as exc:
        asyncio.run(create_pipeline_item(ATSPipelineItemCreateRequest(application_id=application.id), db=db, current_user=owner))
    assert exc.value.status_code == 400


def test_create_pipeline_item_404_for_application_of_another_company(db):
    owner, company = _make_company_owner(db)
    _, other_company = _make_company_owner(db)
    application = _make_application(db, other_company)

    with pytest.raises(HTTPException) as exc:
        asyncio.run(create_pipeline_item(ATSPipelineItemCreateRequest(application_id=application.id), db=db, current_user=owner))
    assert exc.value.status_code == 404


def test_move_pipeline_item(db):
    owner, company = _make_company_owner(db)
    application = _make_application(db, company)
    item = asyncio.run(create_pipeline_item(ATSPipelineItemCreateRequest(application_id=application.id), db=db, current_user=owner))
    stages = asyncio.run(list_ats_stages(db=db, current_user=owner))
    target_stage = sorted(stages, key=lambda s: s.position)[1]

    moved = asyncio.run(move_pipeline_item(item.id, ATSPipelineItemMoveRequest(stage_id=target_stage.id), db=db, current_user=owner))

    assert moved.stage_id == target_stage.id


def test_move_pipeline_item_404_for_stage_of_another_company(db):
    owner, company = _make_company_owner(db)
    other_owner, other_company = _make_company_owner(db)
    application = _make_application(db, company)
    item = asyncio.run(create_pipeline_item(ATSPipelineItemCreateRequest(application_id=application.id), db=db, current_user=owner))
    other_stages = asyncio.run(list_ats_stages(db=db, current_user=other_owner))

    with pytest.raises(HTTPException) as exc:
        asyncio.run(move_pipeline_item(item.id, ATSPipelineItemMoveRequest(stage_id=other_stages[0].id), db=db, current_user=owner))
    assert exc.value.status_code == 404


def test_list_pipeline_items_scoped_to_company(db):
    owner, company = _make_company_owner(db)
    other_owner, other_company = _make_company_owner(db)
    app1 = _make_application(db, company)
    app2 = _make_application(db, other_company)
    asyncio.run(create_pipeline_item(ATSPipelineItemCreateRequest(application_id=app1.id), db=db, current_user=owner))
    asyncio.run(create_pipeline_item(ATSPipelineItemCreateRequest(application_id=app2.id), db=db, current_user=other_owner))

    items = asyncio.run(list_pipeline_items(db=db, current_user=owner))

    assert len(items) == 1
    assert items[0].application_id == app1.id


def test_non_company_role_403(db):
    candidate = User(id=str(uuid.uuid4()), email="c@x.com", full_name="C", password_hash="x", role=UserRole.candidate)
    db.add(candidate)
    db.commit()

    with pytest.raises(HTTPException) as exc:
        asyncio.run(list_ats_stages(db=db, current_user=candidate))
    assert exc.value.status_code == 403
