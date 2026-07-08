"""Shared LLM invocation layer (app.services.llm_service).

One entry point for every feature that calls the AI processor (auto-apply
scoring, CV keyword injection, premium interview/cover-letter tools) — see
TEST_PLAN_CAREER_OPS.md Phase 0. Talks to any OpenAI-compatible /v1/chat/
completions endpoint; defaults to the self-hosted Ollama container in
docker-compose.yml, since Parvagas uses Llama as its AI processor.

Design intent: callers must always work even when the model is unreachable
or returns garbage. `chat_json` never raises — on any failure (disabled,
timeout, network error, non-JSON response, schema mismatch) it returns the
caller-supplied `fallback` instead. This is the guardrail every Llama-backed
feature in the execution plan depends on.
"""
import json

import httpx

from app.core.config import get_settings
from app.core.logging import get_logger

logger = get_logger(__name__)
settings = get_settings()


def llm_enabled() -> bool:
    """Whether the shared LLM service is usable right now.

    Ollama needs no API key; every other provider does — mirrors
    CVParserService._ai_enabled()'s gating for the other AI integration.
    """
    if not settings.LLM_ENABLED or not settings.LLM_MODEL.strip():
        return False
    if settings.LLM_PROVIDER.strip().lower() == "ollama":
        return True
    return bool(settings.LLM_API_KEY.strip())


def chat_json(
    system_prompt: str,
    user_prompt: str,
    *,
    fallback: dict,
    temperature: float = 0.1,
    timeout: float | None = None,
) -> dict:
    """Call the configured LLM in JSON mode and return the parsed object.

    Returns `fallback` untouched on any failure — disabled config, network/
    timeout error, non-2xx response, non-JSON content, or a response that
    isn't a JSON object. Callers should treat the result as untrusted input
    (validate/re-normalize) even on success, since the model can still
    return well-formed JSON with the wrong shape.
    """
    if not llm_enabled():
        return fallback

    base_url = settings.LLM_BASE_URL.rstrip("/")
    headers = {"Content-Type": "application/json"}
    if settings.LLM_API_KEY.strip():
        headers["Authorization"] = f"Bearer {settings.LLM_API_KEY}"

    body = {
        "model": settings.LLM_MODEL,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        "temperature": temperature,
        "response_format": {"type": "json_object"},
    }

    try:
        with httpx.Client(timeout=timeout or settings.LLM_TIMEOUT_SECONDS) as client:
            response = client.post(f"{base_url}/chat/completions", headers=headers, json=body)
            response.raise_for_status()
            data = response.json()
    except Exception as exc:  # noqa: BLE001 — never let an LLM outage break the caller
        logger.warning(f"LLM call failed, using fallback: {exc}")
        return fallback

    try:
        content = data["choices"][0]["message"]["content"]
        parsed = json.loads(content)
    except Exception as exc:  # noqa: BLE001
        logger.warning(f"LLM returned invalid JSON, using fallback: {exc}")
        return fallback

    if not isinstance(parsed, dict):
        logger.warning("LLM JSON response was not an object, using fallback")
        return fallback

    return parsed
