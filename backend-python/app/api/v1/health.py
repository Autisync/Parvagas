"""Health check endpoints."""
from fastapi import APIRouter, HTTPException
from datetime import datetime
from app.schemas import HealthResponse

router = APIRouter(tags=["health"])


@router.get("/health", response_model=HealthResponse)
async def health_check():
    """Health check endpoint."""
    return {
        "status": "ok",
        "timestamp": datetime.utcnow().isoformat()
    }


@router.get("/ready", response_model=HealthResponse)
async def ready_check():
    """Readiness check endpoint."""
    return {
        "status": "ready",
        "timestamp": datetime.utcnow().isoformat()
    }
