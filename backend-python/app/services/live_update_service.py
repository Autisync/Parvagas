"""Broadcasts "something changed, refetch" signals to connected portal tabs.

The frontend already has a fully-wired consumer for this
(src/app/components/LiveUpdateBridge.tsx, an EventSource against
/events/stream that invalidates the relevant react-query cache on an
"invalidate" event) — it was just never fed real events, only a
keep-alive heartbeat. This is the publish side: call publish_invalidate()
from a mutation that other users' open tabs might care about (an
application's status changed, a new applicant arrived, a message was
sent) and every connected client re-evaluates whether it applies to
what they're currently looking at.

Redis pub/sub, not an in-process queue: the API runs under multiple
Gunicorn/uvicorn workers (and multiple container replicas in prod), each
with its own event loop — an in-process broadcast would only reach
clients connected to the same worker that published it. Redis is already
a hard dependency here (Celery broker/result backend, websocket_app.py's
own pub/sub), so this reuses infrastructure rather than adding new.

Best-effort throughout, matching notification_service.create_notification's
own contract: a Redis hiccup must never fail the request that triggered
it, so every call site can fire this fire-and-forget right after the
state change it describes.
"""
from __future__ import annotations

import json
from datetime import datetime, timezone

import redis

from app.core.config import get_settings
from app.core.logging import get_logger

logger = get_logger(__name__)

LIVE_UPDATE_CHANNEL = "parvagas:live-updates"

_client: redis.Redis | None = None
_client_failed = False


def _get_client() -> redis.Redis | None:
    global _client, _client_failed
    if _client is not None:
        return _client
    if _client_failed:
        return None
    try:
        settings = get_settings()
        _client = redis.Redis.from_url(settings.REDIS_URL, socket_timeout=1, socket_connect_timeout=1)
        return _client
    except Exception as exc:  # pragma: no cover - defensive
        _client_failed = True
        logger.warning("live_update_service: redis client init failed: %s", exc)
        return None


def publish_invalidate(scope: str, *, entity: str | None = None, action: str | None = None, path: str | None = None) -> None:
    """Tell every connected tab that `scope` data changed.

    `scope` matches LiveUpdateBridge.scopesForPath() on the frontend
    (e.g. "applications", "jobs", "companies", "users", "candidates",
    "admin") — a connected client only acts on it if the scope is
    relevant to the page it's currently on.
    """
    client = _get_client()
    if client is None:
        return
    payload = {
        "scope": scope,
        "entity": entity,
        "action": action,
        "path": path,
        "ts": datetime.now(timezone.utc).isoformat(),
    }
    try:
        client.publish(LIVE_UPDATE_CHANNEL, json.dumps(payload))
    except Exception as exc:  # pragma: no cover - defensive
        logger.warning("publish_invalidate failed (scope=%s): %s", scope, exc)
