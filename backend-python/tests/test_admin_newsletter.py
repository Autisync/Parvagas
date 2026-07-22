"""Tests for the admin newsletter compose/send feature — the admin-side
counterpart to the public newsletter subscribe/unsubscribe endpoints
(test_newsletter.py). Covers draft creation, the super-admin-only send
gate, the fan-out send task, and the "vagas recentes" auto-include.
"""
import asyncio
import json
import uuid
from datetime import datetime

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.base import Base
from app.models import Company, Job, NewsletterIssue, NewsletterSubscriber, User, UserRole
from app.api.v1.admin import (
    admin_create_newsletter_issue,
    admin_newsletter_issues,
    admin_newsletter_subscribers,
    admin_send_newsletter_issue,
    _render_newsletter_jobs_html,
)
from app.workers.tasks import send_newsletter_issue


@pytest.fixture()
def db(monkeypatch):
    monkeypatch.setattr("app.workers.tasks.send_templated_email.delay", lambda *a, **k: None)
    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()


def _make_admin(db, admin_level="super-admin"):
    admin = User(id=str(uuid.uuid4()), email=f"admin-{uuid.uuid4()}@x.com", full_name="Admin", password_hash="x", role=UserRole.admin, admin_level=admin_level)
    db.add(admin)
    db.commit()
    return admin


def _make_subscriber(db, email, unsubscribed=False):
    sub = NewsletterSubscriber(email=email, unsubscribed_at=datetime.utcnow() if unsubscribed else None)
    db.add(sub)
    db.commit()
    return sub


def _make_job(db, title="Engenheiro de Software", status="approved", visibility="public"):
    owner = User(id=str(uuid.uuid4()), email=f"owner-{uuid.uuid4()}@x.com", full_name="Owner", password_hash="x", role=UserRole.company)
    db.add(owner)
    db.flush()
    company = Company(owner_user_id=owner.id, name="Acme", status="active")
    db.add(company)
    db.flush()
    job = Job(company_id=company.id, title=title, status=status, visibility=visibility, location="Luanda", published_at=datetime.utcnow())
    db.add(job)
    db.commit()
    return job


def test_create_issue_requires_subject_and_paragraph(db):
    admin = _make_admin(db)
    with pytest.raises(HTTPException) as exc:
        asyncio.run(admin_create_newsletter_issue({"subject": "", "introParagraphs": []}, db=db, current_user=admin))
    assert exc.value.status_code == 400


def test_create_issue_persists_draft(db):
    admin = _make_admin(db)
    result = asyncio.run(admin_create_newsletter_issue(
        {"subject": "Novidades", "introParagraphs": ["Olá", "Segundo parágrafo"], "includeRecentJobs": True, "recentJobsCount": 3},
        db=db, current_user=admin,
    ))
    assert result["status"] == "draft"
    assert result["introParagraphs"] == ["Olá", "Segundo parágrafo"]
    assert result["recentJobsCount"] == 3

    issue = db.query(NewsletterIssue).filter(NewsletterIssue.id == result["_id"]).first()
    assert issue is not None
    assert json.loads(issue.intro_paragraphs) == ["Olá", "Segundo parágrafo"]


def test_recent_jobs_count_clamped_to_range(db):
    admin = _make_admin(db)
    result = asyncio.run(admin_create_newsletter_issue(
        {"subject": "X", "introParagraphs": ["Y"], "includeRecentJobs": True, "recentJobsCount": 999},
        db=db, current_user=admin,
    ))
    assert result["recentJobsCount"] == 20


def test_subscribers_endpoint_reports_active_and_unsubscribed_counts(db):
    admin = _make_admin(db)
    _make_subscriber(db, "active1@x.com")
    _make_subscriber(db, "active2@x.com")
    _make_subscriber(db, "gone@x.com", unsubscribed=True)

    result = asyncio.run(admin_newsletter_subscribers(page=1, limit=25, db=db, current_user=admin))
    assert result["activeCount"] == 2
    assert result["unsubscribedCount"] == 1
    assert len(result["subscribers"]) == 3


