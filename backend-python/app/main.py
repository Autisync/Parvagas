"""Main FastAPI application."""
from contextlib import asynccontextmanager
from datetime import datetime, timezone
import time
import uuid

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.responses import JSONResponse
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from sqlalchemy import text

from app.core.config import get_settings
from app.core.auth import extract_bearer_token, validate_token
from app.core.logging import setup_logging, get_logger
from app.core.observability import limiter, init_sentry
from app.api.v1.router import router as v1_router
from app.db.session import engine

# Setup logging
setup_logging()
logger = get_logger(__name__)

# Settings
settings = get_settings()

# Initialise error monitoring as early as possible.
init_sentry()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan: startup and shutdown hooks.

    Schema is owned by Alembic migrations (run by the container entrypoint),
    NOT by create_all(). See docs/adr/ADR-001.
    """
    logger.info("Parvagas backend started")
    logger.info("Environment: %s", settings.APP_ENV)
    logger.info("Debug: %s", settings.DEBUG)
    yield
    logger.info("Parvagas backend shutting down")


# Create FastAPI app
app = FastAPI(
    title="Parvagas Backend",
    description="Python/FastAPI backend for Parvagas",
    version="1.0.0",
    lifespan=lifespan,
    # Hide interactive docs in production.
    docs_url=None if settings.is_production else "/docs",
    redoc_url=None if settings.is_production else "/redoc",
    openapi_url=None if settings.is_production else "/openapi.json",
)

# Rate limiting (slowapi)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# Trusted hosts (skip when "*").
_trusted = [h.strip() for h in settings.TRUSTED_HOSTS.split(",") if h.strip()]
if _trusted and _trusted != ["*"]:
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=_trusted)

# CORS middleware
# Allow multiple origins (comma-separated) from CORS_ORIGIN + FRONTEND_URL,
# e.g. "https://parvagas.pt,https://www.parvagas.pt".
_allowed_origins = sorted({
    origin.strip()
    for source in (settings.CORS_ORIGIN, settings.FRONTEND_URL)
    for origin in (source or "").split(",")
    if origin.strip()
})
app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Request-ID", "X-Captcha-Token"],
)


@app.middleware("http")
async def add_request_id(request: Request, call_next):
    """Attach a request id, timing, and baseline security headers."""
    request_id = str(uuid.uuid4())
    request.state.request_id = request_id

    start_time = time.time()
    response = await call_next(request)
    process_time = time.time() - start_time

    response.headers["X-Request-ID"] = request_id
    response.headers["X-Process-Time"] = str(process_time)

    # Security headers
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
    if settings.is_production:
        response.headers.setdefault(
            "Strict-Transport-Security", "max-age=31536000; includeSubDomains"
        )

    return response


@app.middleware("http")
async def attach_auth_context(request: Request, call_next):
    """Attach token claims to request.state for protected endpoints."""
    request.state.auth_claims = None
    request.state.auth_error = None

    authorization = request.headers.get("Authorization")
    token = extract_bearer_token(authorization)

    if token:
        claims, auth_error = validate_token(token)
        request.state.auth_claims = claims
        request.state.auth_error = auth_error

    return await call_next(request)


# Include routers
app.include_router(v1_router)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


@app.get("/health")
async def root_health_check():
    """Liveness probe — process is up. Does not touch dependencies."""
    return {"status": "ok", "timestamp": _now_iso()}


@app.get("/ready")
async def root_ready_check():
    """Readiness probe — verifies critical dependencies are reachable."""
    checks: dict[str, str] = {}
    healthy = True

    # Database
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        checks["database"] = "ok"
    except Exception as exc:
        checks["database"] = f"error: {exc}"
        healthy = False

    # Redis (best-effort; only fails readiness if unreachable)
    try:
        import redis

        client = redis.from_url(settings.REDIS_URL, socket_connect_timeout=2)
        client.ping()
        checks["redis"] = "ok"
    except Exception as exc:
        checks["redis"] = f"error: {exc}"
        healthy = False

    status_code = 200 if healthy else 503
    return JSONResponse(
        status_code=status_code,
        content={
            "status": "ready" if healthy else "not_ready",
            "checks": checks,
            "timestamp": _now_iso(),
        },
    )


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Global exception handler — never leak internals to clients."""
    request_id = getattr(request.state, "request_id", "unknown")
    logger.error("Unhandled exception [%s]: %s", request_id, str(exc), exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error", "request_id": request_id},
    )


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=settings.PORT, reload=settings.DEBUG)
