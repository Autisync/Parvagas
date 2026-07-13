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
from app.models import CandidateProfile, CoverLetter, Resume, ResumeVersion, User, UserRole
from app.schemas import CoverLetterCreateRequest, CoverLetterUpdateRequest, ResumeCreateRequest, ResumeUpdateRequest

_list_resumes = resumes_module.list_resumes
_create_resume = resumes_module.create_resume
_get_resume = resumes_module.get_resume
_update_resume = resumes_module.update_resume
_delete_resume = resumes_module.delete_resume
_duplicate_resume = resumes_module.duplicate_resume
_export_resume = resumes_module.export_resume
_preview_resume_html = resumes_module.preview_resume_html
_share_resume = resumes_module.share_resume
_get_public_resume = resumes_module.get_public_resume
_list_versions = resumes_module.list_resume_versions
_get_version = resumes_module.get_resume_version
_restore_version = resumes_module.restore_resume_version
_list_cover_letters = resumes_module.list_cover_letters
_create_cover_letter = resumes_module.create_cover_letter
_update_cover_letter = resumes_module.update_cover_letter
_delete_cover_letter = resumes_module.delete_cover_letter
_export_cover_letter = resumes_module.export_cover_letter


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


# --------------------------- WeasyPrint (Phase B1) -------------------------- #
# This sandbox has no pango/gobject native libs (confirmed manually during
# implementation — a bare `import weasyprint` raises OSError trying to
# dlopen libgobject), so RESUME_WEASYPRINT_ENABLED=true here always
# exercises the *fallback* path, not a real WeasyPrint render. That's the
# behavior actually worth testing: the export endpoint must still return a
# valid PDF (via reportlab) rather than 500ing when WeasyPrint can't run.

def test_export_pdf_falls_back_to_reportlab_when_weasyprint_unavailable(db, monkeypatch):
    monkeypatch.setattr(resumes_module.settings, "RESUME_WEASYPRINT_ENABLED", True)
    user = _make_candidate(db)
    created = asyncio.run(_create_resume(
        payload=ResumeCreateRequest(title="CV", data=_EXPORTABLE_DATA), db=db, current_user=user,
    ))
    response = asyncio.run(_export_resume(resume_id=created["id"], format="pdf", db=db, current_user=user))
    assert response.media_type == "application/pdf"
    assert response.body.startswith(b"%PDF")


def test_preview_html_404s_when_weasyprint_disabled(db):
    user = _make_candidate(db)
    created = asyncio.run(_create_resume(
        payload=ResumeCreateRequest(title="CV", data=_EXPORTABLE_DATA), db=db, current_user=user,
    ))
    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(_preview_resume_html(resume_id=created["id"], db=db, current_user=user))
    assert exc_info.value.status_code == 404


def test_preview_html_renders_when_weasyprint_enabled(db, monkeypatch):
    monkeypatch.setattr(resumes_module.settings, "RESUME_WEASYPRINT_ENABLED", True)
    user = _make_candidate(db)
    created = asyncio.run(_create_resume(
        payload=ResumeCreateRequest(title="CV", data=_EXPORTABLE_DATA), db=db, current_user=user,
    ))
    response = asyncio.run(_preview_resume_html(resume_id=created["id"], db=db, current_user=user))
    assert response.media_type == "text/html"
    assert b"Ana Sousa" in response.body


def test_preview_html_missing_resume_404s(db, monkeypatch):
    monkeypatch.setattr(resumes_module.settings, "RESUME_WEASYPRINT_ENABLED", True)
    user = _make_candidate(db)
    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(_preview_resume_html(resume_id=str(uuid.uuid4()), db=db, current_user=user))
    assert exc_info.value.status_code == 404


# --------------------------- share page (Phase B3) -------------------------- #

def test_share_publish_mints_slug_and_public_endpoint_serves_it(db):
    user = _make_candidate(db)
    created = asyncio.run(_create_resume(
        payload=ResumeCreateRequest(title="CV Público", data=_EXPORTABLE_DATA), db=db, current_user=user,
    ))
    shared = asyncio.run(_share_resume(
        resume_id=created["id"], payload=resumes_module.ResumeShareRequest(published=True), db=db, current_user=user,
    ))
    assert shared["is_published"] is True
    assert shared["share_slug"]

    public = asyncio.run(_get_public_resume(share_slug=shared["share_slug"], db=db))
    assert public["title"] == "CV Público"
    assert public["data"]["fullName"] == "Ana Sousa"
    assert "id" not in public  # render-relevant fields only


