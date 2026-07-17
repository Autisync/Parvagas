"""AI resume scoring and rewrite helpers.

HTTP is delegated to llm_service.chat_json_request (plan C1: one LLM client
path for every feature) — this module only assembles per-tier endpoint
config (_request_parts), builds prompts, and normalizes/validates results.
The public API (score_resume/rewrite_resume with use_free_tier routing) and
the cloud → Ollama → heuristic fall-through are unchanged.
"""
import hashlib
import json
from typing import Any

from app.core.config import get_settings
from app.services.feature_flags import get_flag
from app.core.logging import get_logger
from app.models import CandidateProfile, Resume
from app.services.llm_service import chat_json_request, ollama_concurrency_guard

logger = get_logger(__name__)
settings = get_settings()

# Re-clicking "Avaliar CV"/"Melhorar texto"/"Melhorar com IA" without having
# changed anything (or a page refresh replaying the same action) otherwise
# pays a full LLM round-trip every time — round-trips this app now runs off
# the event loop (run_in_threadpool) but that only stops them from blocking
# *other* requests, not from costing money/latency on their own. 10 minutes:
# long enough to absorb duplicate clicks/reloads, short enough that a
# genuinely edited resume gets a fresh result quickly. No prior art for this
# TTL in the codebase — picked from the middle of a reasonable range rather
# than invented from nothing.
_AI_RESULT_CACHE_TTL_SECONDS = 600


def _ai_cache_key(*parts: Any) -> str:
    raw = json.dumps(parts, sort_keys=True, default=str, ensure_ascii=False)
    return "ai_result:" + hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _ai_cache_get(key: str) -> dict[str, Any] | None:
    """Fails open — a Redis hiccup must fall through to a live LLM call,
    never block or error the request. Mirrors the pattern already used by
    EmailService._check_outbound_rate_limit."""
    try:
        import redis as _redis

        client = _redis.Redis.from_url(settings.REDIS_URL, socket_timeout=2)
        raw = client.get(key)
        if raw:
            return json.loads(raw)
    except Exception as exc:  # noqa: BLE001
        logger.debug("AI result cache read skipped: %s", exc)
    return None


def _ai_cache_set(key: str, value: dict[str, Any]) -> None:
    try:
        import redis as _redis

        client = _redis.Redis.from_url(settings.REDIS_URL, socket_timeout=2)
        client.setex(key, _AI_RESULT_CACHE_TTL_SECONDS, json.dumps(value))
    except Exception as exc:  # noqa: BLE001
        logger.debug("AI result cache write skipped: %s", exc)


