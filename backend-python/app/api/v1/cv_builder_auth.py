"""Secure Parvagas -> CV Builder launch and exchange endpoints."""

import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from urllib.parse import urljoin, urlparse

from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.config import get_settings
from app.core.observability import limiter
from app.db.session import get_db
from app.models import CVBuilderAuthCode, CandidateCVSubscription, CandidateProfile, User, UserRole

settings = get_settings()
router = APIRouter(prefix="/cv-builder", tags=["cv-builder-auth"])


class CVBuilderLaunchRequest(BaseModel):
    return_url: str | None = None
    target_resume_id: str | None = None
    nonce: str | None = None


class CVBuilderLaunchResponse(BaseModel):
    launch_url: str
    expires_in_seconds: int


class CVBuilderExchangeRequest(BaseModel):
    code: str = Field(min_length=12, max_length=512)


class CVBuilderExchangeResponse(BaseModel):
    sub: str
    email: str
    name: str
    avatar_url: str | None = None
    locale: str = "pt"
    plan: str
    return_url: str
    nonce: str
    target_resume_id: str | None = None


def _hash_code(raw_code: str) -> str:
    return hashlib.sha256(raw_code.encode("utf-8")).hexdigest()


def _parse_origin_allowlist(csv: str) -> set[str]:
    values = set()
    for item in (csv or "").split(","):
        value = item.strip()
        if not value:
            continue
        parsed = urlparse(value)
        if parsed.scheme not in {"http", "https"} or not parsed.netloc:
            continue
        values.add(f"{parsed.scheme}://{parsed.netloc}".lower())
    return values


def _ensure_allowed_cv_builder_origin() -> str:
    cv_builder_url = (settings.CV_BUILDER_URL or "").strip() or (settings.RESUME_BUILDER_URL or "").strip()
    if not cv_builder_url:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="CV Builder URL is not configured",
        )

    parsed = urlparse(cv_builder_url)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="CV Builder URL is invalid",
        )

    cv_builder_origin = f"{parsed.scheme}://{parsed.netloc}".lower()
    allowed_origins = _parse_origin_allowlist(settings.CV_BUILDER_ALLOWED_RETURN_ORIGINS)
    if allowed_origins and cv_builder_origin not in allowed_origins:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="CV Builder origin is not allowed",
        )

    return cv_builder_url.rstrip("/")


def _default_candidate_return_url() -> str:
    base = (settings.FRONTEND_URL or "").strip().rstrip("/")
    if not base:
        base = "http://localhost:3000"
    return f"{base}/Portal/Candidato/CV-e-Documentos"


def _validate_candidate_return_url(value: str | None) -> str:
    candidate_return_url = (value or "").strip() or _default_candidate_return_url()
    parsed = urlparse(candidate_return_url)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid return_url")

    frontend_url = (settings.FRONTEND_URL or "").strip()
    allowed = set()
    if frontend_url:
        parsed_frontend = urlparse(frontend_url)
        if parsed_frontend.scheme in {"http", "https"} and parsed_frontend.netloc:
            allowed.add(f"{parsed_frontend.scheme}://{parsed_frontend.netloc}".lower())

    if allowed:
        req_origin = f"{parsed.scheme}://{parsed.netloc}".lower()
        if req_origin not in allowed:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="return_url origin is not allowed")

    return candidate_return_url


def _get_candidate_plan(db: Session, user_id: str) -> str:
    profile = db.query(CandidateProfile).filter(CandidateProfile.user_id == user_id).first()
    if not profile:
        return "free"

    sub = (
        db.query(CandidateCVSubscription)
        .filter(CandidateCVSubscription.candidate_profile_id == profile.id)
        .order_by(CandidateCVSubscription.created_at.desc())
        .first()
    )
    if not sub or sub.status != "active":
        return "free"
    return str(sub.plan_tier or "free")


@router.post("/session", response_model=CVBuilderLaunchResponse)
@limiter.limit("10/minute")
async def create_cv_builder_session(
    request: Request,
    payload: CVBuilderLaunchRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role != UserRole.candidate:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only candidate accounts can launch CV Builder")

    if not current_user.email:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Candidate account email is required")

    cv_builder_base = _ensure_allowed_cv_builder_origin()
    return_url = _validate_candidate_return_url(payload.return_url)

    ttl = max(60, min(int(settings.CV_BUILDER_CODE_TTL_SECONDS or 90), 120))
    raw_code = secrets.token_urlsafe(48)
    nonce = (payload.nonce or "").strip() or secrets.token_urlsafe(16)

    record = CVBuilderAuthCode(
        code_hash=_hash_code(raw_code),
        audience="cv-builder",
        user_id=current_user.id,
        nonce=nonce,
        return_url=return_url,
        target_resume_id=(payload.target_resume_id or "").strip() or None,
        expires_at=datetime.utcnow() + timedelta(seconds=ttl),
    )
    db.add(record)
    db.commit()

    launch_url = f"{cv_builder_base}/auth/parvagas/exchange?code={raw_code}"
    return CVBuilderLaunchResponse(launch_url=launch_url, expires_in_seconds=ttl)


@router.post("/exchange", response_model=CVBuilderExchangeResponse)
@limiter.limit("60/minute")
async def exchange_cv_builder_code(
    request: Request,
    payload: CVBuilderExchangeRequest,
    db: Session = Depends(get_db),
    x_cv_builder_key: str | None = Header(default=None, alias="X-CV-Builder-Key"),
):
    expected_secret = (settings.CV_BUILDER_SERVER_SECRET or "").strip()
    if not expected_secret:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="CV Builder server secret is not configured")
    if (x_cv_builder_key or "").strip() != expected_secret:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid CV Builder server key")

    now = datetime.utcnow()
    hashed = _hash_code(payload.code)

    # Row-level lock keeps one-time code usage atomic under concurrent requests.
    record = (
        db.query(CVBuilderAuthCode)
        .filter(CVBuilderAuthCode.code_hash == hashed)
        .with_for_update()
        .first()
    )
    if not record:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or unknown authorization code")

    if record.audience != "cv-builder":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Wrong authorization audience")
    if record.used_at is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Authorization code already used")
    if record.expires_at <= now:
        raise HTTPException(status_code=status.HTTP_410_GONE, detail="Authorization code expired")

    user = db.query(User).filter(User.id == record.user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    if user.suspended:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Candidate account is disabled")
    if not user.email:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Candidate account email is required")

    record.used_at = now
    db.commit()

    response = CVBuilderExchangeResponse(
        sub=user.id,
        email=user.email,
        name=user.full_name,
        avatar_url=None,
        locale="pt",
        plan=_get_candidate_plan(db, user.id),
        return_url=record.return_url,
        nonce=record.nonce,
        target_resume_id=record.target_resume_id,
    )
    return response
