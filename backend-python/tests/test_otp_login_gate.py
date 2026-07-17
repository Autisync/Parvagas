"""Tests that OTP/phone login is gated off by default — the backend flow
itself has been complete for a while, but nothing stopped a leaked or
bookmarked /auth/otp/* URL from working before this gate existed, even
though the intent was for it to ship inactive until explicitly flipped on.
"""
import asyncio
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.base import Base
from app.models import FeatureFlag
from app.api.v1.auth import otp_request, otp_verify


@pytest.fixture()
def db():
    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()


def _fake_request() -> SimpleNamespace:
    return SimpleNamespace(client=SimpleNamespace(host="9.9.9.9"), headers={})


def test_otp_request_403_when_flag_absent(db):
    """No row in feature_flags at all — falls back to the settings default,
    which is False."""
    with pytest.raises(HTTPException) as exc:
        asyncio.run(otp_request(request=_fake_request(), payload={"phone": "+351912345678"}, db=db))
    assert exc.value.status_code == 403


def test_otp_verify_403_when_flag_absent(db):
    with pytest.raises(HTTPException) as exc:
        asyncio.run(otp_verify(request=_fake_request(), payload={"phone": "+351912345678", "code": "123456"}, db=db))
    assert exc.value.status_code == 403


def test_otp_request_403_when_flag_explicitly_false(db):
    db.add(FeatureFlag(key="OTP_LOGIN_ENABLED", value=False))
    db.commit()

    with pytest.raises(HTTPException) as exc:
        asyncio.run(otp_request(request=_fake_request(), payload={"phone": "+351912345678"}, db=db))
    assert exc.value.status_code == 403


def test_otp_request_succeeds_when_flag_enabled(db):
    db.add(FeatureFlag(key="OTP_LOGIN_ENABLED", value=True))
    db.commit()

    result = asyncio.run(otp_request(request=_fake_request(), payload={"phone": "+351912345678"}, db=db))
    assert result["sent"] is True