def test_unpublished_slug_404s_and_slug_survives_republish(db):
    user = _make_candidate(db)
    created = asyncio.run(_create_resume(
        payload=ResumeCreateRequest(title="CV", data=_EXPORTABLE_DATA), db=db, current_user=user,
    ))
    shared = asyncio.run(_share_resume(
        resume_id=created["id"], payload=resumes_module.ResumeShareRequest(published=True), db=db, current_user=user,
    ))
    slug = shared["share_slug"]

    unshared = asyncio.run(_share_resume(
        resume_id=created["id"], payload=resumes_module.ResumeShareRequest(published=False), db=db, current_user=user,
    ))
    assert unshared["is_published"] is False
    assert unshared["share_slug"] == slug  # slug kept so re-publishing restores the same URL

    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(_get_public_resume(share_slug=slug, db=db))
    assert exc_info.value.status_code == 404

    republished = asyncio.run(_share_resume(
        resume_id=created["id"], payload=resumes_module.ResumeShareRequest(published=True), db=db, current_user=user,
    ))
    assert republished["share_slug"] == slug
    assert asyncio.run(_get_public_resume(share_slug=slug, db=db))["title"] == "CV"


def test_public_endpoint_404s_on_unknown_slug(db):
    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(_get_public_resume(share_slug="does-not-exist", db=db))
    assert exc_info.value.status_code == 404


def test_share_only_touches_own_resume(db):
    owner = _make_candidate(db, email="owner@example.com")
    intruder = _make_candidate(db, email="intruder@example.com")
    created = asyncio.run(_create_resume(
        payload=ResumeCreateRequest(title="CV", data=_EXPORTABLE_DATA), db=db, current_user=owner,
    ))
    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(_share_resume(
            resume_id=created["id"], payload=resumes_module.ResumeShareRequest(published=True), db=db, current_user=intruder,
        ))
    assert exc_info.value.status_code == 404


# --------------------------- versions (Phase B4) ---------------------------- #

def _patch_data(db, user, resume_id, data):
    return asyncio.run(resumes_module.update_resume(
        resume_id=resume_id, payload=ResumeUpdateRequest(data=data), db=db, current_user=user,
    ))


def test_update_creates_throttled_snapshot_of_outgoing_state(db):
    user = _make_candidate(db)
    created = asyncio.run(_create_resume(
        payload=ResumeCreateRequest(title="CV", data={"fullName": "Estado Original"}), db=db, current_user=user,
    ))
    _patch_data(db, user, created["id"], {"fullName": "Estado Novo"})

    versions = asyncio.run(_list_versions(resume_id=created["id"], db=db, current_user=user))
    assert len(versions) == 1
    snapshot = asyncio.run(_get_version(resume_id=created["id"], version_id=versions[0]["id"], db=db, current_user=user))
    assert snapshot["data"]["fullName"] == "Estado Original"  # the OUTGOING state, not the new one

    # A second save moments later must NOT create another version (throttle),
    # and an unchanged-data save never snapshots regardless.
    _patch_data(db, user, created["id"], {"fullName": "Estado Ainda Mais Novo"})
    _patch_data(db, user, created["id"], {"fullName": "Estado Ainda Mais Novo"})
    versions = asyncio.run(_list_versions(resume_id=created["id"], db=db, current_user=user))
    assert len(versions) == 1


def test_list_versions_omits_data_payload_and_orders_newest_first(db):
    user = _make_candidate(db)
    created = asyncio.run(_create_resume(
        payload=ResumeCreateRequest(title="CV", data={"fullName": "V0"}), db=db, current_user=user,
    ))
    _patch_data(db, user, created["id"], {"fullName": "V1"})
    versions = asyncio.run(_list_versions(resume_id=created["id"], db=db, current_user=user))
    assert versions and "data" not in versions[0]
    assert versions[0]["version_number"] == max(v["version_number"] for v in versions)


