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
import contextlib
import json

import httpx

from app.core.config import get_settings
from app.core.logging import get_logger

logger = get_logger(__name__)
settings = get_settings()

_OLLAMA_INFLIGHT_KEY = "ollama:inflight_requests"
_OLLAMA_INFLIGHT_SAFETY_TTL_SECONDS = 30  # >= OLLAMA_TIMEOUT_SECONDS headroom


@contextlib.contextmanager
def ollama_concurrency_guard():
    """Soft cap on requests in flight to the self-hosted Ollama container,
    shared across every Gunicorn worker via a Redis counter (a per-process
    limiter wouldn't coordinate across WEB_CONCURRENCY workers hitting the
    same container). Yields True if the caller has a slot and should
    proceed, False if the cap is already full and the caller should fall
    back immediately rather than queue behind an already-saturated model.

    Fails open on any Redis problem (never blocks a call over caching
    infra), and the counter carries a short TTL as a safety net so a worker
    that crashes mid-call can't permanently leak a slot.
    """
    if settings.OLLAMA_MAX_CONCURRENT <= 0:
        yield True
        return

    client = None
    acquired = False
    try:
        import redis as _redis

        client = _redis.Redis.from_url(settings.REDIS_URL, socket_timeout=2)
        current = client.incr(_OLLAMA_INFLIGHT_KEY)
        client.expire(_OLLAMA_INFLIGHT_KEY, _OLLAMA_INFLIGHT_SAFETY_TTL_SECONDS)
        if current <= settings.OLLAMA_MAX_CONCURRENT:
            acquired = True
        else:
            client.decr(_OLLAMA_INFLIGHT_KEY)
    except Exception as exc:  # noqa: BLE001
        logger.debug("Ollama concurrency guard skipped: %s", exc)
        yield True
        return

    try:
        yield acquired
    finally:
        if acquired:
            try:
                client.decr(_OLLAMA_INFLIGHT_KEY)
            except Exception:  # noqa: BLE001
                pass


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


def chat_json_request(
    url: str,
    headers: dict,
    body: dict,
    *,
    fallback: dict,
    timeout: float,
) -> dict:
    """Low-level sibling of chat_json for callers that assemble their own
    endpoint config (e.g. ResumeAIService's per-tier providers — Azure's
    deployment-path URLs don't fit a simple base_url join). Same contract:
    POSTs an OpenAI-style chat body, parses choices[0].message.content as a
    JSON object, and returns `fallback` untouched on ANY failure. This is
    the single HTTP path every LLM feature goes through (plan C1)."""
    try:
        with httpx.Client(timeout=timeout) as client:
            response = client.post(url, headers=headers, json=body)
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

    is_ollama = settings.LLM_PROVIDER.strip().lower() == "ollama"
    if not is_ollama:
        return chat_json_request(
            f"{base_url}/chat/completions",
            headers,
            body,
            fallback=fallback,
            timeout=timeout or settings.LLM_TIMEOUT_SECONDS,
        )

    with ollama_concurrency_guard() as has_slot:
        if not has_slot:
            logger.info("Ollama at capacity (OLLAMA_MAX_CONCURRENT), returning fallback without calling it")
            return fallback
        return chat_json_request(
            f"{base_url}/chat/completions",
            headers,
            body,
            fallback=fallback,
            timeout=timeout or settings.LLM_TIMEOUT_SECONDS,
        )
