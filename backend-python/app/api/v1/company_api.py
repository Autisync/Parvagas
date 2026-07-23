"""Company external-integration surface (overnight-audit W5.4) — a scoped
API key a company can generate to pull its own applications
programmatically (ATS/HRIS sync), instead of re-keying data by hand.
Key management (create/list/revoke) is JWT-authenticated, owner-only,
from the portal; the applications feed itself is authenticated by the
API key, not a JWT — consumed by external systems, not the browser.
"""
from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.api.v1.applications import _job_titles_for, _pagination, _serialize_application, _skills_for_candidates
from app.core.api_key_auth import generate_api_key, get_company_from_api_key, hash_api_key
from app.core.observability import limiter, rate_limit_key_by_api_key
from app.db.session import get_db
from app.models import ApiKey, Company, JobApplication, User
from app.services.company_access_service import require_role, resolve_company_for_user
from app.services.company_billing_service import assert_api_access

router = APIRouter(prefix="/company-api", tags=["company-api"])

_MAX_ACTIVE_KEYS = 5


def _serialize_api_key(key: ApiKey) -> dict[str, Any]:
    return {
        "_id": key.id,
        "label": key.label,
        "keyPrefix": key.key_prefix,
        "createdAt": key.created_at.isoformat() if key.created_at else None,
        "lastUsedAt": key.last_used_at.isoformat() if key.last_used_at else None,
        "revokedAt": key.revoked_at.isoformat() if key.revoked_at else None,
    }


@router.post("/keys")
async def create_api_key(
    payload: dict[str, Any],
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    company = resolve_company_for_user(db, current_user)
    require_role(db, current_user, company, {"owner"})
    assert_api_access(db, company)

    active_count = (
        db.query(ApiKey)
        .filter(ApiKey.company_id == company.id, ApiKey.revoked_at.is_(None))
        .count()
    )
    if active_count >= _MAX_ACTIVE_KEYS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Limite de {_MAX_ACTIVE_KEYS} chaves API ativas atingido. Revogue uma chave existente antes de criar uma nova.",
        )

    label = str(payload.get("label") or "").strip() or None
    raw_key = generate_api_key()
    api_key = ApiKey(
        company_id=company.id,
        label=label,
        key_prefix=raw_key[:12],
        key_hash=hash_api_key(raw_key),
        created_by_user_id=current_user.id,
    )
    db.add(api_key)
    db.commit()
    db.refresh(api_key)

    return {"apiKey": _serialize_api_key(api_key), "rawKey": raw_key}


@router.get("/keys")
async def list_api_keys(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    company = resolve_company_for_user(db, current_user)
    require_role(db, current_user, company, {"owner"})

    keys = (
        db.query(ApiKey)
        .filter(ApiKey.company_id == company.id)
        .order_by(ApiKey.created_at.desc())
        .all()
    )
    return {"apiKeys": [_serialize_api_key(k) for k in keys]}


@router.delete("/keys/{key_id}")
async def revoke_api_key(
    key_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    company = resolve_company_for_user(db, current_user)
    require_role(db, current_user, company, {"owner"})

    api_key = (
        db.query(ApiKey)
        .filter(ApiKey.id == key_id, ApiKey.company_id == company.id, ApiKey.revoked_at.is_(None))
        .first()
    )
    if not api_key:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Chave API não encontrada")

    api_key.revoked_at = datetime.utcnow()
    db.commit()
    return {"apiKey": _serialize_api_key(api_key)}


@router.get("/applications")
@limiter.limit("60/minute", key_func=rate_limit_key_by_api_key)
async def list_applications_via_api_key(
    request: Request,
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1, le=100),
    jobId: Optional[str] = None,
    status_filter: Optional[str] = Query(default=None, alias="status"),
    since: Optional[str] = None,
    db: Session = Depends(get_db),
    company: Company = Depends(get_company_from_api_key),
):
    query = db.query(JobApplication).filter(JobApplication.company_id == company.id)
    if jobId:
        query = query.filter(JobApplication.job_id == jobId)
    if status_filter:
        query = query.filter(JobApplication.status == status_filter)
    if since:
        try:
            since_dt = datetime.fromisoformat(since)
        except ValueError:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Parâmetro 'since' inválido — use formato ISO-8601")
        query = query.filter(JobApplication.created_at >= since_dt)

    total = query.count()
    items = (
        query.order_by(JobApplication.created_at.desc())
        .offset((page - 1) * limit)
        .limit(limit)
        .all()
    )
    titles = _job_titles_for(db, [item.job_id for item in items])
    skills = _skills_for_candidates(db, [item.candidate_user_id for item in items if item.candidate_user_id])

    pagination = _pagination(page, limit, total)
    return {
        "applications": [
            _serialize_application(item, job_title=titles.get(item.job_id), skills=skills.get(item.candidate_user_id))
            for item in items
        ],
        **pagination,
        "pagination": pagination,
    }
