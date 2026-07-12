"""Tests for the native CV builder's /resumes API
(EXECUTION_PLAN_NATIVE_CV_BUILDER.md Phase A1).

Covers: CRUD, ownership isolation between candidates, from-profile
initialization (never a blank canvas), duplicate, delete, and export
(pdf/docx/json) — export must work with zero translation layer since
Resume.data is defined to be exactly the profile-dict shape
cv_export_service consumes.

Note: the endpoint functions return plain dicts (_resume_payload()) —
FastAPI's response_model coercion to ResumeResponse only happens at the
HTTP/ASGI layer, not when calling the function directly like these tests
do — so results are indexed with ["key"], not .attribute.
"""
import asyncio
import json
import uuid

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.api.v1 import resumes as resumes_module
from app.db.base import Base
from app.models import CandidateProfile, Resume, ResumeVersion, User, UserRole
from app.schemas import ResumeCreateRequest, ResumeUpdateRequest

_list_resumes = resumes_module.list_resumes
_create_resume = resumes_module.create_resume
_get_resume = resumes_module.get_resume
_update_resume = resumes_module.update_resume
_delete_resume = resumes_module.delete_resume
_duplicate_resume = resumes_module.duplicate_resume
_export_resume = resumes_module.export_resume


@pytest.fixture()
def db():
    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()


def _make_candidate(db, email="candidate@example.com", full_name="Ana Sousa") -> User:
    user = User(email=email, full_name=full_name, password_hash="x", role=UserRole.candidate, email_verified=True)
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def _make_profile(db, user, **overrides) -> CandidateProfile:
    defaults = dict(
        user_id=user.id,
        job_title="Engenheira",
        professional_summary="Resumo profissional.",
        location="Luanda",
        skills=json.dumps(["Python"]),
        work_experience=json.dumps([{"company": "Acme", "jobTitle": "Dev"}]),
        education=json.dumps([{"institution": "UAN"}]),
    )
    defaults.update(overrides)
    profile = CandidateProfile(**defaults)
    db.add(profile)
    db.commit()
    db.refresh(profile)
    return profile


# --------------------------------- CRUD ----------------------------------- #

def test_create_and_list_resume(db):
    user = _make_candidate(db)
    payload = ResumeCreateRequest(title="O meu CV", data={"fullName": "Ana"})
    created = asyncio.run(_create_resume(payload=payload, db=db, current_user=user))
    assert created["title"] == "O meu CV"
    assert created["data"] == {"fullName": "Ana"}
    assert created["is_draft"] is True

    listed = asyncio.run(_list_resumes(db=db, current_user=user))
    assert len(listed) == 1
    assert listed[0]["id"] == created["id"]


def test_update_resume_partial_fields(db):
    user = _make_candidate(db)
    created = asyncio.run(_create_resume(
        payload=ResumeCreateRequest(title="Draft", data={}), db=db, current_user=user,
    ))
    updated = asyncio.run(_update_resume(
        resume_id=created["id"],
        payload=ResumeUpdateRequest(title="Título Final", is_published=True),
        db=db, current_user=user,
    ))
    assert updated["title"] == "Título Final"
    assert updated["is_published"] is True


def test_ownership_isolation_between_candidates(db):
    owner = _make_candidate(db, email="owner@example.com")
    stranger = _make_candidate(db, email="stranger@example.com")
    created = asyncio.run(_create_resume(
        payload=ResumeCreateRequest(title="Privado", data={}), db=db, current_user=owner,
    ))

    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(_get_resume(resume_id=created["id"], db=db, current_user=stranger))
    assert exc_info.value.status_code == 404

    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(_delete_resume(resume_id=created["id"], db=db, current_user=stranger))
    assert exc_info.value.status_code == 404


# ------------------------------ from-profile ------------------------------ #

def test_from_profile_never_starts_blank(db):
    user = _make_candidate(db, full_name="Ana Sousa")
    _make_profile(db, user)

    created = asyncio.run(_create_resume(
        payload=ResumeCreateRequest(title="A partir do perfil", from_profile=True),
        db=db, current_user=user,
    ))
    assert created["data"]["fullName"] == "Ana Sousa"
    assert created["data"]["professionalTitle"] == "Engenheira"
    assert created["data"]["workExperience"] == [{"company": "Acme", "jobTitle": "Dev"}]
    assert created["summary"] == "Resumo profissional."


def test_explicit_data_ignored_when_from_profile_true(db):
    user = _make_candidate(db, full_name="Ana Sousa")
    _make_profile(db, user)

    created = asyncio.run(_create_resume(
        payload=ResumeCreateRequest(title="X", data={"fullName": "Deveria Ser Ignorado"}, from_profile=True),
        db=db, current_user=user,
    ))
    assert created["data"]["fullName"] == "Ana Sousa"