def test_restore_version_creates_new_draft_copy_leaving_original_untouched(db):
    user = _make_candidate(db)
    created = asyncio.run(_create_resume(
        payload=ResumeCreateRequest(title="CV", data={"fullName": "Antigo"}), db=db, current_user=user,
    ))
    _patch_data(db, user, created["id"], {"fullName": "Atual"})
    versions = asyncio.run(_list_versions(resume_id=created["id"], db=db, current_user=user))

    restored = asyncio.run(_restore_version(
        resume_id=created["id"], version_id=versions[0]["id"], db=db, current_user=user,
    ))
    assert restored["id"] != created["id"]  # a copy, not an overwrite
    assert restored["data"]["fullName"] == "Antigo"
    assert restored["is_draft"] is True and restored["is_published"] is False
    assert "restaurada" in restored["title"]

    original = asyncio.run(_get_resume(resume_id=created["id"], db=db, current_user=user))
    assert original["data"]["fullName"] == "Atual"  # untouched


def test_versions_are_ownership_isolated(db):
    owner = _make_candidate(db, email="owner-v@example.com")
    intruder = _make_candidate(db, email="intruder-v@example.com")
    created = asyncio.run(_create_resume(
        payload=ResumeCreateRequest(title="CV", data={"fullName": "X"}), db=db, current_user=owner,
    ))
    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(_list_versions(resume_id=created["id"], db=db, current_user=intruder))
    assert exc_info.value.status_code == 404


# ------------------------- adapt-to-job (Phase C2) -------------------------- #

def _make_job(db, title="Engenheira de Dados"):
    from app.models import Job, Company, User as UserModel, UserRole as UR
    company_user = UserModel(email=f"c-{uuid.uuid4()}@example.com", full_name="Empresa", password_hash="x", role=UR.company)
    db.add(company_user)
    db.flush()
    company = Company(owner_user_id=company_user.id, name="Empresa X")
    db.add(company)
    db.flush()
    job = Job(company_id=company.id, title=title, description="desc", category="TI", location="Luanda")
    db.add(job)
    db.commit()
    db.refresh(job)
    return job


def test_adapt_with_flag_off_changes_nothing_and_says_so(db):
    """CV_EXPORT_LLM_INJECTION_ENABLED defaults false → inject_job_keywords
    returns the profile unchanged → the endpoint must report changed=false,
    create NO version, and leave Resume.data byte-identical."""
    user = _make_candidate(db)
    created = asyncio.run(_create_resume(
        payload=ResumeCreateRequest(title="CV", data=_EXPORTABLE_DATA), db=db, current_user=user,
    ))
    job = _make_job(db)

    result = asyncio.run(resumes_module.adapt_resume_to_job(
        resume_id=created["id"], payload=resumes_module.ResumeAdaptRequest(job_id=job.id), db=db, current_user=user,
    ))
    assert result["changed"] is False
    assert result["diff"]["added_skills"] == []
    assert result["resume"]["data"] == created["data"]
    versions = asyncio.run(_list_versions(resume_id=created["id"], db=db, current_user=user))
    assert versions == []


def test_adapt_applies_grounded_changes_with_version_snapshot(db, monkeypatch):
    """With the flag on and the LLM (mocked at the C1 chat_json seam)
    suggesting skills, only job-listed skills are added, the summary is
    replaced, a pre-adaptation version exists, and additions are mirrored
    into hardSkills (where the editor/exporters actually render them)."""
    from app.services import cv_export_service as ces

    monkeypatch.setattr(ces.settings, "CV_EXPORT_LLM_INJECTION_ENABLED", True)
    monkeypatch.setattr(ces.llm_service, "chat_json", lambda *a, **k: {
        "professionalSummary": "Resumo adaptado à vaga.",
        "suggestedSkills": ["Spark", "Habilidade Inventada"],
    })

    user = _make_candidate(db)
    data = dict(_EXPORTABLE_DATA)
    data["skills"] = ["Python"]
    data["hardSkills"] = ["Python", "SQL"]
    created = asyncio.run(_create_resume(
        payload=ResumeCreateRequest(title="CV", data=data), db=db, current_user=user,
    ))
    job = _make_job(db)
    job.required_skills = json.dumps(["Spark", "Python"])
    db.commit()

    result = asyncio.run(resumes_module.adapt_resume_to_job(
        resume_id=created["id"], payload=resumes_module.ResumeAdaptRequest(job_id=job.id), db=db, current_user=user,
    ))
    assert result["changed"] is True
    assert result["diff"]["summary_changed"] is True
    assert result["diff"]["added_skills"] == ["Spark"]  # job-listed only; nothing invented
    assert result["resume"]["data"]["professionalSummary"] == "Resumo adaptado à vaga."
    assert "Spark" in result["resume"]["data"]["hardSkills"]

    versions = asyncio.run(_list_versions(resume_id=created["id"], db=db, current_user=user))
    assert len(versions) == 1 and "adaptar" in (versions[0]["change_summary"] or "").lower()
    snapshot = asyncio.run(_get_version(resume_id=created["id"], version_id=versions[0]["id"], db=db, current_user=user))
    assert snapshot["data"]["professionalSummary"] == _EXPORTABLE_DATA["professionalSummary"]


