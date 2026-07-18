"""Server-sent events endpoints for lightweight live updates, plus the
public client-error ingestion endpoint used by src/lib/errorMonitoring.ts."""
import asyncio
import json
from datetime import datetime
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.observability import limiter
from app.db.session import get_db
from app.models import ClientErrorLog

router = APIRouter(prefix="/events", tags=["events"])


def _sse(event: str, data: str) -> str:
    return f"event: {event}\ndata: {data}\n\n"


@router.get("/stream")
async def stream_events(request: Request):
    """Open an SSE stream used by the frontend live update bridge.

    For now we only emit keep-alive and connected signals so clients stay healthy
    without 404 noise while richer invalidation events are introduced.
    """

    async def event_generator():
        yield _sse("connected", '{"status":"ok"}')

        while True:
            if await request.is_disconnected():
                break

            # Keep the connection alive for proxies and browser EventSource.
            heartbeat = '{"ts":"%s"}' % datetime.utcnow().isoformat()
            yield _sse("heartbeat", heartbeat)
            await asyncio.sleep(25)

    response = StreamingResponse(event_generator(), media_type="text/event-stream")
    response.headers["Cache-Control"] = "no-cache"
    response.headers["Connection"] = "keep-alive"
    response.headers["X-Accel-Buffering"] = "no"
    return response


# ── Client-error ingestion — public, unauthenticated by necessity (a frontend
# error can fire before/without a user session) ─────────────────────────────
#
# Hardening, since this is the one net-new public-facing write surface:
#   - Rate-limited (20/minute) — generous for a real error burst on one
#     client, tight enough to block sustained abuse.
#   - Field allowlist via the Pydantic model below — anything else in the
#     request body is silently dropped, never stored (Pydantic's default
#     extra="ignore").
#   - Oversized strings are TRUNCATED, not rejected — a legitimate large
#     stack trace shouldn't 400 and get silently lost, but also can't be
#     used to grow a row past a fixed bound. Truncation happens in this
#     handler (not via Pydantic max_length, which would reject) and the
#     DB columns are sized to match, so this holds even if a future ORM
#     bypasses this handler.
#   - `details`, if present, must already be JSON-serializable (it arrived
#     that way — it was parsed out of a JSON request body) and is re-dumped
#     + truncated; a body that somehow fails this is rejected (400), not
#     silently coerced.
#   - The response is a bare {"ok": true} — it never echoes back any
#     submitted field, closing the reflected-XSS angle at the response
#     layer. The stored-XSS angle is closed on the read side: the admin
#     panel renders these fields as plain text only, never
#     dangerouslySetInnerHTML.
#   - No IP/UA-based trust or auth decision is ever made from this table —
#     it's monitoring, not a security control. Flooding it can pollute the
#     error dashboard but can't be used to escalate or touch unrelated data.
#   - CORS is whatever the app's global CORSMiddleware allows (scoped to
#     the known frontend origin(s), not "*") — this endpoint doesn't get or
#     need a wider policy than the rest of the API.

class ClientErrorPayload(BaseModel):
    level: Literal["warning", "error", "critical"]
    message: str
    path: str | None = None
    details: Any | None = None


@router.post("/client-errors")
@limiter.limit("20/minute")
async def report_client_error(request: Request, payload: ClientErrorPayload, db: Session = Depends(get_db)):
    details_json = None
    if payload.details is not None:
        try:
            details_json = json.dumps(payload.details)[:1000]
        except (TypeError, ValueError):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="details must be JSON-serializable")

    try:
        db.add(ClientErrorLog(
            level=payload.level,
            message=(payload.message or "")[:500],
            path=(payload.path or "")[:300] or None,
            details=details_json,
            user_agent=(request.headers.get("user-agent") or "")[:400] or None,
            ip_address=(request.client.host if request.client else None),
        ))
        db.commit()
    except Exception:
        db.rollback()
        # Never let a storage hiccup surface as a failed request — the
        # frontend fires this fire-and-forget on its own error path.

    return {"ok": True}
