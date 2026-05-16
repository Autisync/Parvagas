"""Server-sent events endpoints for lightweight live updates."""
import asyncio
from datetime import datetime
from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse

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
