"""Integration endpoints for external systems."""

from __future__ import annotations

import hashlib
import hmac
import json
from datetime import datetime, timezone
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.auth import extract_bearer_token
from app.core.config import get_settings
from app.db.session import get_db
from app.models import CVBuilderSyncEvent, CandidateCVSubscription, CandidateProfile, Resume, ResumeTemplate, User

settings = get_settings()
router = APIRouter(prefix="/integrations/cv-builder", tags=["integrations"])


class ResumeSyncUserPayload(BaseModel):
    external_user_id: str


class ResumeSyncResumePayload(BaseModel):
    external_resume_id: str
    name: str
    slug: str
    version: int
    updated_at: str
    data: dict[str, Any]


class ResumeSyncPayload(BaseModel):
    event_id: str
    event_type: Literal["resume.created", "resume.updated", "resume.deleted"]
    occurred_at: str
    source: str
    user: ResumeSyncUserPayload
    resume: ResumeSyncResumePayload


def _parse_iso8601(value: str) -> datetime:
    try:
        normalized = value.replace("Z", "+00:00")
        parsed = datetime.fromisoformat(normalized)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid timestamp format") from exc

    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _assert_integration_auth(request: Request) -> None:
    token = extract_bearer_token(request.headers.get("Authorization"))
    allowed_tokens = {
        value for value in [settings.RESUME_BUILDER_SECRET.strip(), settings.PARVAGAS_API_KEY.strip()] if value
    }
    if not allowed_tokens:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Integration authentication is not configured",
        )
    if token not in allowed_tokens:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid integration token")


def _assert_hmac_signature(request: Request, raw_body: bytes) -> None:
    secret = settings.PARVAGAS_WEBHOOK_SECRET.strip()
    if not secret:
        return

    timestamp = request.headers.get("X-Parvagas-Timestamp", "").strip()
    signature = request.headers.get("X-Parvagas-Signature", "").strip()
    if not timestamp or not signature:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing webhook signature headers")

    try:
        timestamp_value = int(timestamp)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid webhook timestamp header") from exc

    now_ts = int(datetime.now(tz=timezone.utc).timestamp())
    if abs(now_ts - timestamp_value) > settings.PARVAGAS_WEBHOOK_TOLERANCE_SECONDS:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Webhook timestamp is stale")

    payload_to_sign = f"{timestamp}.{raw_body.decode('utf-8')}".encode("utf-8")
    expected = f"sha256={hmac.new(secret.encode('utf-8'), payload_to_sign, hashlib.sha256).hexdigest()}"
    if not hmac.compare_digest(expected, signature):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid webhook signature")


def _parse_json_list(value: str | None) -> list[Any]:
    if not value:
        return []
    try:
        parsed = json.loads(value)
    except json.JSONDecodeError:
        return []
    return parsed if isinstance(parsed, list) else []


def _ensure_candidate_profile(db: Session, user_id: str) -> CandidateProfile:
    profile = db.query(CandidateProfile).filter(CandidateProfile.user_id == user_id).first()
    if profile:
        return profile

    profile = CandidateProfile(user_id=user_id)
    db.add(profile)
    db.commit()
    db.refresh(profile)
    return profile


def _find_user_by_external_id(db: Session, external_user_id: str) -> User | None:
    return db.query(User).filter(User.id == external_user_id).first()


def _resolve_template_id(db: Session, resume_data: dict[str, Any]) -> str | None:
    metadata = resume_data.get("metadata", {})
    template_value = metadata.get("template")
    if not template_value or not isinstance(template_value, str):
        return None

    template = (
        db.query(ResumeTemplate)
        .filter((ResumeTemplate.id == template_value) | (ResumeTemplate.slug == template_value))
        .first()
    )
    return template.id if template else None


def _extract_summary(resume_data: dict[str, Any]) -> str | None:
    summary = resume_data.get("summary", {})
    if not isinstance(summary, dict):
        return None
    content = summary.get("content")
    if not isinstance(content, str):
        return None
    trimmed = content.strip()
    return trimmed or None


