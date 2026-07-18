"""Tests for admin ad-campaign moderation actions. POST /ads/{id}/flag
already existed with nothing to clear it — admin_ad_unflag is the new
counterpart (mirrors admin_ad_flag exactly, just the inverse).
"""
import asyncio
import uuid

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.base import Base
from app.models import AdCampaign, User, UserRole
from app.api.v1.admin import admin_ad_flag, admin_ad_unflag


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


def _make_ad(db, **overrides):
    base = dict(title="Ad", placement="sidebar", active=True)
    base.update(overrides)
    ad = AdCampaign(**base)
    db.add(ad)
    db.commit()
    return ad


def test_unflag_clears_flagged_and_reason(db):
    admin = _make_admin(db)
    ad = _make_ad(db, flagged=True, flag_reason="conteúdo suspeito", status="flagged")
    ad_id = ad.id

    result = asyncio.run(admin_ad_unflag(ad_id, db=db, current_user=admin))

    assert result["ad"]["flagged"] is False
    row = db.query(AdCampaign).filter(AdCampaign.id == ad_id).first()
    assert row.flagged is False
    assert row.flag_reason is None
    assert row.status == "active"


def test_unflag_recomputes_status_back_to_active(db):
    admin = _make_admin(db)
    ad = _make_ad(db, flagged=True, flag_reason="x", status="flagged")

    asyncio.run(admin_ad_unflag(ad.id, db=db, current_user=admin))

    row = db.query(AdCampaign).filter(AdCampaign.id == ad.id).first()
    assert row.status == "active"


def test_flag_then_unflag_round_trip(db):
    admin = _make_admin(db)
    ad = _make_ad(db)

    flagged = asyncio.run(admin_ad_flag(ad.id, {"reason": "spam"}, db=db, current_user=admin))
    assert flagged["ad"]["flagged"] is True

    unflagged = asyncio.run(admin_ad_unflag(ad.id, db=db, current_user=admin))
    assert unflagged["ad"]["flagged"] is False


def test_unflag_missing_ad_returns_404(db):
    from fastapi import HTTPException

    admin = _make_admin(db)
    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(admin_ad_unflag("does-not-exist", db=db, current_user=admin))
    assert exc_info.value.status_code == 404


def test_unflag_on_already_unflagged_ad_is_a_no_op(db):
    admin = _make_admin(db)
    ad = _make_ad(db, flagged=False)

    result = asyncio.run(admin_ad_unflag(ad.id, db=db, current_user=admin))

    assert result["ad"]["flagged"] is False
