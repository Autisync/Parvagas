"""AI resume scoring and rewrite helpers.

HTTP is delegated to llm_service.chat_json_request (plan C1: one LLM client
path for every feature) — this module only assembles per-tier endpoint
config (_request_parts), builds prompts, and normalizes/validates results.
The public API (score_resume/rewrite_resume with use_free_tier routing) and
the cloud → Ollama → heuristic fall-through are unchanged.
"""
import json
from typing import Any

from app.core.config import get_settings
from app.core.logging import get_logger
from app.models import CandidateProfile, Resume
from app.services.llm_service import chat_json_request

logger = get_logger(__name__)
settings = get_settings()


class ResumeAIService:
    """Service for AI-enhanced resume scoring and rewrite operations."""

    @staticmethod
    def _ai_enabled() -> bool:
        return bool(
            settings.RESUME_AI_ENABLED
            and settings.RESUME_AI_API_KEY.strip()
            and settings.RESUME_AI_MODEL.strip()
        )

    @staticmethod
    def _ai_provider() -> str:
        return (settings.RESUME_AI_PROVIDER or "openai").strip().lower()

    @staticmethod
    def _build_ai_prompt_for_score(resume: Resume, profile: CandidateProfile | None) -> str:
        resume_data = resume.data or "{}"
        profile_data = {
            "full_name": profile.full_name if profile else None,
            "email": profile.user.email if profile else None,
            "phone": profile.phone if profile else None,
            "location": profile.location if profile else None,
        }
        return (
            "Analyze the candidate resume below and return only valid JSON with the following numeric scores (0-100): "
            "overall_score, skills_score, experience_score, formatting_score, ats_score. "
            "Also include a metadata object with concise reasoning for each score. "
            "Use the resume title, summary, template usage, and structured resume fields to score how well the resume is written and how likely it is to pass an ATS review. "
            "Do not invent any resume facts. If information is missing, give a lower score and explain why in metadata."
            f"\n\nRESUME TITLE: {resume.title}\n"
            f"RESUME SUMMARY: {resume.summary or ''}\n"
            f"CANDIDATE PROFILE: {json.dumps(profile_data, ensure_ascii=False)}\n"
            f"RESUME DATA: {resume_data}\n"
        )

    @staticmethod
    def _build_ai_prompt_for_rewrite(resume: Resume, profile: CandidateProfile | None, tone: str, instructions: str | None) -> str:
        resume_data = resume.data or "{}"
        candidate_name = profile.full_name if profile else "the candidate"
        guidance = (
            f"Rewrite the resume summary and suggest a more polished resume title for {candidate_name}. "
            f"Use a {tone} tone and follow these instructions: {instructions or 'Write a strong professional resume summary.'}. "
            "Return only valid JSON with keys: title, summary, notes. "
            "Keep the title concise and the summary clear, results-oriented, and ATS-friendly. "
            "Do not invent new qualifications; only rephrase the existing resume content."
        )
        return (
            f"{guidance}\n\nRESUME TITLE: {resume.title}\n"
            f"RESUME SUMMARY: {resume.summary or ''}\n"
            f"RESUME DATA: {resume_data}\n"
        )

    @staticmethod
    def _ollama_enabled() -> bool:
        return (
            settings.OLLAMA_FREE_TIER_ENABLED
            and bool(settings.OLLAMA_BASE_URL.strip())
            and bool(settings.OLLAMA_MODEL.strip())
        )

    @staticmethod
    def _call_ollama(prompt: str) -> dict[str, Any] | None:
        """Free-tier call through Ollama's OpenAI-compatible endpoint.

        C1 note: this used to speak Ollama's NATIVE /api/chat protocol
        (different body: stream/format keys; different response shape:
        message.content instead of choices[0].message.content), which is
        exactly the bespoke-HTTP divergence the plan's "one LLM client"
        refactor removes. Ollama has shipped the /v1/chat/completions
        OpenAI-compatibility layer since early 2024 and the deployed image
        is ollama/ollama:latest, so the unified path applies cleanly.
        """
        url = f"{settings.OLLAMA_BASE_URL.rstrip('/')}/v1/chat/completions"
        body = {
            "model": settings.OLLAMA_MODEL,
            "messages": [
                {"role": "system", "content": "You are a resume optimization assistant. Always respond with valid JSON only."},
                {"role": "user", "content": prompt},
            ],
            "temperature": 0.2,
            "response_format": {"type": "json_object"},
        }
        result = chat_json_request(
            url,
            {"Content-Type": "application/json"},
            body,
            fallback={},
            timeout=settings.OLLAMA_TIMEOUT_SECONDS,
        )
        return result or None

    @staticmethod
    def _request_parts(prompt: str) -> tuple[str, dict[str, str], dict[str, Any]]:
        provider = ResumeAIService._ai_provider()
        base_url = settings.RESUME_AI_BASE_URL.rstrip("/")
        body = {
            "model": settings.RESUME_AI_MODEL,
            "messages": [
                {"role": "system", "content": "You are a resume optimization assistant."},
                {"role": "user", "content": prompt},
            ],
            "temperature": 0.2,
            "response_format": {"type": "json_object"},
        }

        if provider == "azure":
            headers = {
                "api-key": settings.RESUME_AI_API_KEY,
                "Content-Type": "application/json",
            }
            url = (
                f"{base_url}/openai/deployments/{settings.RESUME_AI_MODEL}/chat/completions"
                f"?api-version={settings.RESUME_AI_AZURE_API_VERSION}"
            )
            body.pop("model", None)
            return url, headers, body

        headers = {
            "Authorization": f"Bearer {settings.RESUME_AI_API_KEY}",
            "Content-Type": "application/json",
        }
        if settings.RESUME_AI_ORGANIZATION.strip():
            headers["OpenAI-Organization"] = settings.RESUME_AI_ORGANIZATION.strip()
        if settings.RESUME_AI_PROJECT.strip():
            headers["OpenAI-Project"] = settings.RESUME_AI_PROJECT.strip()
        if provider == "openrouter":
            headers["HTTP-Referer"] = settings.RESUME_AI_SITE_URL.strip() or settings.FRONTEND_URL
            headers["X-Title"] = settings.RESUME_AI_APP_NAME.strip() or "Parvagas Resume AI"

        url = f"{base_url}/chat/completions"
        return url, headers, body

    @staticmethod
    def _call_ai(prompt: str) -> dict[str, Any] | None:
        if not ResumeAIService._ai_enabled():
            return None

        url, headers, body = ResumeAIService._request_parts(prompt)
        result = chat_json_request(
            url, headers, body,
            fallback={},
            timeout=settings.RESUME_AI_TIMEOUT_SECONDS,
        )
        return result or None

    @staticmethod
    def score_resume(resume: Resume, profile: CandidateProfile | None, use_free_tier: bool = False) -> dict[str, Any]:
        # Cloud AI — paid subscribers (RESUME_AI_ENABLED + API key)
        if ResumeAIService._ai_enabled() and not use_free_tier:
            ai_prompt = ResumeAIService._build_ai_prompt_for_score(resume, profile)
            ai_result = ResumeAIService._call_ai(ai_prompt)
            if ai_result:
                return {
                    "overall_score": float(ai_result.get("overall_score", 0.0)),
                    "skills_score": float(ai_result.get("skills_score", 0.0)),
                    "experience_score": float(ai_result.get("experience_score", 0.0)),
                    "formatting_score": float(ai_result.get("formatting_score", 0.0)),
                    "ats_score": float(ai_result.get("ats_score", 0.0)),
                    "metadata": ai_result.get("metadata", {}),
                    "source": "ai_cloud",
                }

        # Ollama — free tier (self-hosted LLM, limited but functional)
        if ResumeAIService._ollama_enabled():
            try:
                ai_prompt = ResumeAIService._build_ai_prompt_for_score(resume, profile)
                ai_result = ResumeAIService._call_ollama(ai_prompt)
                if ai_result:
                    return {
                        "overall_score": float(ai_result.get("overall_score", 0.0)),
                        "skills_score": float(ai_result.get("skills_score", 0.0)),
                        "experience_score": float(ai_result.get("experience_score", 0.0)),
                        "formatting_score": float(ai_result.get("formatting_score", 0.0)),
                        "ats_score": float(ai_result.get("ats_score", 0.0)),
                        "metadata": ai_result.get("metadata", {}),
                        "source": "ai_ollama",
                    }
            except Exception:
                pass  # fall through to heuristic

        return ResumeAIService._heuristic_score(resume, profile)

    @staticmethod
    def rewrite_resume(resume: Resume, profile: CandidateProfile | None, tone: str, instructions: str | None, use_free_tier: bool = False) -> dict[str, Any]:
        # Cloud AI — paid subscribers
        if ResumeAIService._ai_enabled() and not use_free_tier:
            prompt = ResumeAIService._build_ai_prompt_for_rewrite(resume, profile, tone, instructions)
            ai_result = ResumeAIService._call_ai(prompt)
            if ai_result:
                return {
                    "title": str(ai_result.get("title", resume.title)).strip() or resume.title,
                    "summary": str(ai_result.get("summary", resume.summary or "")).strip(),
                    "notes": str(ai_result.get("notes", "AI rewrite completed.")),
                    "source": "ai_cloud",
                }

        # Ollama — free tier
        if ResumeAIService._ollama_enabled():
            try:
                prompt = ResumeAIService._build_ai_prompt_for_rewrite(resume, profile, tone, instructions)
                ai_result = ResumeAIService._call_ollama(prompt)
                if ai_result:
                    return {
                        "title": str(ai_result.get("title", resume.title)).strip() or resume.title,
                        "summary": str(ai_result.get("summary", resume.summary or "")).strip(),
                        "notes": str(ai_result.get("notes", "Rewrite via Ollama (free tier).")),
                        "source": "ai_ollama",
                    }
            except Exception:
                pass

        return {
            "title": resume.title,
            "summary": (resume.summary or "").strip(),
            "notes": "AI rewrite disabled or unavailable; no rewrite was applied.",
            "source": "heuristic",
        }

    @staticmethod
    def _heuristic_score(resume: Resume, profile: CandidateProfile | None) -> dict[str, Any]:
        data = {}
        try:
            data = json.loads(resume.data or "{}")
        except Exception:
            data = {}

        skills = data.get("skills") if isinstance(data.get("skills"), list) else []
        experience = data.get("work_experience") if isinstance(data.get("work_experience"), list) else []
        summary = str(resume.summary or "").strip()
        title = str(resume.title or "").strip()

        skills_score = min(100.0, len(skills) * 5 + (10.0 if skills else 0.0))
        experience_score = min(100.0, len(experience) * 10 + (10.0 if profile and profile.years_of_experience else 0.0))
        formatting_score = 40.0 if title and summary else 25.0
        formatting_score += 20.0 if resume.template_id else 0.0
        formatting_score = min(100.0, formatting_score)

        ats_score = 10.0
        if summary:
            ats_score += 30.0
        if skills:
            ats_score += min(40.0, len(skills) * 2.0)
        if experience:
            ats_score += 20.0
        ats_score = min(100.0, ats_score)

        total = (skills_score * 0.3 + experience_score * 0.3 + formatting_score * 0.2 + ats_score * 0.2)
        overall_score = round(total, 2)

        metadata = {
            "skill_count": len(skills),
            "experience_entries": len(experience),
            "has_summary": bool(summary),
            "has_template": bool(resume.template_id),
            "scoring_mode": "heuristic",
        }

        return {
            "overall_score": overall_score,
            "skills_score": round(skills_score, 2),
            "experience_score": round(experience_score, 2),
            "formatting_score": round(formatting_score, 2),
            "ats_score": round(ats_score, 2),
            "metadata": metadata,
            "source": "heuristic",
        }
