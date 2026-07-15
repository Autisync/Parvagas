"""Tests that /auth/login never echoes a raw internal exception to the
client. The AuthenticationError branch (wrong password, suspended, locked)
was already safe — curated messages only. The bug was the OTHER except
Exception branch, which catches genuinely unexpected errors (a bug, a DB
failure) and used to return str(e) straight to the caller as the 401
detail. That's still logged server-side and recorded in security_events
(admin-only) — the client now only ever sees a generic message.
"""
import asyncio
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.api.v1 import auth as auth_module
from app.db.base import Base
from app.schemas import UserLoginRequest


@pytest.fixture()
def db():
    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()


def _fake_request() -> SimpleNamespace:
    return SimpleNamespace(
        client=SimpleNamespace(host="9.9.9.9"),
        headers={"user-agent": "pytest"},
    )


def test_unexpected_error_never_leaks_raw_exception_text(db, monkeypatch):
    secret_looking_detail = "connection to db-primary-internal.parvagas.pt:5432 refused (password auth failed for role 'app_rw')"

    def _boom(**kwargs):
        raise RuntimeError(secret_looking_detail)

    monkeypatch.setattr(auth_module.AuthService, "authenticate_user", staticmethod(_boom))
    # record_failed_login (imported locally inside the except block, so not
    # patchable via auth_module) is exercised for real here — it swallows
    # its own exceptions (including a Celery broker being unreachable in
    # this test env), which is itself part of what's under test: recording
    # the failure must never let this secondary error surface either.

    payload = UserLoginRequest(email="a@b.com", password="whatever")
    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(auth_module.login(request=_fake_request(), payload=payload, db=db))

    assert exc_info.value.status_code == 401
    assert exc_info.value.detail == "Invalid email or password"
    assert secret_looking_detail not in str(exc_info.value.detail)
