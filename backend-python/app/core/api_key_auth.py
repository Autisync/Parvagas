"""API-key authentication for the company applications feed (W5.4) — a
separate, opt-in dependency rather than an extension of the global JWT
middleware (app.main.attach_auth_context), since it's a fundamentally
different credential shape used by only a handful of external
integrations, not every request in the app.
"""
from __future__ import annotations

import secrets
from datetime import datetime

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.core.security import hash_token
from app.db.session import get_db
from app.models import ApiKey, Company
from app.services.company_billing_service import assert_api_access

API_KEY_HEADER = "X-API-Key"
API_KEY_PREFIX = "pgv_"


def generate_api_key() -> str:
    return f"{API_KEY_PREFIX}{secrets.token_urlsafe(32)}"


def hash_api_key(raw_key: str) -> str:
    return hash_token(raw_key)


def get_company_from_api_key(request: Request, db: Session = Depends(get_db)) -> Company:
    raw_key = request.headers.get(API_KEY_HEADER)
    if not raw_key:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Chave API em falta")

    key_hash = hash_api_key(raw_key)
    api_key = db.query(ApiKey).filter(ApiKey.key_hash == key_hash, ApiKey.revoked_at.is_(None)).first()
    if not api_key:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Chave API inválida")

    company = db.query(Company).filter(Company.id == api_key.company_id).first()
    if not company or company.status != "active":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Chave API inválida")

    assert_api_access(db, company)

    api_key.last_used_at = datetime.utcnow()
    db.commit()

    return company
