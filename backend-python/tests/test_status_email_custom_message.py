"""Test for overnight-audit W-extra — a recruiter had no way to add a
personal note when changing a candidate's status; every status change
sent the exact same fixed template regardless of context. The email
service now threads an optional custom_message into the status email as
an addendum (not a replacement for the standard status copy).
"""
from app.services.email_service import EmailService


def test_custom_message_appended_to_status_email(monkeypatch):
    monkeypatch.setattr(EmailService, "_email_enabled", staticmethod(lambda: True))
    captured = {}

    def _fake_send(to_email, subject, html, cc=None, priority=False):
        captured.update({"to": to_email, "html": html})
        return True

    monkeypatch.setattr(EmailService, "_send_email", staticmethod(_fake_send))

    ok = EmailService.send_application_status_email(
        email="ana@x.com", full_name="Ana", job_title="Engenheira", new_status="interview",
        custom_message="Traga o seu portfólio impresso, por favor.",
    )
    assert ok is True
    assert "Traga o seu portfólio impresso, por favor." in captured["html"]


def test_no_addendum_when_message_omitted(monkeypatch):
    monkeypatch.setattr(EmailService, "_email_enabled", staticmethod(lambda: True))
    captured = {}

    def _fake_send(to_email, subject, html, cc=None, priority=False):
        captured.update({"html": html})
        return True

    monkeypatch.setattr(EmailService, "_send_email", staticmethod(_fake_send))

    ok = EmailService.send_application_status_email(
        email="ana@x.com", full_name="Ana", job_title="Engenheira", new_status="rejected",
    )
    assert ok is True
    assert "Mensagem da empresa" not in captured["html"]