# -------------------------------- duplicate -------------------------------- #

def test_duplicate_clones_data_as_new_draft(db):
    user = _make_candidate(db)
    original = asyncio.run(_create_resume(
        payload=ResumeCreateRequest(title="Original", data={"fullName": "Ana"}, is_draft=False),
        db=db, current_user=user,
    ))
    copy = asyncio.run(_duplicate_resume(resume_id=original["id"], db=db, current_user=user))
    assert copy["id"] != original["id"]
    assert copy["title"] == "Original (cópia)"
    assert copy["data"] == {"fullName": "Ana"}
    assert copy["is_draft"] is True
    assert copy["is_published"] is False


def test_duplicate_missing_resume_404s(db):
    user = _make_candidate(db)
    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(_duplicate_resume(resume_id=str(uuid.uuid4()), db=db, current_user=user))
    assert exc_info.value.status_code == 404


# ---------------------------------- delete --------------------------------- #

def test_delete_resume_also_removes_versions(db):
    user = _make_candidate(db)
    created = asyncio.run(_create_resume(
        payload=ResumeCreateRequest(title="Para eliminar", data={}), db=db, current_user=user,
    ))
    db.add(ResumeVersion(
        resume_id=created["id"], version_number=1, title="v1", data="{}", created_by_user_id=user.id,
    ))
    db.commit()

    asyncio.run(_delete_resume(resume_id=created["id"], db=db, current_user=user))
    assert db.query(Resume).filter(Resume.id == created["id"]).first() is None
    assert db.query(ResumeVersion).filter(ResumeVersion.resume_id == created["id"]).count() == 0


# --------------------------------- export ---------------------------------- #

_EXPORTABLE_DATA = {
    "fullName": "Ana Sousa",
    "email": "ana@example.com",
    "professionalTitle": "Engenheira",
    "professionalSummary": "Resumo.",
    "skills": ["Python"],
    "workExperience": [{"company": "Acme", "jobTitle": "Dev", "startDate": "2020", "endDate": "2023"}],
    "education": [{"institution": "UAN"}],
}


def test_export_pdf_returns_pdf_bytes(db):
    user = _make_candidate(db)
    created = asyncio.run(_create_resume(
        payload=ResumeCreateRequest(title="CV", data=_EXPORTABLE_DATA), db=db, current_user=user,
    ))
    response = asyncio.run(_export_resume(resume_id=created["id"], format="pdf", db=db, current_user=user))
    assert response.media_type == "application/pdf"
    assert response.body.startswith(b"%PDF")


def test_export_docx_returns_docx_bytes(db):
    user = _make_candidate(db)
    created = asyncio.run(_create_resume(
        payload=ResumeCreateRequest(title="CV", data=_EXPORTABLE_DATA), db=db, current_user=user,
    ))
    response = asyncio.run(_export_resume(resume_id=created["id"], format="docx", db=db, current_user=user))
    assert response.media_type == "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    assert len(response.body) > 0


def test_export_json_returns_json_resume_shape(db):
    user = _make_candidate(db)
    created = asyncio.run(_create_resume(
        payload=ResumeCreateRequest(title="CV", data=_EXPORTABLE_DATA), db=db, current_user=user,
    ))
    response = asyncio.run(_export_resume(resume_id=created["id"], format="json", db=db, current_user=user))
    payload = json.loads(response.body)
    assert payload["basics"]["name"] == "Ana Sousa"
    assert payload["work"][0]["name"] == "Acme"


def test_export_missing_resume_404s(db):
    user = _make_candidate(db)
    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(_export_resume(resume_id=str(uuid.uuid4()), format="pdf", db=db, current_user=user))
    assert exc_info.value.status_code == 404


def test_export_empty_data_does_not_crash(db):
    user = _make_candidate(db)
    created = asyncio.run(_create_resume(
        payload=ResumeCreateRequest(title="Vazio", data={}), db=db, current_user=user,
    ))
    response = asyncio.run(_export_resume(resume_id=created["id"], format="pdf", db=db, current_user=user))
    assert response.media_type == "application/pdf"


# ------------------------------ route ordering ----------------------------- #

def test_matches_route_registered_before_dynamic_resume_id_route():
    """Regression: Starlette matches routes in registration order, not by
    specificity. /matches (static) must be registered before GET
    /{resume_id} (dynamic) — otherwise a GET to /resumes/matches matches
    /{resume_id} first with resume_id="matches" and 404s, permanently
    shadowing the real endpoint. This was a real pre-existing bug."""
    get_paths_in_order = [
        r.path for r in resumes_module.router.routes if "GET" in r.methods
    ]
    matches_index = get_paths_in_order.index("/resumes/matches")
    dynamic_index = get_paths_in_order.index("/resumes/{resume_id}")
    assert matches_index < dynamic_index
