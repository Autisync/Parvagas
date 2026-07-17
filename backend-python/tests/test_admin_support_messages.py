"""Tests for the admin support-message inbox — SupportMessage rows have
been persisted since earlier this session (the notification bell's
"message" form used to fake a response and store nothing), but there was
no admin view of them at all until now.
"""
import asyncio
import uuid

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.base import Base
from app.models import SupportMessage, User, UserRole
from app.api.v1.admin import admin_list_support_messages, admin_resolve_support_message


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


def _make_sender(db):
    user = User(id=str(uuid.uuid4()), email=f"sender-{uuid.uuid4()}@x.com", full_name="Sender", password_hash="x", role=UserRole.company)
    db.add(user)
    db.commit()
    return user


def test_list_support_messages(db):
    admin = _make_admin(db)
    sender = _make_sender(db)
    db.add(SupportMessage(sender_user_id=sender.id, sender_role="company", reason="Outro", message="Preciso de ajuda", status="open"))
    db.commit()

    result = asyncio.run(admin_list_support_messages(page=1, limit=20, status_filter=None, db=db, current_user=admin))

    assert result["pagination"]["total"] == 1
    assert result["supportMessages"][0]["senderName"] == "Sender"
    assert result["supportMessages"][0]["message"] == "Preciso de ajuda"
    assert result["supportMessages"][0]["status"] == "open"


def test_list_support_messages_filters_by_status(db):
    admin = _make_admin(db)
    sender = _make_sender(db)
    db.add(SupportMessage(sender_user_id=sender.id, sender_role="company", reason="A", message="a", status="open"))
    db.add(SupportMessage(sender_user_id=sender.id, sender_role="company", reason="B", message="b", status="resolved"))
    db.commit()

    result = asyncio.run(admin_list_support_messages(page=1, limit=20, status_filter="resolved", db=db, current_user=admin))

    assert result["pagination"]["total"] == 1
    assert result["supportMessages"][0]["reason"] == "B"


def test_resolve_support_message(db):
    admin = _make_admin(db)
    sender = _make_sender(db)
    entry = SupportMessage(sender_user_id=sender.id, sender_role="company", reason="Outro", message="x", status="open")
    db.add(entry)
    db.commit()

    result = asyncio.run(admin_resolve_support_message(entry.id, db=db, current_user=admin))

    assert result["status"] == "resolved"
    db.refresh(entry)
    assert entry.status == "resolved"


def test_resolve_support_message_404(db):
    admin = _make_admin(db)
    with pytest.raises(HTTPException) as exc:
        asyncio.run(admin_resolve_support_message("does-not-exist", db=db, current_user=admin))
    assert exc.value.status_code == 404
