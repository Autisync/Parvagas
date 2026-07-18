"""Security-focused tests for POST /api/v1/events/client-errors — the one
net-new public, unauthenticated write surface added this round. Calls the
FastAPI endpoint function directly (same pattern as
test_security_event_capture.py / test_notification_wiring.py) with a fake
Request, rather than a full TestClient — lighter weight, and slowapi's
@limiter.limit decorator already tolerates direct calls without a live
Redis backend (proven by every other decorated auth endpoint's existing
tests running the same way).
"""
import asyncio
from types import SimpleNamespace

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.base import Base
from app.models import ClientErrorLog
from app.api.v1.events import ClientErrorPayload, report_client_error


def _fake_request(ip="9.9.9.9", ua="pytest-agent"):
    return SimpleNamespace(
        client=SimpleNamespace(host=ip),
        headers={"user-agent": ua},
    )


@pytest.fixture()
def db():
    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()


def test_oversized_message_is_truncated_not_rejected(db):
    huge_message = "x" * 5000
    payload = ClientErrorPayload(level="error", message=huge_message, path="/some/page")

    result = asyncio.run(report_client_error(_fake_request(), payload, db=db))

    assert result == {"ok": True}
    row = db.query(ClientErrorLog).first()
    assert row is not None
    assert len(row.message) == 500
    assert row.message == huge_message[:500]


def test_oversized_path_is_truncated(db):
    huge_path = "/p" + ("x" * 1000)
    payload = ClientErrorPayload(level="warning", message="hi", path=huge_path)

    asyncio.run(report_client_error(_fake_request(), payload, db=db))

    row = db.query(ClientErrorLog).first()
    assert len(row.path) == 300


def test_invalid_level_is_rejected_by_the_schema():
    with pytest.raises(Exception):
        ClientErrorPayload(level="not-a-real-level", message="hi")


def test_response_never_echoes_submitted_fields(db):
    payload = ClientErrorPayload(level="critical", message="a very specific unique marker XYZ123", path="/secret-path")

    result = asyncio.run(report_client_error(_fake_request(), payload, db=db))

    assert result == {"ok": True}
    assert len(result) == 1
    assert "XYZ123" not in str(result)
    assert "secret-path" not in str(result)


def test_non_json_serializable_details_is_rejected(db):
    from fastapi import HTTPException

    payload = ClientErrorPayload(level="error", message="hi", details={"bad": {1, 2, 3}})  # a set isn't JSON-serializable

    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(report_client_error(_fake_request(), payload, db=db))
    assert exc_info.value.status_code == 400

    assert db.query(ClientErrorLog).count() == 0


def test_details_is_stored_as_truncated_json(db):
    payload = ClientErrorPayload(level="warning", message="hi", details={"stack": "line1\nline2", "count": 3})

    asyncio.run(report_client_error(_fake_request(), payload, db=db))

    row = db.query(ClientErrorLog).first()
    assert row.details is not None
    assert "line1" in row.details
    assert len(row.details) <= 1000


def test_unknown_fields_in_payload_are_silently_ignored_not_stored():
    """The Pydantic model is the field allowlist — anything else submitted
    (e.g. a client trying to smuggle extra columns) never reaches storage.
    Pydantic v2's default extra="ignore" behavior enforces this."""
    payload = ClientErrorPayload.model_validate({
        "level": "error", "message": "hi",
        "recipient_hash": "sneaky", "ip_address": "1.2.3.4", "admin": True,
    })
    assert not hasattr(payload, "recipient_hash")
    assert not hasattr(payload, "admin")


def test_missing_recipient_ip_is_recorded_from_request(db):
    payload = ClientErrorPayload(level="error", message="hi")

    asyncio.run(report_client_error(_fake_request(ip="203.0.113.5"), payload, db=db))

    row = db.query(ClientErrorLog).first()
    assert row.ip_address == "203.0.113.5"


def test_rate_limit_is_registered_at_twenty_per_minute():
    """Verifies the decorator wiring itself (same approach as
    test_rate_limit_key.py::test_ai_endpoints_use_the_per_user_key_func) —
    a live 21-request loop would need a real Redis-backed limiter storage,
    which isn't available in this test environment."""
    from app.core.observability import limiter

    limits = limiter._route_limits.get("app.api.v1.events.report_client_error")
    assert limits, "no rate limit registered for report_client_error"
    assert any("20" in str(lim.limit) and "minute" in str(lim.limit).lower() for lim in limits)
