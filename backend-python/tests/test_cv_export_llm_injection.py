"""Tests for the optional Llama CV keyword-injection pass (Phase 2,
TEST_PLAN_CAREER_OPS.md). The load-bearing guarantees: it never runs unless
explicitly enabled with a target job, it never drops or fabricates the
candidate's real content, and any LLM failure/malformed output falls back to
the untouched original profile.
"""
import pytest

from app.services import cv_export_service
from app.services.cv_export_service import inject_job_keywords, to_docx, to_json_resume, to_pdf


def _profile(**overrides):
    base = {
        "fullName": "Maria Candidata",
        "email": "maria@example.com",
        "professionalSummary": "Engenheira de software com 5 anos de experiencia em backend.",
        "skills": ["Python", "SQL"],
        "workExperience": [{"jobTitle": "Backend Developer", "company": "Acme"}],
        "education": [],
    }
    base.update(overrides)
    return base


def _job(**overrides):
    base = {
        "title": "Engenheiro Backend Senior",
        "category": "Tecnologia",
        "requiredSkills": ["Python", "Docker", "Kubernetes"],
    }
    base.update(overrides)
    return base


@pytest.fixture(autouse=True)
def _default_flag_off(monkeypatch):
    monkeypatch.setattr(cv_export_service.settings, "CV_EXPORT_LLM_INJECTION_ENABLED", False)


def test_no_job_given_returns_profile_unchanged():
    profile = _profile()
    result = inject_job_keywords(profile, None)
    assert result is profile


def test_flag_disabled_returns_profile_unchanged_even_with_job(monkeypatch):
    monkeypatch.setattr(cv_export_service.settings, "CV_EXPORT_LLM_INJECTION_ENABLED", False)
    profile = _profile()
    result = inject_job_keywords(profile, _job())
    assert result is profile


def test_base_export_still_works_with_no_target_job():
    profile = _profile()
    assert to_pdf(profile)
    assert to_docx(profile)
    resume = to_json_resume(profile)
    assert resume["basics"]["summary"] == profile["professionalSummary"]


def test_base_export_survives_empty_profile():
    empty_profile = {}
    assert to_pdf(empty_profile)
    assert to_docx(empty_profile)
    resume = to_json_resume(empty_profile)
    assert resume["basics"]["summary"] == ""


def test_injection_preserves_original_skills_and_adds_only_job_relevant_ones(monkeypatch):
    monkeypatch.setattr(cv_export_service.settings, "CV_EXPORT_LLM_INJECTION_ENABLED", True)
    monkeypatch.setattr(
        cv_export_service.llm_service, "chat_json",
        lambda *a, **k: {
            "professionalSummary": "Engenheira de software backend com foco em Python e containers.",
            "suggestedSkills": ["Docker", "Rust", "SomethingMadeUp"],  # Rust/MadeUp not in job.requiredSkills
        },
    )
    profile = _profile()
    result = inject_job_keywords(profile, _job())

    assert "Python" in result["skills"]
    assert "SQL" in result["skills"]  # original never dropped
    assert "Docker" in result["skills"]  # accepted: suggested AND in job.requiredSkills
    assert "Rust" not in result["skills"]  # rejected: not in job.requiredSkills
    assert "SomethingMadeUp" not in result["skills"]  # rejected: fabricated, not in job.requiredSkills


def test_injection_never_touches_experience_or_education(monkeypatch):
    monkeypatch.setattr(cv_export_service.settings, "CV_EXPORT_LLM_INJECTION_ENABLED", True)
    monkeypatch.setattr(
        cv_export_service.llm_service, "chat_json",
        lambda *a, **k: {"professionalSummary": "Novo resumo.", "suggestedSkills": ["Docker"]},
    )
    profile = _profile()
    result = inject_job_keywords(profile, _job())
    assert result["workExperience"] == profile["workExperience"]
    assert result["education"] == profile["education"]
    assert result["fullName"] == profile["fullName"]


def test_original_profile_dict_never_mutated(monkeypatch):
    monkeypatch.setattr(cv_export_service.settings, "CV_EXPORT_LLM_INJECTION_ENABLED", True)
    monkeypatch.setattr(
        cv_export_service.llm_service, "chat_json",
        lambda *a, **k: {"professionalSummary": "Novo resumo.", "suggestedSkills": ["Docker"]},
    )
    profile = _profile()
    original_skills_snapshot = list(profile["skills"])
    inject_job_keywords(profile, _job())
    assert profile["skills"] == original_skills_snapshot
    assert profile["professionalSummary"] == "Engenheira de software com 5 anos de experiencia em backend."


def test_falls_back_when_llm_returns_malformed_shape(monkeypatch):
    monkeypatch.setattr(cv_export_service.settings, "CV_EXPORT_LLM_INJECTION_ENABLED", True)
    monkeypatch.setattr(
        cv_export_service.llm_service, "chat_json",
        lambda *a, **k: {"professionalSummary": 12345, "suggestedSkills": "not-a-list"},
    )
    profile = _profile()
    result = inject_job_keywords(profile, _job())
    assert result is profile


def test_falls_back_when_llm_returns_empty_summary(monkeypatch):
    monkeypatch.setattr(cv_export_service.settings, "CV_EXPORT_LLM_INJECTION_ENABLED", True)
    monkeypatch.setattr(
        cv_export_service.llm_service, "chat_json",
        lambda *a, **k: {"professionalSummary": "   ", "suggestedSkills": []},
    )
    profile = _profile()
    result = inject_job_keywords(profile, _job())
    assert result is profile


def test_falls_back_when_llm_service_raises(monkeypatch):
    monkeypatch.setattr(cv_export_service.settings, "CV_EXPORT_LLM_INJECTION_ENABLED", True)

    def _boom(*a, **k):
        raise RuntimeError("ollama unreachable")

    monkeypatch.setattr(cv_export_service.llm_service, "chat_json", _boom)
    profile = _profile()
    result = inject_job_keywords(profile, _job())
    assert result is profile


def test_tailored_profile_still_exports_to_all_formats(monkeypatch):
    monkeypatch.setattr(cv_export_service.settings, "CV_EXPORT_LLM_INJECTION_ENABLED", True)
    monkeypatch.setattr(
        cv_export_service.llm_service, "chat_json",
        lambda *a, **k: {"professionalSummary": "Resumo adaptado.", "suggestedSkills": ["Docker"]},
    )
    profile = _profile()
    tailored = inject_job_keywords(profile, _job())
    assert to_pdf(tailored)
    assert to_docx(tailored)
    resume = to_json_resume(tailored)
    assert resume["basics"]["summary"] == "Resumo adaptado."