def test_adapt_unknown_job_404s(db):
    user = _make_candidate(db)
    created = asyncio.run(_create_resume(
        payload=ResumeCreateRequest(title="CV", data=_EXPORTABLE_DATA), db=db, current_user=user,
    ))
    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(resumes_module.adapt_resume_to_job(
            resume_id=created["id"], payload=resumes_module.ResumeAdaptRequest(job_id=str(uuid.uuid4())), db=db, current_user=user,
        ))
    assert exc_info.value.status_code == 404


# --------------------------- cover letters (Phase C3) ----------------------- #

def test_create_and_list_cover_letters(db):
    user = _make_candidate(db)
    created = asyncio.run(_create_cover_letter(
        payload=CoverLetterCreateRequest(title="Carta X", content="Conteúdo da carta."),
        db=db, current_user=user,
    ))
    assert created.title == "Carta X"
    assert created.is_draft is True

    letters = asyncio.run(_list_cover_letters(db=db, current_user=user))
    assert len(letters) == 1
    assert letters[0].id == created.id


def test_update_cover_letter_content_and_publish(db):
    user = _make_candidate(db)
    created = asyncio.run(_create_cover_letter(
        payload=CoverLetterCreateRequest(title="Carta", content="V1"), db=db, current_user=user,
    ))
    updated = asyncio.run(_update_cover_letter(
        letter_id=created.id,
        payload=CoverLetterUpdateRequest(content="V2", is_draft=False),
        db=db, current_user=user,
    ))
    assert updated.content == "V2"
    assert updated.is_draft is False
    assert updated.is_published is True


def test_delete_cover_letter(db):
    user = _make_candidate(db)
    created = asyncio.run(_create_cover_letter(
        payload=CoverLetterCreateRequest(title="Carta", content="X"), db=db, current_user=user,
    ))
    asyncio.run(_delete_cover_letter(letter_id=created.id, db=db, current_user=user))
    assert asyncio.run(_list_cover_letters(db=db, current_user=user)) == []


def test_export_cover_letter_returns_pdf_bytes(db):
    user = _make_candidate(db)
    created = asyncio.run(_create_cover_letter(
        payload=CoverLetterCreateRequest(title="Carta de Apresentação", content="Parágrafo um.\n\nParágrafo dois."),
        db=db, current_user=user,
    ))
    response = asyncio.run(_export_cover_letter(letter_id=created.id, db=db, current_user=user))
    assert response.media_type == "application/pdf"
    assert response.body.startswith(b"%PDF")


def test_cover_letters_are_ownership_isolated(db):
    owner = _make_candidate(db, email="owner-cl@example.com")
    intruder = _make_candidate(db, email="intruder-cl@example.com")
    created = asyncio.run(_create_cover_letter(
        payload=CoverLetterCreateRequest(title="Carta", content="X"), db=db, current_user=owner,
    ))
    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(_update_cover_letter(
            letter_id=created.id, payload=CoverLetterUpdateRequest(content="Hack"), db=db, current_user=intruder,
        ))
    assert exc_info.value.status_code == 404


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


def test_cover_letters_list_route_registered_before_dynamic_resume_id_route():
    """Same bug class, same fix (Phase C3): GET /cover-letters is a static
    single-segment path added after this endpoint existed in name only —
    it must be registered before GET /{resume_id} or it's permanently
    shadowed exactly like /matches was."""
    get_paths_in_order = [
        r.path for r in resumes_module.router.routes if "GET" in r.methods
    ]
    letters_index = get_paths_in_order.index("/resumes/cover-letters")
    dynamic_index = get_paths_in_order.index("/resumes/{resume_id}")
    assert letters_index < dynamic_index
