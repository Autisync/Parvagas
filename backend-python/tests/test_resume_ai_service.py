"""Tests for ResumeAIService after the C1 "one LLM client" refactor
(EXECUTION_PLAN_NATIVE_CV_BUILDER.md): all HTTP goes through
llm_service.chat_json_request, so these tests monkeypatch that single seam
(in the resume_ai_service namespace, where it's imported) — no network, no
bespoke per-provider mocking.
"""
from types import SimpleNamespace

from app.services import resume_ai_service as ras_module
from app.services.resume_ai_service import ResumeAIService


def _resume(**overrides):
    defaults = dict(
        id="r1", title="CV de Teste", summary="Resumo.",
        data='{"skills": ["Python", "SQL"], "work_experience": [{"company": "Acme"}]}',
        template_id="t1",
    )
    defaults.update(overrides)
    return SimpleNamespace(**defaults)


_SCORE_RESPONSE = {
    "overall_score": 82, "skills_score": 80, "experience_score": 75,
    "formatting_score": 90, "ats_score": 85, "metadata": {"reasoning": "ok"},
}


def test_score_uses_cloud_tier_through_shared_client(monkeypatch):
    calls = []

    def fake_chat_json_request(url, headers, body, *, fallback, timeout):
        calls.append({"url": url, "body": body, "timeout": timeout})
        return _SCORE_RESPONSE

    monkeypatch.setattr(ras_module, "chat_json_request", fake_chat_json_request)
    monkeypatch.setattr(ras_module.settings, "RESUME_AI_ENABLED", True)
    monkeypatch.setattr(ras_module.settings, "RESUME_AI_API_KEY", "sk-test")
    monkeypatch.setattr(ras_module.settings, "RESUME_AI_MODEL", "gpt-test")

    result = ResumeAIService.score_resume(_resume(), None, use_free_tier=False)
    assert result["source"] == "ai_cloud"
    assert result["overall_score"] == 82.0
    assert len(calls) == 1
    assert calls[0]["url"].endswith("/chat/completions")


def test_free_tier_routes_to_ollama_openai_compat_endpoint(monkeypatch):
    calls = []

    def fake_chat_json_request(url, headers, body, *, fallback, timeout):
        calls.append(url)
        return _SCORE_RESPONSE

    monkeypatch.setattr(ras_module, "chat_json_request", fake_chat_json_request)
    monkeypatch.setattr(ras_module.settings, "RESUME_AI_ENABLED", True)
    monkeypatch.setattr(ras_module.settings, "RESUME_AI_API_KEY", "sk-test")
    monkeypatch.setattr(ras_module.settings, "RESUME_AI_MODEL", "gpt-test")
    monkeypatch.setattr(ras_module.settings, "OLLAMA_FREE_TIER_ENABLED", True)
    monkeypatch.setattr(ras_module.settings, "OLLAMA_BASE_URL", "http://ollama:11434")
    monkeypatch.setattr(ras_module.settings, "OLLAMA_MODEL", "qwen-test")

    result = ResumeAIService.score_resume(_resume(), None, use_free_tier=True)
    assert result["source"] == "ai_ollama"
    # C1: the Ollama tier now speaks the OpenAI-compatible endpoint, not the
    # native /api/chat protocol — same wire shape as every other provider.
    assert calls == ["http://ollama:11434/v1/chat/completions"]


def test_score_falls_through_to_heuristic_when_llm_fails(monkeypatch):
    def failing_chat_json_request(url, headers, body, *, fallback, timeout):
        return fallback  # chat_json_request's never-raises failure contract

    monkeypatch.setattr(ras_module, "chat_json_request", failing_chat_json_request)
    monkeypatch.setattr(ras_module.settings, "RESUME_AI_ENABLED", True)
    monkeypatch.setattr(ras_module.settings, "RESUME_AI_API_KEY", "sk-test")
    monkeypatch.setattr(ras_module.settings, "RESUME_AI_MODEL", "gpt-test")
    monkeypatch.setattr(ras_module.settings, "OLLAMA_FREE_TIER_ENABLED", True)

    result = ResumeAIService.score_resume(_resume(), None, use_free_tier=False)
    assert result["source"] == "heuristic"
    assert 0 <= result["overall_score"] <= 100


