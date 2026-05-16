"""Main FastAPI application."""
from datetime import datetime
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import time
import uuid
from app.core.config import get_settings
from app.core.logging import setup_logging, get_logger
from app.api.v1.router import router as v1_router
from app.db.session import engine
from app.db.base import Base

# Setup logging
setup_logging()
logger = get_logger(__name__)

# Settings
settings = get_settings()

# Create tables
Base.metadata.create_all(bind=engine)

# Create FastAPI app
app = FastAPI(
    title="Parvagas Backend",
    description="Python/FastAPI backend for Parvagas",
    version="1.0.0"
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.CORS_ORIGIN, settings.FRONTEND_URL],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Request ID middleware
@app.middleware("http")
async def add_request_id(request: Request, call_next):
    """Add request ID to all requests."""
    request_id = str(uuid.uuid4())
    request.state.request_id = request_id
    
    start_time = time.time()
    response = await call_next(request)
    process_time = time.time() - start_time
    
    response.headers["X-Request-ID"] = request_id
    response.headers["X-Process-Time"] = str(process_time)
    
    return response


# Include routers
app.include_router(v1_router)


@app.get("/health")
async def root_health_check():
    """Compatibility health check endpoint used by Docker and external probes."""
    return {
        "status": "ok",
        "timestamp": datetime.utcnow().isoformat()
    }


@app.get("/ready")
async def root_ready_check():
    """Compatibility readiness endpoint used by deployment checks."""
    return {
        "status": "ready",
        "timestamp": datetime.utcnow().isoformat()
    }


# Global error handler
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Global exception handler."""
    request_id = getattr(request.state, "request_id", "unknown")
    logger.error(f"Unhandled exception [{request_id}]: {str(exc)}")
    
    return JSONResponse(
        status_code=500,
        content={
            "detail": "Internal server error",
            "request_id": request_id
        }
    )


# Startup event
@app.on_event("startup")
async def startup_event():
    """Run on startup."""
    logger.info("Parvagas backend started")
    logger.info(f"Environment: {settings.APP_ENV}")
    logger.info(f"Debug: {settings.DEBUG}")


# Shutdown event
@app.on_event("shutdown")
async def shutdown_event():
    """Run on shutdown."""
    logger.info("Parvagas backend shutting down")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=settings.PORT,
        reload=settings.DEBUG
    )
