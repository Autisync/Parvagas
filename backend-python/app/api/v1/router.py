"""API v1 routes."""
from fastapi import APIRouter
from app.api.v1 import admin, ads, applications, auth, ats, candidates, companies, cv, events, health, jobs, newsletter, notifications, payments, resumes

router = APIRouter(prefix="/api/v1")

# Health routes
router.include_router(health.router)

# Auth routes
router.include_router(auth.router)

# Public job routes
router.include_router(jobs.router)

# Candidate routes
router.include_router(candidates.router)

# Resume routes
router.include_router(resumes.router)

# Application routes
router.include_router(applications.router)

# ATS routes
router.include_router(ats.router)

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

# Public newsletter signup
router.include_router(newsletter.router)

# Notification routes
router.include_router(notifications.router)

# Monetization / payments routes
router.include_router(payments.router)