def test_issues_endpoint_lists_newest_first(db):
    admin = _make_admin(db)
    asyncio.run(admin_create_newsletter_issue({"subject": "First", "introParagraphs": ["a"]}, db=db, current_user=admin))
    asyncio.run(admin_create_newsletter_issue({"subject": "Second", "introParagraphs": ["b"]}, db=db, current_user=admin))

    result = asyncio.run(admin_newsletter_issues(page=1, limit=25, db=db, current_user=admin))
    assert [i["subject"] for i in result["issues"]] == ["Second", "First"]


def test_send_requires_super_admin(db):
    plain_admin = _make_admin(db, admin_level="moderator")
    created = asyncio.run(admin_create_newsletter_issue({"subject": "X", "introParagraphs": ["y"]}, db=db, current_user=plain_admin))

    with pytest.raises(HTTPException) as exc:
        asyncio.run(admin_send_newsletter_issue(created["_id"], db=db, current_user=plain_admin))
    assert exc.value.status_code == 403


def test_send_rejects_already_sent_issue(db, monkeypatch):
    monkeypatch.setattr("app.workers.tasks.send_newsletter_issue.delay", lambda *a, **k: None)
    admin = _make_admin(db)
    created = asyncio.run(admin_create_newsletter_issue({"subject": "X", "introParagraphs": ["y"]}, db=db, current_user=admin))
    issue = db.query(NewsletterIssue).filter(NewsletterIssue.id == created["_id"]).first()
    issue.status = "sent"
    db.commit()

    with pytest.raises(HTTPException) as exc:
        asyncio.run(admin_send_newsletter_issue(created["_id"], db=db, current_user=admin))
    assert exc.value.status_code == 409


def test_send_marks_sending_and_dispatches_task(db, monkeypatch):
    dispatched = []
    monkeypatch.setattr("app.workers.tasks.send_newsletter_issue.delay", lambda *a, **k: dispatched.append(a))
    admin = _make_admin(db)
    created = asyncio.run(admin_create_newsletter_issue({"subject": "X", "introParagraphs": ["y"]}, db=db, current_user=admin))

    result = asyncio.run(admin_send_newsletter_issue(created["_id"], db=db, current_user=admin))
    assert result["status"] == "sending"
    assert len(dispatched) == 1

    issue = db.query(NewsletterIssue).filter(NewsletterIssue.id == created["_id"]).first()
    assert issue.status == "sending"


def test_render_jobs_html_only_includes_public_live_jobs(db):
    live_job = _make_job(db, title="Vaga Pública", status="approved", visibility="public")
    _make_job(db, title="Vaga Pendente", status="pending_platform_review", visibility="public")
    _make_job(db, title="Vaga Privada", status="approved", visibility="private")

    html = _render_newsletter_jobs_html(db, count=10)
    assert "Vaga Pública" in html
    assert "Vaga Pendente" not in html
    assert "Vaga Privada" not in html


def test_render_jobs_html_empty_when_no_public_jobs(db):
    assert _render_newsletter_jobs_html(db, count=5) == ""


# ── send_newsletter_issue task (fan-out) ───────────────────────────────────

def test_send_newsletter_issue_task_only_targets_active_subscribers(db, monkeypatch):
    sent = []
    monkeypatch.setattr("app.workers.tasks.SessionLocal", lambda: db)
    monkeypatch.setattr("app.workers.tasks.send_templated_email.delay", lambda method, payload: sent.append(payload))
    monkeypatch.setattr(db, "close", lambda: None)  # keep the shared test session alive across the task

    active = _make_subscriber(db, "active@x.com")
    _make_subscriber(db, "gone@x.com", unsubscribed=True)
    issue = NewsletterIssue(subject="Hello", intro_paragraphs=json.dumps(["Hi there"]), status="sending")
    db.add(issue)
    db.commit()

    result = send_newsletter_issue(issue.id, "")
    assert result["success"] is True
    assert result["queuedCount"] == 1
    assert len(sent) == 1
    assert sent[0]["email"] == active.email
    assert active.unsubscribe_token in sent[0]["unsubscribe_url"]

    db.refresh(issue)
    assert issue.status == "sent"
    assert issue.sent_at is not None
    assert issue.queued_count == 1


def test_send_newsletter_issue_task_unknown_issue_id(db, monkeypatch):
    monkeypatch.setattr("app.workers.tasks.SessionLocal", lambda: db)
    monkeypatch.setattr(db, "close", lambda: None)

    result = send_newsletter_issue("does-not-exist", "")
    assert result["success"] is False
