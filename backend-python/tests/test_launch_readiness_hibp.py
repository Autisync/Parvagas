"""Tests for the HIBP check on the admin launch-readiness probe — the
scheduled breach-scan task silently no-ops when HIBP_API_KEY is unset, so
this check is the only place that surfaces whether it's actually running.
"""
import asyncio
import uuid
from datetime import datetime

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.base import Base
from app.models import User, UserRole
from app.api.v1.admin import admin_launch_readiness


@pytest.fixture()
def db():
    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()


def _make_admin(db):
    admin = User(id=str(uuid.uuid4()), email=f"admin-{uuid.uuid4()}@parvagas.pt", full_name="Admin", password_hash="x", role=UserRole.admin)
    db.add(admin)
    db.commit()
    return admin


def _find_hibp_check(result):
    return next(c for c in result["checks"] if c["id"] == "hibp")


def test_hibp_warns_when_api_key_unset(db, monkeypatch):
    from app.core import config
    monkeypatch.setattr(config.get_settings(), "HIBP_API_KEY", "")
    admin = _make_admin(db)

    result = asyncio.run(admin_launch_readiness(db=db, current_user=admin))

    check = _find_hibp_check(result)
    assert check["status"] == "warn"
    assert "HIBP_API_KEY" in check["message"]


def test_hibp_warns_when_key_set_but_never_scanned(db, monkeypatch):
    from app.core import config
    monkeypatch.setattr(config.get_settings(), "HIBP_API_KEY", "fake-key")
    admin = _make_admin(db)
    db.add(User(email="never-checked@x.com", full_name="U", password_hash="x", role=UserRole.candidate))
    db.commit()

    result = asyncio.run(admin_launch_readiness(db=db, current_user=admin))

    check = _find_hibp_check(result)
    assert check["status"] == "warn"
    assert "sem nenhuma verificação" in check["message"]


def test_hibp_passes_with_coverage_when_scans_exist(db, monkeypatch):
    from app.core import config
    monkeypatch.setattr(config.get_settings(), "HIBP_API_KEY", "fake-key")
    admin = _make_admin(db)
    db.add(User(email="checked@x.com", full_name="U1", password_hash="x", role=UserRole.candidate, hibp_checked_at=datetime.utcnow()))
    db.add(User(email="not-checked@x.com", full_name="U2", password_hash="x", role=UserRole.candidate))
    db.commit()

    result = asyncio.run(admin_launch_readiness(db=db, current_user=admin))

    total_users = db.query(User).count()
    checked_users = db.query(User).filter(User.hibp_checked_at.isnot(None)).count()
    expected_pct = round((checked_users / total_users) * 100, 1)

    check = _find_hibp_check(result)
    assert check["status"] == "pass"
    assert f"{expected_pct}%" in check["message"]
