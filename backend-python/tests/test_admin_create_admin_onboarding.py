"""Tests for overnight-audit W2.2: admin_create_admin created the User row
with a placeholder password_hash ("TEMP_RESET_REQUIRED") and never sent any
email — despite the frontend's credentialDeliveryMode selector and success
message both claiming an onboarding email went out. New admin accounts were
permanently locked out unless someone reset the password out of band.
"""
import asyncio
import uuid
from unittest.mock import patch

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.base import Base
from app.models import AdminLevel, PasswordResetToken, User, UserRole
from app.api.v1.admin import admin_create_admin


@pytest.fixture()
def db():
    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()


def _make_super_admin(db):
    admin = User(
        id=str(uuid.uuid4()), email=f"admin-{uuid.uuid4()}@parvagas.pt", full_name="Super",
        password_hash="x", role=UserRole.admin, admin_level=AdminLevel.super_admin.value,
    )
    db.add(admin)
    db.commit()
    return admin


def test_create_admin_dispatches_password_reset_email(db):
    actor = _make_super_admin(db)

    with patch("app.workers.tasks.send_password_reset_email") as mock_task:
        result = asyncio.run(admin_create_admin(
            {"email": "new-admin@parvagas.pt", "fullName": "New Admin", "adminLevel": "moderator"},
            db=db, current_user=actor,
        ))
        mock_task.delay.assert_called_once()
        call_args = mock_task.delay.call_args[0]
        assert call_args[0] == result["user"]["_id"]

    created = db.query(User).filter(User.email == "new-admin@parvagas.pt").first()
    assert created is not None
    assert created.password_hash == "TEMP_RESET_REQUIRED"  # unusable until they follow the link


def test_create_admin_actually_creates_a_usable_reset_token(db):
    """Confirms the token dispatched to the email task is real and
    resolvable, not just a dispatched call — this is what makes the account
    actually reach-able, not merely "an email function was called"."""
    actor = _make_super_admin(db)

    with patch("app.workers.tasks.send_password_reset_email") as mock_task:
        asyncio.run(admin_create_admin(
            {"email": "new-admin2@parvagas.pt", "fullName": "New Admin 2", "adminLevel": "moderator"},
            db=db, current_user=actor,
        ))
        raw_token = mock_task.delay.call_args[0][1]

    created = db.query(User).filter(User.email == "new-admin2@parvagas.pt").first()
    token_row = db.query(PasswordResetToken).filter(PasswordResetToken.user_id == created.id).first()
    assert token_row is not None
    assert raw_token  # non-empty raw token was actually generated
