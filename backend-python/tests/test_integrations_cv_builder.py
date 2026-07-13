import hashlib
import hmac
import json
from datetime import datetime, timezone

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.api.v1.integrations import router, settings
from app.db.base import Base
from app.db.session import get_db
from app.models import CandidateProfile, CandidateCVSubscription, Resume, User, UserRole


def _make_client_with_db():
    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()

    app = FastAPI()
    app.include_router(router, prefix="/api/v1")

    def _override_get_db():
        try:
            yield session
        finally:
            pass

    app.dependency_overrides[get_db] = _override_get_db
    return TestClient(app), session


def _sign_payload(payload: dict, timestamp: int) -> str:
    raw = json.dumps(payload, separators=(",", ":"))
    digest = hmac.new(
        settings.PARVAGAS_WEBHOOK_SECRET.encode("utf-8"),
        f"{timestamp}.{raw}".encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
    return raw, f"sha256={digest}"


def test_sync_endpoint_accepts_signed_event_and_is_idempotent(monkeypatch):
    monkeypatch.setattr(settings, "RESUME_BUILDER_SECRET", "integration-secret")
    monkeypatch.setattr(settings, "PARVAGAS_WEBHOOK_SECRET", "webhook-secret")
    monkeypatch.setattr(settings, "PARVAGAS_WEBHOOK_TOLERANCE_SECONDS", 300)
    monkeypatch.setattr(settings, "PARVAGAS_API_KEY", "")

    client, db = _make_client_with_db()
    user = User(id="user-123", email="user@parvagas.pt", full_name="User", password_hash="x", role=UserRole.candidate)
    db.add(user)
    db.add(CandidateProfile(user_id=user.id))
    db.commit()

    payload = {
        "event_id": "event-1",
        "event_type": "resume.created",
        "occurred_at": "2026-07-12T20:00:00Z",
        "source": "parvagas-cv-builder",
        "user": {"external_user_id": user.id},
        "resume": {
            "external_resume_id": "resume-1",
            "name": "CV Principal",
            "slug": "cv-principal",
            "version": 1,
            "updated_at": "2026-07-12T20:00:00Z",
            "data": {"summary": {"content": "Resumo"}},
        },
    }
    timestamp = int(datetime.now(tz=timezone.utc).timestamp())
    raw, signature = _sign_payload(payload, timestamp)

    headers = {
        "Authorization": "Bearer integration-secret",
        "X-Parvagas-Timestamp": str(timestamp),
        "X-Parvagas-Signature": signature,
        "Content-Type": "application/json",
    }

    first = client.post("/api/v1/integrations/cv-builder/resumes/sync", headers=headers, data=raw)
    assert first.status_code == 200
    assert first.json()["accepted"] is True

    second = client.post("/api/v1/integrations/cv-builder/resumes/sync", headers=headers, data=raw)
    assert second.status_code == 200
    assert second.json()["idempotent"] is True

    stored_resume = db.query(Resume).filter(Resume.id == "resume-1").first()
    assert stored_resume is not None
    assert stored_resume.title == "CV Principal"


def test_sync_endpoint_rejects_stale_timestamp(monkeypatch):
    monkeypatch.setattr(settings, "RESUME_BUILDER_SECRET", "integration-secret")
    monkeypatch.setattr(settings, "PARVAGAS_WEBHOOK_SECRET", "webhook-secret")
    monkeypatch.setattr(settings, "PARVAGAS_WEBHOOK_TOLERANCE_SECONDS", 1)
    monkeypatch.setattr(settings, "PARVAGAS_API_KEY", "")

    client, db = _make_client_with_db()
    user = User(id="user-124", email="u2@parvagas.pt", full_name="User", password_hash="x", role=UserRole.candidate)
    db.add(user)
    db.commit()

    payload = {
        "event_id": "event-2",
        "event_type": "resume.deleted",
        "occurred_at": "2026-07-12T20:00:00Z",
        "source": "parvagas-cv-builder",
        "user": {"external_user_id": user.id},
        "resume": {
            "external_resume_id": "resume-2",
            "name": "CV",
            "slug": "cv",
            "version": 2,
            "updated_at": "2026-07-12T20:00:00Z",
            "data": {},
        },
    }
    timestamp = int(datetime.now(tz=timezone.utc).timestamp()) - 600
    raw, signature = _sign_payload(payload, timestamp)

    response = client.post(
        "/api/v1/integrations/cv-builder/resumes/sync",
        headers={
            "Authorization": "Bearer integration-secret",
            "X-Parvagas-Timestamp": str(timestamp),
            "X-Parvagas-Signature": signature,
            "Content-Type": "application/json",
        },
        data=raw,
    )
    assert response.status_code == 401


def test_entitlements_and_profile_endpoints(monkeypatch):
    monkeypatch.setattr(settings, "RESUME_BUILDER_SECRET", "integration-secret")
    monkeypatch.setattr(settings, "PARVAGAS_WEBHOOK_SECRET", "")
    monkeypatch.setattr(settings, "PARVAGAS_API_KEY", "")

    client, db = _make_client_with_db()
    user = User(id="user-200", email="user200@parvagas.pt", full_name="Ana Silva", password_hash="x", role=UserRole.candidate)
    db.add(user)
    db.flush()
    profile = CandidateProfile(
        user_id=user.id,
        first_name="Ana",
        last_name="Silva",
        professional_summary="Resumo",
        skills=json.dumps(["Gestão", "Comunicação"]),
    )
    db.add(profile)
    db.flush()
    db.add(CandidateCVSubscription(candidate_profile_id=profile.id, plan_tier="premium", status="active"))
    db.commit()

    headers = {
        "Authorization": "Bearer integration-secret",
        "X-Parvagas-User-Id": user.id,
    }

    entitlements = client.get("/api/v1/integrations/cv-builder/entitlements", headers=headers)
    assert entitlements.status_code == 200
    assert entitlements.json()["plan"] == "premium"
    assert entitlements.json()["limits"]["premium_templates"] is True

    profile_res = client.get("/api/v1/integrations/cv-builder/profile", headers=headers)
    assert profile_res.status_code == 200
    assert profile_res.json()["externalUserId"] == user.id
    assert profile_res.json()["basics"]["name"] == "Ana Silva"
