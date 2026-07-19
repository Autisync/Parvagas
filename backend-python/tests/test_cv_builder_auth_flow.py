from datetime import datetime, timedelta

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.api.v1.cv_builder_auth import router, settings
from app.api.v1.router import router as v1_router
from app.db.base import Base
from app.db.session import get_db
from app.models import CVBuilderAuthCode, CandidateProfile, User, UserRole


def _make_app_with_auth_db():
    engine = create_engine(
        "sqlite+pysqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()

    app = FastAPI()
    app.include_router(v1_router)

    def _override_get_db():
        try:
            yield session
        finally:
            pass

    app.dependency_overrides[get_db] = _override_get_db

    @app.middleware("http")
    async def _inject_auth_claims(request, call_next):
        request.state.auth_claims = {"sub": "user-candidate"}
        request.state.auth_error = None
        return await call_next(request)

    return TestClient(app), session


def _seed_candidate(db):
    user = User(
        id="user-candidate",
        email="candidate@parvagas.pt",
        full_name="Candidate Name",
        password_hash="x",
        role=UserRole.candidate,
    )
    db.add(user)
    db.add(CandidateProfile(user_id=user.id))
    db.commit()


def test_create_session_returns_launch_url_and_stored_code(monkeypatch):
    monkeypatch.setattr(settings, "CV_BUILDER_URL", "http://localhost:3050")
    monkeypatch.setattr(settings, "RESUME_BUILDER_URL", "")
    monkeypatch.setattr(settings, "CV_BUILDER_ALLOWED_RETURN_ORIGINS", "http://localhost:3050")
    monkeypatch.setattr(settings, "CV_BUILDER_CODE_TTL_SECONDS", 90)
    monkeypatch.setattr(settings, "FRONTEND_URL", "http://localhost:3000")

    client, db = _make_app_with_auth_db()
    _seed_candidate(db)

    response = client.post(
        "/api/v1/cv-builder/session",
        json={"return_url": "http://localhost:3000/Portal/Candidato/CV-e-Documentos"},
    )
    assert response.status_code == 200

    payload = response.json()
    assert payload["launch_url"].startswith("http://localhost:3050/auth/parvagas/exchange?code=")
    assert payload["expires_in_seconds"] == 90

    stored = db.query(CVBuilderAuthCode).first()
    assert stored is not None
    assert stored.used_at is None
    assert stored.audience == "cv-builder"


def test_exchange_consumes_code_once(monkeypatch):
    monkeypatch.setattr(settings, "CV_BUILDER_SERVER_SECRET", "server-secret")
    monkeypatch.setattr(settings, "CV_BUILDER_URL", "http://localhost:3050")
    monkeypatch.setattr(settings, "RESUME_BUILDER_URL", "")
    monkeypatch.setattr(settings, "CV_BUILDER_ALLOWED_RETURN_ORIGINS", "http://localhost:3050")
    monkeypatch.setattr(settings, "CV_BUILDER_CODE_TTL_SECONDS", 90)
    monkeypatch.setattr(settings, "FRONTEND_URL", "http://localhost:3000")

    client, db = _make_app_with_auth_db()
    _seed_candidate(db)

    session_res = client.post("/api/v1/cv-builder/session", json={})
    code = session_res.json()["launch_url"].split("code=")[-1]

    first = client.post(
        "/api/v1/cv-builder/exchange",
        json={"code": code},
        headers={"X-CV-Builder-Key": "server-secret"},
    )
    assert first.status_code == 200
    body = first.json()
    assert body["sub"] == "user-candidate"
    assert body["email"] == "candidate@parvagas.pt"
    assert body["plan"] == "free"

    second = client.post(
        "/api/v1/cv-builder/exchange",
        json={"code": code},
        headers={"X-CV-Builder-Key": "server-secret"},
    )
    assert second.status_code == 409


def test_exchange_rejects_expired_code(monkeypatch):
    monkeypatch.setattr(settings, "CV_BUILDER_SERVER_SECRET", "server-secret")
    monkeypatch.setattr(settings, "CV_BUILDER_URL", "http://localhost:3050")
    monkeypatch.setattr(settings, "RESUME_BUILDER_URL", "")
    monkeypatch.setattr(settings, "CV_BUILDER_ALLOWED_RETURN_ORIGINS", "http://localhost:3050")
    monkeypatch.setattr(settings, "CV_BUILDER_CODE_TTL_SECONDS", 90)
    monkeypatch.setattr(settings, "FRONTEND_URL", "http://localhost:3000")

    client, db = _make_app_with_auth_db()
    _seed_candidate(db)

    session_res = client.post("/api/v1/cv-builder/session", json={})
    code = session_res.json()["launch_url"].split("code=")[-1]

    code_hash = db.query(CVBuilderAuthCode).first()
    code_hash.expires_at = datetime.utcnow() - timedelta(seconds=1)
    db.commit()

    expired = client.post(
        "/api/v1/cv-builder/exchange",
        json={"code": code},
        headers={"X-CV-Builder-Key": "server-secret"},
    )
    assert expired.status_code == 410


def test_exchange_requires_server_secret(monkeypatch):
    monkeypatch.setattr(settings, "CV_BUILDER_SERVER_SECRET", "server-secret")
    monkeypatch.setattr(settings, "CV_BUILDER_URL", "http://localhost:3050")
    monkeypatch.setattr(settings, "RESUME_BUILDER_URL", "")
    monkeypatch.setattr(settings, "CV_BUILDER_ALLOWED_RETURN_ORIGINS", "http://localhost:3050")
    monkeypatch.setattr(settings, "CV_BUILDER_CODE_TTL_SECONDS", 90)
    monkeypatch.setattr(settings, "FRONTEND_URL", "http://localhost:3000")

    client, db = _make_app_with_auth_db()
    _seed_candidate(db)

    session_res = client.post("/api/v1/cv-builder/session", json={})
    code = session_res.json()["launch_url"].split("code=")[-1]

    response = client.post("/api/v1/cv-builder/exchange", json={"code": code})
    assert response.status_code == 401
