"""Data-subject request handling — export and erasure (Wave C3,
EXECUTION_PLAN_LEGAL_AND_PAYMENTS.md). See privacidade.md Section 7 (the
rights themselves) and politica-retencao.md Section 1 (erasure executed as
anonymization, not hard delete, except where legal retention overrides it).
"""
from __future__ import annotations

import json
import uuid
from datetime import datetime
from typing import Any

from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.models import (
    CandidateProfile,
    Company,
    CompanyMember,
    DataSubjectRequest,
    JobApplication,
    LegalAcceptance,
    LegalDocumentVersion,
    Resume,
    SavedJob,
    User,
)


def _json_load(value: str | None) -> Any:
    if not value:
        return None
    try:
        return json.loads(value)
    except (TypeError, ValueError):
        return None


def build_user_export(db: Session, user: User) -> dict[str, Any]:
    """Everything we hold about this user, gathered read-only for
    self-service download. Scope: account identity, legal-acceptance
    history, and role-specific profile/activity data. CV files and
    resume documents are already downloadable from the portal itself
    (CV-e-Documentos / Construtor-CV), so only their metadata is listed
    here rather than duplicating file bytes into the export."""
    data: dict[str, Any] = {
        "exportedAt": datetime.utcnow().isoformat(),
        "account": {
            "id": user.id,
            "email": user.email,
            "fullName": user.full_name,
            "role": user.role.value if hasattr(user.role, "value") else str(user.role),
            "phone": user.phone,
            "phoneVerified": bool(user.phone_verified),
            "emailVerified": bool(user.email_verified),
            "isGuestAccount": bool(user.is_guest_account),
            "createdAt": user.created_at.isoformat() if user.created_at else None,
        },
    }

    acceptances = (
        db.query(LegalAcceptance)
        .filter(LegalAcceptance.user_id == user.id)
        .order_by(LegalAcceptance.created_at.desc())
        .all()
    )
    version_ids = {a.document_version_id for a in acceptances}
    versions_by_id = {
        v.id: v
        for v in db.query(LegalDocumentVersion).filter(LegalDocumentVersion.id.in_(version_ids)).all()
    } if version_ids else {}
    data["legalAcceptances"] = [
        {
            "documentSlug": versions_by_id[a.document_version_id].document.slug
            if a.document_version_id in versions_by_id else None,
            "versionLabel": versions_by_id[a.document_version_id].version_label
            if a.document_version_id in versions_by_id else None,
            "context": a.context,
            "acceptedAt": a.created_at.isoformat() if a.created_at else None,
        }
        for a in acceptances
    ]

    role = data["account"]["role"]

    if role == "candidate":
        profile = db.query(CandidateProfile).filter(CandidateProfile.user_id == user.id).first()
        if profile:
            data["candidateProfile"] = {
                "firstName": profile.first_name,
                "lastName": profile.last_name,
                "phone": profile.phone,
                "location": profile.location,
                "postcode": profile.postcode,
                "linkedinUrl": profile.linkedin_url,
                "portfolioUrl": profile.portfolio_url,
                "githubUrl": profile.github_url,
                "professionalSummary": profile.professional_summary,
                "jobTitle": profile.job_title,
                "yearsOfExperience": profile.years_of_experience,
                "skills": _json_load(profile.skills),
                "workExperience": _json_load(profile.work_experience),
                "education": _json_load(profile.education),
                "certifications": _json_load(profile.certifications),
                "languages": _json_load(profile.languages),
                "notificationPreferences": _json_load(profile.notification_preferences),
            }
            data["resumes"] = [
                {"id": r.id, "title": r.title, "isPublished": bool(r.is_published), "updatedAt": r.updated_at.isoformat() if r.updated_at else None}
                for r in db.query(Resume).filter(Resume.candidate_profile_id == profile.id).all()
            ]

        data["applications"] = [
            {
                "id": app_.id,
                "jobId": app_.job_id,
                "status": app_.status,
                "appliedAt": app_.created_at.isoformat() if app_.created_at else None,
            }
            for app_ in db.query(JobApplication).filter(JobApplication.candidate_user_id == user.id).all()
        ]

        data["savedJobs"] = [
            {"jobId": s.job_id, "savedAt": s.created_at.isoformat() if s.created_at else None}
            for s in db.query(SavedJob).filter(SavedJob.candidate_user_id == user.id).all()
        ]

    elif role == "company":
        owned_company = db.query(Company).filter(Company.owner_user_id == user.id).first()
        if owned_company:
            data["ownedCompany"] = {
                "id": owned_company.id,
                "name": owned_company.name,
                "nif": owned_company.nif,
                "email": owned_company.email,
                "phone": owned_company.phone,
                "status": owned_company.status,
            }
        memberships = db.query(CompanyMember).filter(CompanyMember.user_id == user.id).all()
        data["companyMemberships"] = [
            {"companyId": m.company_id, "role": m.role} for m in memberships
        ]

    return data