class ResumeAIService:
    """Service for AI-enhanced resume scoring and rewrite operations."""

    @staticmethod
    def _ai_enabled() -> bool:
        return bool(
            get_flag("RESUME_AI_ENABLED", settings.RESUME_AI_ENABLED)
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
    def _build_ai_prompt_for_experience(job_title: str | None, company: str | None, description: str, tone: str) -> str:
        role = job_title or "this role"
        employer = f" at {company}" if company else ""
        guidance = (
            f"Rewrite the following work-experience description for the role of {role}{employer} to be more "
            f"impactful and results-oriented, in a {tone} tone. Many candidates undersell their own work — use "
            "strong action verbs, tighten vague phrasing, and surface impact that is already implied by the text "
            "(e.g. scope, scale, ownership) more clearly. "
            "Return only valid JSON with keys: description, notes. "
            "Do not invent facts, numbers, or achievements that are not already present or clearly implied in the "
            "original text — only rephrase and strengthen what is already there."
        )
        return f"{guidance}\n\nORIGINAL DESCRIPTION: {description}\n"

    @staticmethod
    def _ollama_enabled() -> bool:
        return (
            get_flag("OLLAMA_FREE_TIER_ENABLED", settings.OLLAMA_FREE_TIER_ENABLED)
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
        with ollama_concurrency_guard() as has_slot:
            if not has_slot:
                logger.info("Ollama at capacity (OLLAMA_MAX_CONCURRENT), skipping call for this request")
                return None
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
    def _score_band(value: float) -> str:
        if value >= 85:
            return "excelente"
        if value >= 65:
            return "boa"
        if value >= 40:
            return "média"
        return "baixa"

    @staticmethod
    def _resume_signals(resume: Resume, profile: CandidateProfile | None) -> dict[str, Any]:
        """Raw, always-computable facts about the resume — independent of
        which scoring path produced the numbers. Explanations are built from
        these, never from the AI's free-form (unstructured, LLM-dependent-
        shape) metadata text, so an ignorant user gets a consistent, concrete
        answer to "why this score" no matter whether cloud AI, Ollama, or the
        heuristic fallback actually scored the resume."""
        try:
            data = json.loads(resume.data or "{}")
        except Exception:
            data = {}
        skills = data.get("skills") if isinstance(data.get("skills"), list) else []
        experience = data.get("work_experience") if isinstance(data.get("work_experience"), list) else []
        return {
            "skill_count": len(skills),
            "experience_count": len(experience),
            "has_summary": bool(str(resume.summary or "").strip()),
            "has_title": bool(str(resume.title or "").strip()),
            "has_template": bool(resume.template_id),
            "years_of_experience": profile.years_of_experience if profile else None,
        }

    @staticmethod
    def _build_dimension_explanations(resume: Resume, profile: CandidateProfile | None, scores: dict[str, Any]) -> list[dict[str, Any]]:
        """Plain-language "why this score + what to do about it" for every
        dimension — written for someone with zero context on what an ATS
        score even is. Always present regardless of scoring source (see
        _resume_signals)."""
        s = ResumeAIService._resume_signals(resume, profile)

        def entry(key: str, label: str, explanation: str, suggestion: str | None, suppress_suggestion: bool | None = None) -> dict[str, Any]:
            value = scores.get(key)
            band = ResumeAIService._score_band(value) if value is not None else None
            # Default: suppress once the numeric band is already strong.
            # formatting_score passes an explicit override instead — the
            # heuristic formula caps that dimension at 60 ("média") even with
            # title+summary+template ALL present, so band alone would still
            # tell someone who has already done everything right to go add a
            # title/summary/template they already have.
            suppress = suppress_suggestion if suppress_suggestion is not None else band in ("excelente", "boa")
            return {
                "dimension": key,
                "label": label,
                "score": value,
                "band": band,
                "explanation": explanation,
                # No suggestion once nothing is actually missing — nothing
                # ignorant-proof about telling someone to fix what isn't broken.
                "suggestion": None if suppress else suggestion,
            }

        skills_explanation = (
            f"Encontrámos {s['skill_count']} competência(s) listada(s) no seu CV. Mais competências relevantes "
            "ajudam os recrutadores (e os sistemas automáticos) a perceber rapidamente no que é bom."
            if s["skill_count"] else
            "Não encontrámos nenhuma competência listada no seu CV."
        )
        experience_explanation = (
            f"O seu CV tem {s['experience_count']} experiência(s) profissional(is) registada(s)."
            if s["experience_count"] else
            "Ainda não adicionou nenhuma experiência profissional ao seu CV."
        )
        formatting_bits = []
        if not s["has_title"]:
            formatting_bits.append("falta um título")
        if not s["has_summary"]:
            formatting_bits.append("falta um resumo profissional")
        if not s["has_template"]:
            formatting_bits.append("não escolheu um modelo visual")
        formatting_explanation = (
            "O seu CV está bem estruturado: tem título, resumo e um modelo visual aplicado."
            if not formatting_bits else
            "O seu CV está incompleto: " + ", ".join(formatting_bits) + "."
        )
        ats_explanation = (
            "Sistemas de recrutamento automático (ATS) leem o seu CV antes de um humano o ver. "
            + (
                "O seu CV tem resumo, competências e experiência preenchidos, o que ajuda a passar nesse filtro."
                if s["has_summary"] and s["skill_count"] and s["experience_count"] else
                "Faltam secções importantes (resumo, competências ou experiência), o que reduz as hipóteses de passar nesse filtro."
            )
        )

        return [
            entry(
                "skills_score", "Competências", skills_explanation,
                "Adicione competências relevantes para as vagas a que se quer candidatar (ex: ferramentas, línguas, certificações).",
            ),
            entry(
                "experience_score", "Experiência", experience_explanation,
                "Descreva as suas experiências profissionais com resultados concretos (ex: \"aumentei as vendas em 20%\").",
            ),
            entry(
                "formatting_score", "Formatação", formatting_explanation,
                "Dê um título ao CV, escreva um resumo profissional curto e escolha um modelo visual.",
                suppress_suggestion=not formatting_bits,
            ),
            entry(
                "ats_score", "Compatibilidade com sistemas de recrutamento (ATS)", ats_explanation,
                "Preencha o resumo profissional, competências e experiência com palavras-chave da vaga que procura.",
            ),
        ]

    @staticmethod
    def score_resume(resume: Resume, profile: CandidateProfile | None, use_free_tier: bool = False) -> dict[str, Any]:
        ai_prompt = ResumeAIService._build_ai_prompt_for_score(resume, profile)
        # Cache key is the exact prompt (everything that could affect the
        # output is already folded into it) + tier — re-clicking "Avaliar
        # CV" without having changed anything returns the prior result
        # instead of paying another LLM round-trip.
        cache_key = _ai_cache_key("score", ai_prompt, use_free_tier)
        cached = _ai_cache_get(cache_key)
        if cached:
            return cached

        def finalize(scores: dict[str, Any], metadata: dict[str, Any], source: str, cache: bool) -> dict[str, Any]:
            result = {**scores, "metadata": metadata, "source": source}
            result["explanations"] = ResumeAIService._build_dimension_explanations(resume, profile, scores)
            if cache:
                _ai_cache_set(cache_key, result)
            return result

        # Cloud AI — paid subscribers (RESUME_AI_ENABLED + API key)
        if ResumeAIService._ai_enabled() and not use_free_tier:
            ai_result = ResumeAIService._call_ai(ai_prompt)
            if ai_result:
                scores = {
                    "overall_score": float(ai_result.get("overall_score", 0.0)),
                    "skills_score": float(ai_result.get("skills_score", 0.0)),
                    "experience_score": float(ai_result.get("experience_score", 0.0)),
                    "formatting_score": float(ai_result.get("formatting_score", 0.0)),
                    "ats_score": float(ai_result.get("ats_score", 0.0)),
                }
                return finalize(scores, ai_result.get("metadata", {}), "ai_cloud", cache=True)

        # Ollama — free tier (self-hosted LLM, limited but functional)
        if ResumeAIService._ollama_enabled():
            try:
                ai_result = ResumeAIService._call_ollama(ai_prompt)
                if ai_result:
                    scores = {
                        "overall_score": float(ai_result.get("overall_score", 0.0)),
                        "skills_score": float(ai_result.get("skills_score", 0.0)),
                        "experience_score": float(ai_result.get("experience_score", 0.0)),
                        "formatting_score": float(ai_result.get("formatting_score", 0.0)),
                        "ats_score": float(ai_result.get("ats_score", 0.0)),
                    }
                    return finalize(scores, ai_result.get("metadata", {}), "ai_ollama", cache=True)
            except Exception:
                pass  # fall through to heuristic

        # Heuristic path is free/instant — never cached (a cached miss would
        # otherwise mask the AI recovering for up to the cache TTL).
        heuristic = ResumeAIService._heuristic_score(resume, profile)
        heuristic["explanations"] = ResumeAIService._build_dimension_explanations(resume, profile, heuristic)
        return heuristic

    @staticmethod
    def rewrite_resume(resume: Resume, profile: CandidateProfile | None, tone: str, instructions: str | None, use_free_tier: bool = False) -> dict[str, Any]:
        prompt = ResumeAIService._build_ai_prompt_for_rewrite(resume, profile, tone, instructions)
        cache_key = _ai_cache_key("rewrite", prompt, use_free_tier)
        cached = _ai_cache_get(cache_key)
        if cached:
            return cached

        # Cloud AI — paid subscribers
        if ResumeAIService._ai_enabled() and not use_free_tier:
            ai_result = ResumeAIService._call_ai(prompt)
            if ai_result:
                result = {
                    "title": str(ai_result.get("title", resume.title)).strip() or resume.title,
                    "summary": str(ai_result.get("summary", resume.summary or "")).strip(),
                    "notes": str(ai_result.get("notes", "AI rewrite completed.")),
                    "source": "ai_cloud",
                }
                _ai_cache_set(cache_key, result)
                return result

        # Ollama — free tier
        if ResumeAIService._ollama_enabled():
            try:
                ai_result = ResumeAIService._call_ollama(prompt)
                if ai_result:
                    result = {
                        "title": str(ai_result.get("title", resume.title)).strip() or resume.title,
                        "summary": str(ai_result.get("summary", resume.summary or "")).strip(),
                        "notes": str(ai_result.get("notes", "Rewrite via Ollama (free tier).")),
                        "source": "ai_ollama",
                    }
                    _ai_cache_set(cache_key, result)
                    return result
            except Exception:
                pass

        return {
            "title": resume.title,
            "summary": (resume.summary or "").strip(),
            "notes": "AI rewrite disabled or unavailable; no rewrite was applied.",
            "source": "heuristic",
        }

    @staticmethod
    def improve_experience_description(
        job_title: str | None, company: str | None, description: str, tone: str = "professional", use_free_tier: bool = False
    ) -> dict[str, Any]:
        """Rewrite a single work-experience description — the per-item
        sibling of rewrite_resume, same cloud → Ollama → heuristic
        fall-through, scoped to one bullet instead of the whole resume."""
        prompt = ResumeAIService._build_ai_prompt_for_experience(job_title, company, description, tone)
        cache_key = _ai_cache_key("experience_improve", prompt, use_free_tier)
        cached = _ai_cache_get(cache_key)
        if cached:
            return cached

        # Cloud AI — paid subscribers
        if ResumeAIService._ai_enabled() and not use_free_tier:
            ai_result = ResumeAIService._call_ai(prompt)
            if ai_result:
                result = {
                    "description": str(ai_result.get("description", description)).strip() or description,
                    "notes": str(ai_result.get("notes", "AI rewrite completed.")),
                    "source": "ai_cloud",
                }
                _ai_cache_set(cache_key, result)
                return result

        # Ollama — free tier
        if ResumeAIService._ollama_enabled():
            try:
                ai_result = ResumeAIService._call_ollama(prompt)
                if ai_result:
                    result = {
                        "description": str(ai_result.get("description", description)).strip() or description,
                        "notes": str(ai_result.get("notes", "Rewrite via Ollama (free tier).")),
                        "source": "ai_ollama",
                    }
                    _ai_cache_set(cache_key, result)
                    return result
            except Exception:
                pass

        return {
            "description": description,
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