def test_score_always_includes_explanations_regardless_of_source(monkeypatch):
    """Explanations must be present no matter which path scored the resume —
    an ignorant user asking "why this score" can't be left with nothing just
    because the AI happened to be reachable (or not) that day."""
    def fake_chat_json_request(url, headers, body, *, fallback, timeout):
        return _SCORE_RESPONSE

    monkeypatch.setattr(ras_module, "chat_json_request", fake_chat_json_request)
    monkeypatch.setattr(ras_module.settings, "RESUME_AI_ENABLED", True)
    monkeypatch.setattr(ras_module.settings, "RESUME_AI_API_KEY", "sk-test")
    monkeypatch.setattr(ras_module.settings, "RESUME_AI_MODEL", "gpt-test")

    ai_result = ResumeAIService.score_resume(_resume(), None, use_free_tier=False)
    assert ai_result["source"] == "ai_cloud"
    explanations = ai_result["explanations"]
    assert {e["dimension"] for e in explanations} == {
        "skills_score", "experience_score", "formatting_score", "ats_score",
    }
    for e in explanations:
        assert e["explanation"]  # never blank — always a concrete reason

    monkeypatch.setattr(ras_module.settings, "RESUME_AI_ENABLED", False)
    monkeypatch.setattr(ras_module.settings, "OLLAMA_FREE_TIER_ENABLED", False)
    heuristic_result = ResumeAIService.score_resume(_resume(), None, use_free_tier=False)
    assert heuristic_result["source"] == "heuristic"
    assert len(heuristic_result["explanations"]) == 4


def test_score_explanation_suggestion_omitted_once_dimension_is_strong(monkeypatch):
    monkeypatch.setattr(ras_module.settings, "RESUME_AI_ENABLED", False)
    monkeypatch.setattr(ras_module.settings, "OLLAMA_FREE_TIER_ENABLED", False)

    # A well-populated resume (title + summary + template all present) has
    # nothing missing on formatting — no suggestion, regardless of the
    # heuristic formula's numeric band (it caps formatting at 60/"média"
    # even with everything filled in, so band alone isn't the right signal
    # here — see suppress_suggestion in _build_dimension_explanations).
    resume = _resume()
    result = ResumeAIService.score_resume(resume, None, use_free_tier=False)
    formatting = next(e for e in result["explanations"] if e["dimension"] == "formatting_score")
    assert formatting["suggestion"] is None

    # An empty resume should score low everywhere and get concrete suggestions.
    empty_resume = _resume(title="", summary="", data="{}", template_id=None)
    empty_result = ResumeAIService.score_resume(empty_resume, None, use_free_tier=False)
    skills = next(e for e in empty_result["explanations"] if e["dimension"] == "skills_score")
    assert skills["band"] == "baixa"
    assert skills["suggestion"]


def test_rewrite_returns_unmodified_content_when_ai_unavailable(monkeypatch):
    monkeypatch.setattr(ras_module.settings, "RESUME_AI_ENABLED", False)
    monkeypatch.setattr(ras_module.settings, "OLLAMA_FREE_TIER_ENABLED", False)

    resume = _resume()
    result = ResumeAIService.rewrite_resume(resume, None, "professional", None)
    assert result["source"] == "heuristic"
    assert result["title"] == resume.title
    assert result["summary"] == resume.summary


def test_rewrite_uses_cloud_result(monkeypatch):
    def fake_chat_json_request(url, headers, body, *, fallback, timeout):
        return {"title": "Título Melhorado", "summary": "Resumo melhorado.", "notes": "ok"}

    monkeypatch.setattr(ras_module, "chat_json_request", fake_chat_json_request)
    monkeypatch.setattr(ras_module.settings, "RESUME_AI_ENABLED", True)
    monkeypatch.setattr(ras_module.settings, "RESUME_AI_API_KEY", "sk-test")
    monkeypatch.setattr(ras_module.settings, "RESUME_AI_MODEL", "gpt-test")

    result = ResumeAIService.rewrite_resume(_resume(), None, "professional", "melhora isto")
    assert result["source"] == "ai_cloud"
    assert result["title"] == "Título Melhorado"


def test_azure_provider_builds_deployment_url(monkeypatch):
    calls = []

    def fake_chat_json_request(url, headers, body, *, fallback, timeout):
        calls.append({"url": url, "headers": headers, "body": body})
        return _SCORE_RESPONSE

    monkeypatch.setattr(ras_module, "chat_json_request", fake_chat_json_request)
    monkeypatch.setattr(ras_module.settings, "RESUME_AI_ENABLED", True)
    monkeypatch.setattr(ras_module.settings, "RESUME_AI_API_KEY", "azure-key")
    monkeypatch.setattr(ras_module.settings, "RESUME_AI_MODEL", "my-deployment")
    monkeypatch.setattr(ras_module.settings, "RESUME_AI_PROVIDER", "azure")

    ResumeAIService.score_resume(_resume(), None, use_free_tier=False)
    assert "/openai/deployments/my-deployment/chat/completions" in calls[0]["url"]
    assert calls[0]["headers"]["api-key"] == "azure-key"
    assert "model" not in calls[0]["body"]  # Azure takes the model from the URL path