def _build_profile_payload(user: User, profile: CandidateProfile) -> dict[str, Any]:
    work_experience = _parse_json_list(profile.work_experience)
    education = _parse_json_list(profile.education)
    skills = _parse_json_list(profile.skills)
    languages = _parse_json_list(profile.languages)
    certifications = _parse_json_list(profile.certifications)

    links = []
    if profile.linkedin_url:
        links.append({"id": "lnk-linkedin", "network": "LinkedIn", "username": "", "url": profile.linkedin_url})
    if profile.github_url:
        links.append({"id": "lnk-github", "network": "GitHub", "username": "", "url": profile.github_url})
    if profile.portfolio_url:
        links.append({"id": "lnk-portfolio", "network": "Portfolio", "username": "", "url": profile.portfolio_url})

    return {
        "externalUserId": user.id,
        "basics": {
            "name": " ".join([part for part in [profile.first_name, profile.last_name] if part]).strip() or user.full_name,
            "email": user.email,
            "phone": profile.phone or "",
            "location": profile.location or "",
            "website": profile.portfolio_url or "",
            "linkedin": profile.linkedin_url or "",
            "github": profile.github_url or "",
            "portfolio": profile.portfolio_url or "",
        },
        "summary": profile.professional_summary or "",
        "experience": [
            {
                "id": str(item.get("id") or f"exp-{idx + 1}"),
                "company": str(item.get("company") or ""),
                "position": str(item.get("jobTitle") or item.get("position") or ""),
                "location": str(item.get("location") or ""),
                "startDate": item.get("startDate"),
                "endDate": item.get("endDate"),
                "current": bool(item.get("current", False)),
                "summary": str(item.get("summary") or item.get("description") or ""),
                "highlights": item.get("highlights") if isinstance(item.get("highlights"), list) else [],
            }
            for idx, item in enumerate(work_experience)
            if isinstance(item, dict)
        ],
        "education": [
            {
                "id": str(item.get("id") or f"edu-{idx + 1}"),
                "institution": str(item.get("school") or item.get("institution") or ""),
                "area": str(item.get("area") or ""),
                "studyType": str(item.get("degree") or item.get("studyType") or ""),
                "score": str(item.get("grade") or item.get("score") or ""),
                "startDate": item.get("startDate"),
                "endDate": item.get("endDate"),
                "current": bool(item.get("current", False)),
                "summary": str(item.get("summary") or item.get("description") or ""),
            }
            for idx, item in enumerate(education)
            if isinstance(item, dict)
        ],
        "skills": [
            {"id": f"skill-{idx + 1}", "name": str(skill), "level": 0, "keywords": []}
            for idx, skill in enumerate(skills)
            if isinstance(skill, str)
        ],
        "languages": [
            {
                "id": f"lang-{idx + 1}",
                "name": str(item.get("language") if isinstance(item, dict) else item),
                "fluency": str(item.get("fluency") if isinstance(item, dict) else ""),
            }
            for idx, item in enumerate(languages)
            if isinstance(item, (str, dict))
        ],
        "certifications": [
            {
                "id": str(item.get("id") or f"cert-{idx + 1}"),
                "name": str(item.get("name") or item.get("title") or ""),
                "issuer": str(item.get("issuer") or ""),
                "date": item.get("date"),
                "url": str(item.get("url") or item.get("website") or ""),
                "summary": str(item.get("summary") or item.get("description") or ""),
            }
            for idx, item in enumerate(certifications)
            if isinstance(item, dict)
        ],
        "projects": [],
        "links": links,
    }


def _plan_limits(plan: str) -> dict[str, Any]:
    if plan == "premium":
        return {
            "resumes": 20,
            "ai_requests_monthly": 100,
            "exports_monthly": None,
            "cover_letters": True,
            "premium_templates": True,
            "version_history": True,
        }
    if plan == "pro":
        return {
            "resumes": 10,
            "ai_requests_monthly": 60,
            "exports_monthly": 50,
            "cover_letters": True,
            "premium_templates": True,
            "version_history": False,
        }
    return {
        "resumes": 3,
        "ai_requests_monthly": 20,
        "exports_monthly": 10,
        "cover_letters": False,
        "premium_templates": False,
        "version_history": False,
    }


