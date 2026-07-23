"""Tests for overnight-audit W2.1: POST /companies/{id}/verification/send-email
was a documented placeholder — it built a response object and returned it,
but never called send_templated_email.delay(...) or touched SMTP at all,
while the frontend always showed "Email de verificação enviado com sucesso."
Every company told "you'll hear from us" via this path heard nothing.
"""
import asyncio
import uuid
from unittest.mock import patch

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.base import Base
from app.models import Company, User, UserRole
from app.api.v1.companies import send_verification_email


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


def _make_company(db, email="empresa@x.com"):
    owner = User(id=str(uuid.uuid4()), email=f"owner-{uuid.uuid4()}@x.com", full_name="Owner", password_hash="x", role=UserRole.company)
    db.add(owner)
    db.flush()
    company = Company(owner_user_id=owner.id, name="Acme", status="pending_verification", email=email)
    db.add(company)
    db.commit()
    return company


def test_send_verification_email_actually_dispatches(db):
    admin = _make_admin(db)
    company = _make_company(db)

    with patch("app.api.v1.companies.send_templated_email") as mock_task:
        result = asyncio.run(send_verification_email(
            company.id,
            {"type": "approval", "subject": "A sua empresa foi aprovada", "body": "Parabéns, a Acme já pode publicar vagas."},
            db=db, current_user=admin,
        ))
        mock_task.delay.assert_called_once_with("send_company_verification_email", {
            "email": "empresa@x.com",
            "subject": "A sua empresa foi aprovada",
            "body": "Parabéns, a Acme já pode publicar vagas.",
        })
    assert result["queued"] is True
    assert result["toEmail"] == "empresa@x.com"


def test_send_verification_email_rejects_company_with_no_email(db):
    admin = _make_admin(db)
    company = _make_company(db, email=None)

    with pytest.raises(HTTPException) as exc:
        asyncio.run(send_verification_email(
            company.id, {"type": "approval", "subject": "X", "body": "Y"}, db=db, current_user=admin,
        ))
    assert exc.value.status_code == 400