def create_export_request(db: Session, user: User) -> DataSubjectRequest:
    """Records that an export happened — audit trail only, the data itself
    is never persisted server-side (it's streamed straight back to the
    caller by the API layer)."""
    now = datetime.utcnow()
    request = DataSubjectRequest(
        id=str(uuid.uuid4()), user_id=user.id, request_type="export",
        status="completed", reviewed_at=now,
    )
    db.add(request)
    db.commit()
    db.refresh(request)
    return request


def create_erasure_request(db: Session, user: User, *, note: str | None = None) -> DataSubjectRequest:
    """Idempotent — a second request while one is already pending just
    returns the existing row instead of piling up duplicates."""
    existing = (
        db.query(DataSubjectRequest)
        .filter(
            DataSubjectRequest.user_id == user.id,
            DataSubjectRequest.request_type == "erasure",
            DataSubjectRequest.status == "pending",
        )
        .first()
    )
    if existing:
        return existing

    request = DataSubjectRequest(
        id=str(uuid.uuid4()), user_id=user.id, request_type="erasure",
        status="pending", note=(note or "").strip() or None,
    )
    db.add(request)
    db.commit()
    db.refresh(request)
    return request


def list_requests(
    db: Session, *, status_filter: str | None = None, user_id: str | None = None,
) -> list[DataSubjectRequest]:
    query = db.query(DataSubjectRequest)
    if status_filter:
        query = query.filter(DataSubjectRequest.status == status_filter)
    if user_id:
        query = query.filter(DataSubjectRequest.user_id == user_id)
    return query.order_by(DataSubjectRequest.created_at.desc()).all()


def get_request(db: Session, request_id: str) -> DataSubjectRequest | None:
    return db.query(DataSubjectRequest).filter(DataSubjectRequest.id == request_id).first()


def anonymize_user(db: Session, user: User) -> None:
    """The actual erasure. Scrubs personally-identifying fields but keeps
    every row in place — deleting the User row outright would cascade into
    (or orphan) Applications, LegalAcceptances, AuditLogs and other records
    that must survive for operational/legal-audit reasons per
    politica-retencao.md. Anonymizing in place is the same trade-off that
    policy already documents for routine (non-request-driven) retention
    expiry.

    Explicitly NOT touched here (documented, not an oversight): Transaction
    rows (10-year fiscal retention, no direct PII column), AuditLog rows
    referencing this user as actor (administrative-action audit trail),
    LegalAcceptance rows (compliance proof of what was accepted and when —
    the anonymized user_id link is exactly what a regulator would want to
    see preserved), and Notification rows (low-risk operational bell
    messages)."""
    placeholder_email = f"deleted-{user.id}@parvagas.pt.invalid"
    user.email = placeholder_email
    user.full_name = "Utilizador Removido"
    user.phone = None
    user.password_hash = hash_password(str(uuid.uuid4()))
    user.suspended = True
    user.tokens_revoked_at = datetime.utcnow()

    from app.services.auth_service import AuthService
    AuthService.revoke_all_refresh_tokens(db, user)

    profile = db.query(CandidateProfile).filter(CandidateProfile.user_id == user.id).first()
    if profile:
        profile.first_name = None
        profile.last_name = None
        profile.phone = None
        profile.location = None
        profile.postcode = None
        profile.linkedin_url = None
        profile.portfolio_url = None
        profile.github_url = None
        profile.professional_summary = None
        profile.job_title = None
        profile.skills = None
        profile.hard_skills = None
        profile.techniques = None
        profile.tools = None
        profile.work_experience = None
        profile.education = None
        profile.certifications = None
        profile.languages = None

    for app_ in db.query(JobApplication).filter(JobApplication.candidate_user_id == user.id).all():
        app_.applicant_full_name = "Candidato Removido"
        app_.applicant_email = placeholder_email
        app_.applicant_phone = None
        app_.applicant_location = None
        app_.cover_letter = None

    db.commit()


def approve_erasure(
    db: Session, request: DataSubjectRequest, *, reviewed_by_user_id: str, admin_note: str | None = None,
) -> DataSubjectRequest:
    if request.request_type != "erasure":
        raise ValueError("Only erasure requests can be approved")
    if request.status != "pending":
        raise ValueError("Request already reviewed")

    user = db.query(User).filter(User.id == request.user_id).first()
    if user:
        anonymize_user(db, user)

    request.status = "completed"
    request.reviewed_by_user_id = reviewed_by_user_id
    request.reviewed_at = datetime.utcnow()
    request.admin_note = (admin_note or "").strip() or None
    db.commit()
    db.refresh(request)
    return request


def reject_erasure(
    db: Session, request: DataSubjectRequest, *, reviewed_by_user_id: str, admin_note: str,
) -> DataSubjectRequest:
    if request.request_type != "erasure":
        raise ValueError("Only erasure requests can be rejected")
    if request.status != "pending":
        raise ValueError("Request already reviewed")

    request.status = "rejected"
    request.reviewed_by_user_id = reviewed_by_user_id
    request.reviewed_at = datetime.utcnow()
    request.admin_note = admin_note.strip()
    db.commit()
    db.refresh(request)
    return request