@router.post("/resumes/sync")
async def sync_resume_from_cv_builder(request: Request, db: Session = Depends(get_db)):
    _assert_integration_auth(request)
    raw_body = await request.body()
    _assert_hmac_signature(request, raw_body)
    payload = ResumeSyncPayload.model_validate_json(raw_body)
    if payload.source != "parvagas-cv-builder":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid source")

    event = db.query(CVBuilderSyncEvent).filter(CVBuilderSyncEvent.event_id == payload.event_id).first()
    if event:
        return {"accepted": True, "idempotent": True, "event_id": payload.event_id, "action": payload.event_type}

    event = CVBuilderSyncEvent(
        event_id=payload.event_id,
        event_type=payload.event_type,
        status="pending",
        external_user_id=payload.user.external_user_id,
        external_resume_id=payload.resume.external_resume_id,
        occurred_at=_parse_iso8601(payload.occurred_at).replace(tzinfo=None),
    )
    db.add(event)
    db.commit()
    db.refresh(event)

    user = _find_user_by_external_id(db, payload.user.external_user_id)
    if not user:
        event.status = "failed"
        event.last_error = "user_not_found"
        event.processed_at = datetime.utcnow()
        db.commit()
        return {
            "accepted": False,
            "event_id": payload.event_id,
            "resume_id": payload.resume.external_resume_id,
            "reason": "user_not_found",
        }

    profile = _ensure_candidate_profile(db, user.id)
    resume = (
        db.query(Resume)
        .filter(Resume.id == payload.resume.external_resume_id, Resume.candidate_profile_id == profile.id)
        .first()
    )

    try:
        if payload.event_type == "resume.deleted":
            if resume:
                db.delete(resume)
                db.commit()
            event.status = "processed"
            event.processed_at = datetime.utcnow()
            db.commit()
            return {
                "accepted": True,
                "event_id": payload.event_id,
                "action": payload.event_type,
                "resume_id": payload.resume.external_resume_id,
            }

        summary = _extract_summary(payload.resume.data)
        template_id = _resolve_template_id(db, payload.resume.data)
        serialized_data = json.dumps(payload.resume.data, ensure_ascii=False)

        if resume is None:
            resume = Resume(
                id=payload.resume.external_resume_id,
                candidate_profile_id=profile.id,
                title=payload.resume.name.strip() or "Curriculum Vitae",
                summary=summary,
                template_id=template_id,
                data=serialized_data,
                is_draft=False,
                is_published=True,
                share_slug=payload.resume.slug,
            )
            db.add(resume)
        else:
            resume.title = payload.resume.name.strip() or resume.title
            resume.summary = summary
            resume.template_id = template_id
            resume.data = serialized_data
            resume.is_draft = False
            resume.is_published = True
            resume.share_slug = payload.resume.slug

        db.commit()
        event.status = "processed"
        event.processed_at = datetime.utcnow()
        event.last_error = None
        db.commit()
    except Exception as exc:
        db.rollback()
        event.status = "failed"
        event.last_error = str(exc)
        event.processed_at = datetime.utcnow()
        db.commit()
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to apply sync event") from exc

    return {
        "accepted": True,
        "event_id": payload.event_id,
        "action": payload.event_type,
        "resume_id": payload.resume.external_resume_id,
        "candidate_profile_id": profile.id,
    }


@router.get("/profile")
async def get_cv_builder_profile(request: Request, db: Session = Depends(get_db)):
    _assert_integration_auth(request)
    external_user_id = request.headers.get("X-Parvagas-User-Id", "").strip()
    if not external_user_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Missing X-Parvagas-User-Id header")

    user = _find_user_by_external_id(db, external_user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    profile = _ensure_candidate_profile(db, user.id)
    return _build_profile_payload(user, profile)


@router.get("/entitlements")
async def get_cv_builder_entitlements(request: Request, db: Session = Depends(get_db)):
    _assert_integration_auth(request)
    external_user_id = request.headers.get("X-Parvagas-User-Id", "").strip()
    if not external_user_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Missing X-Parvagas-User-Id header")

    user = _find_user_by_external_id(db, external_user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    profile = _ensure_candidate_profile(db, user.id)
    subscription = (
        db.query(CandidateCVSubscription)
        .filter(CandidateCVSubscription.candidate_profile_id == profile.id)
        .order_by(CandidateCVSubscription.created_at.desc())
        .first()
    )

    if user.suspended:
        plan = subscription.plan_tier if subscription else "free"
        return {"plan": plan, "status": "suspended", "expires_at": None, "limits": _plan_limits("free")}

    now = datetime.utcnow()
    if not subscription:
        return {"plan": "free", "status": "active", "expires_at": None, "limits": _plan_limits("free")}

    is_expired = bool(subscription.current_period_end and subscription.current_period_end < now)
    if subscription.status in {"cancelled", "expired"} or is_expired:
        return {
            "plan": subscription.plan_tier,
            "status": "expired",
            "expires_at": subscription.current_period_end.isoformat() if subscription.current_period_end else None,
            "limits": _plan_limits("free"),
        }

    if subscription.status == "pending":
        return {
            "plan": subscription.plan_tier,
            "status": "pending",
            "expires_at": subscription.current_period_end.isoformat() if subscription.current_period_end else None,
            "limits": _plan_limits("free"),
        }

    plan = subscription.plan_tier if subscription.plan_tier in {"free", "pro", "premium"} else "free"
    return {
        "plan": plan,
        "status": "active",
        "expires_at": subscription.current_period_end.isoformat() if subscription.current_period_end else None,
        "limits": _plan_limits(plan),
    }
