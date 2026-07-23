"""Tests for overnight-audit W1.3: the admin sidebar restricts Campanhas to
super-admin (levels: ["super-admin"] in AdminSidebar.tsx) and the page's own
AdminRestricted fallback says the same, but every /admin/ads/* backend
route only ever checked role==admin (any admin, any level) — a moderator
who navigated directly got full create/publish/pause/flag/delete access,
contradicting what the UI told every other role. Covers the routes a
moderator could most plausibly reach and mutate.
"""
import asyncio
import uuid

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.base import Base
from app.models import AdCampaign, AdminLevel, User, UserRole
from app.api.v1.admin import admin_ads, admin_create_ad, admin_ad_flag, admin_delete_ad


@pytest.fixture()
def db():
    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()


def _make_admin(db, level):
    admin = User(
        id=str(uuid.uuid4()), email=f"admin-{uuid.uuid4()}@parvagas.pt", full_name="Admin",
        password_hash="x", role=UserRole.admin, admin_level=level,
    )
    db.add(admin)
    db.commit()
    return admin


def test_moderator_blocked_from_listing_ads(db):
    moderator = _make_admin(db, AdminLevel.moderator.value)
    with pytest.raises(HTTPException) as exc:
        asyncio.run(admin_ads(db=db, current_user=moderator))
    assert exc.value.status_code == 403


def test_moderator_blocked_from_creating_ads(db):
    moderator = _make_admin(db, AdminLevel.moderator.value)
    with pytest.raises(HTTPException) as exc:
        asyncio.run(admin_create_ad({"title": "X", "placement": "homepage_banner"}, db=db, current_user=moderator))
    assert exc.value.status_code == 403


def test_moderator_blocked_from_flagging_ads(db):
    owner = _make_admin(db, AdminLevel.super_admin.value)
    ad = AdCampaign(title="X", placement="homepage_banner", status="draft")
    db.add(ad)
    db.commit()

    moderator = _make_admin(db, AdminLevel.moderator.value)
    with pytest.raises(HTTPException) as exc:
        asyncio.run(admin_ad_flag(ad.id, {"reason": "test"}, db=db, current_user=moderator))
    assert exc.value.status_code == 403


def test_moderator_blocked_from_deleting_ads(db):
    owner = _make_admin(db, AdminLevel.super_admin.value)
    ad = AdCampaign(title="X", placement="homepage_banner", status="draft")
    db.add(ad)
    db.commit()

    moderator = _make_admin(db, AdminLevel.moderator.value)
    with pytest.raises(HTTPException) as exc:
        asyncio.run(admin_delete_ad(ad.id, db=db, current_user=moderator))
    assert exc.value.status_code == 403


def test_super_admin_can_list_and_create_ads(db):
    super_admin = _make_admin(db, AdminLevel.super_admin.value)
    result = asyncio.run(admin_ads(db=db, current_user=super_admin))
    assert result["ads"] == []

    created = asyncio.run(admin_create_ad({"title": "Campanha X", "placement": "homepage_banner"}, db=db, current_user=super_admin))
    assert created["ad"]["title"] == "Campanha X"
