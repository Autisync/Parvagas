"""API v1 routes."""
from fastapi import APIRouter
from app.api.v1 import admin, ads, auth, candidates, companies, cv, events, health, notifications

router = APIRouter(prefix="/api/v1")

# Health routes
router.include_router(health.router)

# Auth routes
router.include_router(auth.router)

# Candidate routes
router.include_router(candidates.router)

# Company routes
router.include_router(companies.router)

# CV routes
router.include_router(cv.router)

# Events routes
router.include_router(events.router)

# Admin routes
router.include_router(admin.router)

# Public ads routes
router.include_router(ads.router)

# Notification routes
router.include_router(notifications.router)
