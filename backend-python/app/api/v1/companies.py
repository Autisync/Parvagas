"""Company API endpoints."""
from datetime import datetime, timedelta
from typing import Any, Optional
import json
import re

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from sqlalchemy.orm import Session, joinedload
from app.db.session import get_db
from app.models import (
    User, Company, UserRole, Job, JobApplication, CompanyMember, CompanyInvite,
    CompanyDeletionRequest,
)
from app.services.storage_service import StorageService
from app.services.company_billing_service import assert_job_quota
from app.services.company_access_service import resolve_company_for_user, resolve_company_for_user_or_none, require_role
from pathlib import Path as _Path
from app.api.v1.applications import list_company_applications
from app.api.v1.jobs import serialize_job
from app.core.logging import get_logger
from app.core.security import create_verification_token, hash_token
from app.core.config import get_settings
from app.workers.tasks import send_templated_email
from app.services.notification_service import admin_emails, create_notification, notify_admins
from app.api.deps import get_current_user

# Heuristic spam/scam signals for job postings (regional fraud patterns).
_SCAM_PATTERNS = [
    (r"whatsapp|telegram|\+?\d{9,}", "contacto direto fora da plataforma"),
    (r"taxa|pagamento adiantado|deposito|inscri[çc][aã]o paga|pague", "pede pagamento ao candidato"),
    (r"ganhe .* (kz|usd|\$)|renda (rapida|extra|garantida)", "promessa de renda irrealista"),
    (r"trabalh[ae] (em )?casa sem experiencia", "isco genérico de trabalho em casa"),
]


def _spam_assessment(text: str) -> tuple[int, list[str]]:
    score, flags = 0, []
    low = (text or "").lower()
    for pattern, label in _SCAM_PATTERNS:
        if re.search(pattern, low):
            score += 25
            flags.append(label)
    return min(score, 100), flags

logger = get_logger(__name__)
settings = get_settings()
router = APIRouter(prefix="/companies", tags=["companies"])

def _to_deletion_request_record(db: Session, entry: CompanyDeletionRequest) -> dict[str, Any]:
    company = db.query(Company).filter(Company.id == entry.company_id).first()
    requester = db.query(User).filter(User.id == entry.requested_by_user_id).first()
    return {
        "_id": entry.id,
        "companyId": entry.company_id,
        "reason": entry.reason,
        "requestedByAdminLevel": entry.requested_by_admin_level,
        "createdAt": entry.created_at.isoformat() if entry.created_at else None,
        "status": entry.status,
        "company": {
            "_id": company.id,
            "name": company.name,
            "status": company.status,
            "verificationStatus": "verified" if company.status == "active" else company.status,
            "contactEmail": company.email,
            "createdAt": company.created_at.isoformat() if company.created_at else None,
        } if company else None,
        "requestedBy": {
            "fullName": requester.full_name if requester else None,
            "email": requester.email if requester else None,
        },
        "reviewedAt": entry.reviewed_at.isoformat() if entry.reviewed_at else None,
        "reviewNote": entry.review_note,
    }

_ROLE_PT = {"recruiter": "Recrutador", "viewer": "Visualizador", "owner": "Administrador"}


def _send_team_invite_email(invite, raw_token: str, company: Company, inviter: User) -> None:
    """Email a teammate their invite link. Never blocks the request."""
    try:
        base = (settings.FRONTEND_URL or "https://parvagas.pt").rstrip("/")
        link = f"{base}/Signup?role=company&inviteToken={raw_token}"
        send_templated_email.delay("send_team_invite_email", {
            "email": invite.email,
            "company_name": company.name,
            "inviter_name": (getattr(inviter, "full_name", "") or ""),
            "invite_link": link,
            "role": _ROLE_PT.get(invite.role, invite.role),
        })
    except Exception as e:
        logger.warning(f"Could not enqueue team invite email: {e}")


def _ensure_admin(current_user: User) -> User:
    if current_user.role != UserRole.admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    return current_user


def _require_company(db: Session, current_user: User) -> Company:
    """Resolve the company the current user has a seat on (owner or invited
    team member), or 404. See app.services.company_access_service for why
    the owner-only check this used to be was a real bug."""
    return resolve_company_for_user(db, current_user)


def _to_text_list(value: Any) -> Optional[str]:
    """Normalize incoming list/multiline-string job fields to a JSON list string."""
    if value is None:
        return None
    if isinstance(value, list):
        items = [str(v).strip() for v in value if str(v).strip()]
    else:
        items = [line.strip() for line in str(value).splitlines() if line.strip()]
    return json.dumps(items, ensure_ascii=True) if items else None


def _apply_job_payload(job: Job, payload: dict[str, Any]) -> None:
    """Apply create/update payload (frontend camelCase) onto a Job row."""
    simple = {
        "title": "title",
        "description": "description",
        "category": "category",
        "location": "location",
        "workMode": "work_mode",
        "contractType": "contract_type",
        "jobType": "job_type",
        "salaryRange": "salary_range",
        "experienceLevel": "experience_level",
        "requiredExperienceYears": "required_experience_years",
        "visibility": "visibility",
    }
    for key, attr in simple.items():
        if key in payload and payload[key] is not None:
            setattr(job, attr, payload[key])

    for key, attr in (
        ("responsibilities", "responsibilities"),
        ("requirements", "requirements"),
        ("requiredSkills", "required_skills"),
        ("preferredSkills", "preferred_skills"),
        ("languages", "languages"),
    ):
        if key in payload:
            setattr(job, attr, _to_text_list(payload[key]))


def _serialize_company_profile(company: Company) -> dict[str, Any]:
    """camelCase shape the Perfil page actually reads — the previous
    response_model=CompanyProfileResponse returned raw snake_case ORM
    attribute names (logo_url, owner_user_id, ...), which the frontend's
    `profile.logo` / `profile.ownerUserId` reads never matched, so even a
    successful save looked like it hadn't persisted on the next load."""
    return {
        "_id": company.id,
        "ownerUserId": company.owner_user_id,
        "name": company.name,
        "legalName": company.legal_name,
        "nif": company.nif,
        "phone": company.phone,
        "email": company.email,
        "contactEmail": company.email,
        "contactPhone": company.phone,
        "website": company.website,
        "status": company.status,
        "verificationStatus": "verified" if company.status == "active" else company.status,
        "description": company.description,
        "logo": StorageService.resolve_public_url(company.logo_url),
        "angolanizacao": bool(company.angolanizacao),
        "industry": company.industry,
        "size": company.size,
        "location": company.location,
    }


# frontend camelCase key -> Company ORM attribute. contactEmail/contactPhone
# are aliases onto the same email/phone columns (no separate "hiring
# contact" concept exists yet) — see companion migration 20260723_0065 for
# industry/size/location, which previously had no backing column at all.
_COMPANY_PROFILE_FIELD_MAP = {
    "name": "name",
    "legalName": "legal_name",
    "nif": "nif",
    "phone": "phone",
    "email": "email",
    "contactEmail": "email",
    "contactPhone": "phone",
    "website": "website",
    "description": "description",
    "angolanizacao": "angolanizacao",
    "industry": "industry",
    "size": "size",
    "location": "location",
}


def _apply_company_profile_payload(company: Company, payload: dict[str, Any]) -> None:
    for key, attr in _COMPANY_PROFILE_FIELD_MAP.items():
        if key in payload and payload[key] is not None:
            setattr(company, attr, payload[key])


@router.get("/profile")
async def get_company_profile(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get current company profile."""
    company = _require_company(db, current_user)
    return {"company": _serialize_company_profile(company)}


@router.put("/profile")
async def update_company_profile(
    payload: dict[str, Any],
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Update company profile. Owner-only — company branding/legal/contact
    info is treated at the same sensitivity level as billing."""
    company = _require_company(db, current_user)
    require_role(db, current_user, company, {"owner"})
    _apply_company_profile_payload(company, payload)
    db.commit()
    db.refresh(company)
    return {"company": _serialize_company_profile(company)}


@router.patch("/tutorial/seen")
async def mark_company_tutorial_seen(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Mark the company onboarding guide as seen for the current user's company."""
    company = resolve_company_for_user_or_none(db, current_user)
    if company:
        company.has_seen_tutorial = True
        db.commit()
    # Idempotent success even if no company yet (e.g. mid-onboarding).
    return {"hasSeenTutorial": True}


@router.get("/applications")
async def get_company_applications(
    page: int = 1,
    limit: int = 20,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List applications associated with jobs owned by the current company account."""
    return await list_company_applications(page=page, limit=limit, db=db, current_user=current_user)


@router.patch("/{company_id}/verification")
async def update_company_verification(
    company_id: str,
    payload: dict[str, Any],
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update a company verification status from admin panel."""
    _ensure_admin(current_user)

    company = db.query(Company).filter(Company.id == company_id).first()
    if not company:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Company not found")

    previous_status = company.status
    next_status = str(payload.get("status") or payload.get("verificationStatus") or "").strip()
    if next_status:
        company.status = next_status

    db.commit()
    db.refresh(company)

    # Notify the company owner when the verification outcome changes.
    if next_status and next_status != previous_status:
        try:
            owner = db.query(User).filter(User.id == company.owner_user_id).first() if company.owner_user_id else None
            if owner and company.status == "active":
                if owner.email:
                    send_templated_email.delay("send_company_verified_email", {
                        "email": owner.email, "company_name": company.name,
                    })
                create_notification(
                    db, owner.id, type="company_verified",
                    title="Empresa verificada",
                    body=f"{company.name} foi verificada. Já pode publicar vagas.",
                    link="/Portal/Empresa/Dashboard",
                )
            elif owner and company.status in ("rejected", "suspended"):
                if owner.email:
                    method = "send_company_suspended_email" if company.status == "suspended" else "send_company_rejected_email"
                    send_templated_email.delay(method, {
                        "email": owner.email, "company_name": company.name,
                        "reason": str(payload.get("reason", "") or ""),
                    })
                create_notification(
                    db, owner.id,
                    type="company_suspended" if company.status == "suspended" else "company_rejected",
                    title="Empresa suspensa" if company.status == "suspended" else "Verificação rejeitada",
                    body=(f"A conta de {company.name} foi suspensa." if company.status == "suspended"
                          else f"A verificação de {company.name} foi rejeitada.")
                          + (f" Motivo: {payload.get('reason')}" if payload.get("reason") else ""),
                )
        except Exception as e:
            logger.warning(f"Could not enqueue company verification email: {e}")

    return {
        "company": {
            "_id": company.id,
            "name": company.name,
            "status": company.status,
            "verificationStatus": "verified" if company.status == "active" else company.status,
            "updatedAt": datetime.utcnow().isoformat(),
        }
    }


@router.get("/deletion-requests")
async def list_deletion_requests(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """List pending deletion requests for super-admin review."""
    _ensure_admin(current_user)

    admin_level = getattr(current_user, "admin_level", "moderator")
    if admin_level != "super-admin":
        return {"requests": []}

    pending = (
        db.query(CompanyDeletionRequest)
        .filter(CompanyDeletionRequest.status == "pending_admin_approval")
        .order_by(CompanyDeletionRequest.created_at.desc())
        .all()
    )
    return {"requests": [_to_deletion_request_record(db, entry) for entry in pending]}


@router.post("/{company_id}/deletion-request")
async def create_deletion_request(
    company_id: str,
    payload: dict[str, Any],
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create or directly apply a company deletion request."""
    admin = _ensure_admin(current_user)
    company = db.query(Company).filter(Company.id == company_id).first()
    if not company:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Company not found")

    reason = str(payload.get("reason", "")).strip()
    if not reason:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Reason is required")

    admin_level = getattr(admin, "admin_level", "moderator")
    if admin_level == "super-admin":
        company.status = "rejected"
        db.commit()
        db.refresh(company)
        return {"mode": "direct", "companyId": company.id}

    entry = CompanyDeletionRequest(
        company_id=company.id,
        requested_by_user_id=admin.id,
        requested_by_admin_level=admin_level,
        reason=reason,
        status="pending_admin_approval",
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return {"mode": "pending", "request": _to_deletion_request_record(db, entry)}


@router.patch("/deletion-requests/{request_id}/review")
async def review_deletion_request(
    request_id: str,
    payload: dict[str, Any],
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Approve or reject a pending company deletion request."""
    admin = _ensure_admin(current_user)
    admin_level = getattr(admin, "admin_level", "moderator")
    if admin_level != "super-admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Super-admin required")

    entry = db.query(CompanyDeletionRequest).filter(CompanyDeletionRequest.id == request_id).first()
    if not entry:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Deletion request not found")

    decision = str(payload.get("decision", "")).strip().lower()
    if decision not in {"approve", "reject"}:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid decision")

    entry.status = "approved" if decision == "approve" else "rejected"
    entry.reviewed_by_user_id = admin.id
    entry.reviewed_at = datetime.utcnow()
    entry.review_note = str(payload.get("reviewNote", "")).strip() or None

    if decision == "approve":
        company = db.query(Company).filter(Company.id == entry.company_id).first()
        if company:
            company.status = "rejected"

    db.commit()
    db.refresh(entry)
    record = _to_deletion_request_record(db, entry)
    record["reviewedBy"] = {"fullName": admin.full_name, "email": admin.email}
    return {"request": record}


@router.post("/{company_id}/verification/preview-email")
async def preview_verification_email(
    company_id: str,
    payload: dict[str, Any],
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Build an email preview for company verification workflow."""
    _ensure_admin(current_user)
    company = db.query(Company).filter(Company.id == company_id).first()
    if not company:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Company not found")

    email_type = str(payload.get("type", "approval"))
    subject_by_type = {
        "approval": "Aprovacao da empresa no Parvagas",
        "more_info": "Pedido de informacao adicional",
        "rejected": "Atualizacao sobre a verificacao da empresa",
        "inactive": "Conta de empresa inativada",
    }
    subject = subject_by_type.get(email_type, "Atualizacao de verificacao")
    body = (
        f"Ola, {company.name}.\n\n"
        f"Esta e uma pre-visualizacao de email ({email_type}) gerada no painel admin.\n\n"
        "Equipa Parvagas"
    )

    return {
        "preview": {
            "subject": subject,
            "body": body,
            "toEmail": company.email or "",
        }
    }


@router.post("/{company_id}/verification/send-email")
async def send_verification_email(
    company_id: str,
    payload: dict[str, Any],
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Send the admin-edited verification-workflow email (approval, more
    info, rejection, deactivation) to the company's contact address. The
    admin UI's preview-then-send flow lets subject/body be freely edited
    before this is called, so both are sent verbatim rather than re-derived
    from `type`."""
    _ensure_admin(current_user)
    company = db.query(Company).filter(Company.id == company_id).first()
    if not company:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Company not found")

    to_email = (company.email or "").strip()
    if not to_email:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="A empresa não tem um email de contacto definido")
    subject = str(payload.get("subject", "")).strip() or "Atualização de verificação"
    body = str(payload.get("body", "")).strip()

    send_templated_email.delay("send_company_verification_email", {
        "email": to_email, "subject": subject, "body": body,
    })

    return {
        "queued": True,
        "companyId": company.id,
        "toEmail": to_email,
        "subject": subject,
        "sentAt": datetime.utcnow().isoformat(),
    }


# ── Company job postings ────────────────────────────────────────────────────

@router.get("/jobs")
async def list_company_jobs(
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1, le=100),
    status_filter: Optional[str] = Query(default=None, alias="status"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List jobs posted by the current user's company."""
    company = _require_company(db, current_user)
    query = db.query(Job).options(joinedload(Job.company)).filter(Job.company_id == company.id)
    if status_filter and status_filter != "all":
        query = query.filter(Job.status == status_filter)

    total = query.count()
    rows = (
        query.order_by(Job.created_at.desc())
        .offset((page - 1) * limit)
        .limit(limit)
        .all()
    )
    pagination = {
        "page": page,
        "limit": limit,
        "total": total,
        "totalPages": max(1, (total + limit - 1) // limit),
    }

    # One grouped count query for the whole page rather than N+1 per job —
    # Minhas-Vagas has always advertised "acompanhe desempenho de vagas"
    # but had no applicant signal at all on the job list itself.
    job_ids = [j.id for j in rows]
    counts_by_job: dict[str, int] = {}
    if job_ids:
        from sqlalchemy import func as _func
        for job_id, count in (
            db.query(JobApplication.job_id, _func.count(JobApplication.id))
            .filter(JobApplication.job_id.in_(job_ids))
            .group_by(JobApplication.job_id)
            .all()
        ):
            counts_by_job[job_id] = count

    jobs_payload = []
    for j in rows:
        payload = serialize_job(j, detail=True)
        payload["applicationCount"] = counts_by_job.get(j.id, 0)
        jobs_payload.append(payload)

    # Quota was previously only revealed as a 402 at job-creation time —
    # surfaced here too so Minhas-Vagas can show "X of Y slots used" before
    # a company ever hits the wall. _ACTIVE_JOB_STATUSES mirrors
    # assert_job_quota's own definition of "counts toward the cap".
    from app.services.company_billing_service import get_company_plan_code, get_job_plan_limit, _ACTIVE_JOB_STATUSES
    active_jobs = db.query(Job).filter(Job.company_id == company.id, Job.status.in_(_ACTIVE_JOB_STATUSES)).count()
    max_active_jobs = get_job_plan_limit(db, get_company_plan_code(db, company.id))

    return {
        "jobs": jobs_payload, **pagination, "pagination": pagination,
        "quota": {"activeJobs": active_jobs, "maxActiveJobs": max_active_jobs},
    }


@router.post("/jobs")
async def create_company_job(
    payload: dict[str, Any],
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a job posting (enters the moderation queue). Owner/recruiter
    only — a viewer seat is read-only."""
    company = _require_company(db, current_user)
    require_role(db, current_user, company, {"owner", "recruiter"})
    assert_job_quota(db, company)
    if not str(payload.get("title", "")).strip():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Job title is required")

    job = Job(company_id=company.id, status="pending_platform_review", visibility="public")
    _apply_job_payload(job, payload)
    # Scam/spam screening — feeds the admin moderation queue.
    score, flags = _spam_assessment(
        " ".join(str(payload.get(k, "")) for k in ("title", "description", "responsibilities", "requirements"))
    )
    job.spam_score = score
    job.spam_flags = json.dumps(flags, ensure_ascii=True) if flags else None
    db.add(job)
    db.commit()
    db.refresh(job)

    # Alert admins that a job is awaiting review.
    try:
        for admin_email in admin_emails(db):
            send_templated_email.delay("send_admin_job_pending_email", {
                "email": admin_email, "job_title": job.title or "(sem título)",
                "company_name": company.name,
            })
        notify_admins(
            db, type="job_pending_review",
            title="Vaga pendente de revisão",
            body=f"{company.name} submeteu \"{job.title or '(sem título)'}\" para moderação.",
            link="/Portal/Admin/jobs",
        )
    except Exception as e:
        logger.warning(f"Could not enqueue admin job-pending alert: {e}")

    return {"job": serialize_job(job, detail=True), "spamScore": score, "spamFlags": flags}


@router.post("/jobs/{job_id}/duplicate")
async def duplicate_company_job(
    job_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Pre-fill a new job posting from an existing one — for recruiters
    posting several similar roles a month who'd otherwise retype the whole
    form (title, description, responsibilities, requirements, skills) from
    scratch every time. Copies every editable field serialize_job exposes;
    enters moderation like any other new posting, same job-quota check.
    Owner/recruiter only."""
    company = _require_company(db, current_user)
    require_role(db, current_user, company, {"owner", "recruiter"})
    source = db.query(Job).filter(Job.id == job_id, Job.company_id == company.id).first()
    if not source:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")
    assert_job_quota(db, company)

    payload = serialize_job(source, detail=True)
    payload["title"] = f"{(source.title or 'Vaga').strip()} (cópia)"

    job = Job(company_id=company.id, status="pending_platform_review", visibility="public")
    _apply_job_payload(job, payload)
    score, flags = _spam_assessment(
        " ".join(str(payload.get(k, "")) for k in ("title", "description", "responsibilities", "requirements"))
    )
    job.spam_score = score
    job.spam_flags = json.dumps(flags, ensure_ascii=True) if flags else None
    db.add(job)
    db.commit()
    db.refresh(job)

    return {"job": serialize_job(job, detail=True), "spamScore": score, "spamFlags": flags}


@router.patch("/jobs/{job_id}")
async def update_company_job(
    job_id: str,
    payload: dict[str, Any],
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update a job owned by the current user's company. Owner/recruiter
    only."""
    company = _require_company(db, current_user)
    require_role(db, current_user, company, {"owner", "recruiter"})
    job = db.query(Job).filter(Job.id == job_id, Job.company_id == company.id).first()
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")

    _apply_job_payload(job, payload)
    db.commit()
    db.refresh(job)
    return {"job": serialize_job(job, detail=True)}


@router.delete("/jobs/{job_id}")
async def delete_company_job(
    job_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Archive (soft delete) a job owned by the current user's company.
    Owner/recruiter only."""
    company = _require_company(db, current_user)
    require_role(db, current_user, company, {"owner", "recruiter"})
    job = db.query(Job).filter(Job.id == job_id, Job.company_id == company.id).first()
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")
    job.status = "archived"
    db.commit()
    return {"deleted": True, "jobId": job_id}


# ── Employer analytics ──────────────────────────────────────────────────────

@router.get("/analytics")
async def company_analytics(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Funnel + reach metrics for the current company."""
    from sqlalchemy import func

    company = _require_company(db, current_user)
    jobs = db.query(Job).filter(Job.company_id == company.id).all()
    job_ids = [j.id for j in jobs]
    total_views = sum(j.views or 0 for j in jobs)
    live = sum(1 for j in jobs if j.status in ("approved", "published", "active"))

    apps_by_status: dict[str, int] = {}
    total_apps = 0
    if job_ids:
        rows = (
            db.query(JobApplication.status, func.count())
            .filter(JobApplication.company_id == company.id)
            .group_by(JobApplication.status)
            .all()
        )
        for s, c in rows:
            apps_by_status[str(s)] = int(c)
            total_apps += int(c)

    # Per-job applicant counts, batched — the only company-wide analytics that
    # used to exist here was a single summed total, so a company running
    # several live postings had no way to see which ones were converting.
    apps_by_job: dict[str, int] = {}
    if job_ids:
        for jid, c in (
            db.query(JobApplication.job_id, func.count(JobApplication.id))
            .filter(JobApplication.job_id.in_(job_ids))
            .group_by(JobApplication.job_id)
            .all()
        ):
            apps_by_job[jid] = int(c)

    top_jobs = sorted(jobs, key=lambda j: (j.views or 0), reverse=True)[:5]
    apply_rate = round((total_apps / total_views) * 100, 1) if total_views else 0.0

    def _job_breakdown(j: Job) -> dict[str, Any]:
        j_views = j.views or 0
        j_apps = apps_by_job.get(j.id, 0)
        return {
            "_id": j.id, "title": j.title, "views": j_views, "applications": j_apps,
            "conversionPct": round((j_apps / j_views) * 100, 1) if j_views else 0.0,
        }

    return {
        "totals": {"jobs": len(jobs), "liveJobs": live, "views": total_views, "applications": total_apps},
        "applyRatePct": apply_rate,
        "applicationsByStatus": [{"label": k, "value": v} for k, v in apps_by_status.items()],
        "topJobs": [_job_breakdown(j) for j in top_jobs],
    }


# ── Team management ─────────────────────────────────────────────────────────

def _serialize_member(m: CompanyMember, user: User | None) -> dict[str, Any]:
    return {
        "_id": m.id,
        "userId": m.user_id,
        "role": m.role,
        "fullName": user.full_name if user else None,
        "email": user.email if user else None,
    }


@router.get("/team")
async def company_team(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    company = _require_company(db, current_user)
    members = db.query(CompanyMember).filter(CompanyMember.company_id == company.id).all()
    out = []
    for m in members:
        u = db.query(User).filter(User.id == m.user_id).first()
        out.append(_serialize_member(m, u))
    # Always include the owner.
    owner = db.query(User).filter(User.id == company.owner_user_id).first()
    if owner and not any(m["userId"] == owner.id for m in out):
        out.insert(0, {"_id": "owner", "userId": owner.id, "role": "owner",
                       "fullName": owner.full_name, "email": owner.email})
    return {"members": out, "ownerUserId": company.owner_user_id}


@router.get("/team/invites")
async def company_team_invites(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    company = _require_company(db, current_user)
    invites = (
        db.query(CompanyInvite)
        .filter(CompanyInvite.company_id == company.id, CompanyInvite.status == "pending")
        .order_by(CompanyInvite.created_at.desc())
        .all()
    )
    return {"invites": [
        {"_id": i.id, "email": i.email, "role": i.role, "status": i.status,
         "expiresAt": i.expires_at.isoformat() if i.expires_at else None,
         "createdAt": i.created_at.isoformat() if i.created_at else None}
        for i in invites
    ]}


@router.post("/team/invite")
async def company_team_invite(
    payload: dict[str, Any],
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    company = _require_company(db, current_user)
    email = str(payload.get("email", "")).strip().lower()
    if not email or "@" not in email:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email válido é obrigatório")
    role = str(payload.get("role", "recruiter")).strip().lower()
    if role not in {"recruiter", "viewer", "owner"}:
        role = "recruiter"
    raw = create_verification_token()
    invite = CompanyInvite(
        company_id=company.id, email=email, role=role,
        token_hash=hash_token(raw), status="pending",
        expires_at=datetime.utcnow() + timedelta(days=7),
    )
    db.add(invite)
    db.commit()
    db.refresh(invite)
    _send_team_invite_email(invite, raw, company, current_user)
    return {"invite": {"_id": invite.id, "email": invite.email, "role": invite.role, "status": invite.status},
            "emailDelivery": {"status": "queued"}}


@router.patch("/team/members/{member_id}/role")
async def company_team_member_role(
    member_id: str,
    payload: dict[str, Any],
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    company = _require_company(db, current_user)
    new_role = str(payload.get("teamRole") or payload.get("role") or "").strip().lower()
    if new_role not in {"recruiter", "viewer", "owner"}:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Role inválida")
    m = db.query(CompanyMember).filter(CompanyMember.id == member_id, CompanyMember.company_id == company.id).first()
    if not m:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member not found")
    m.role = new_role
    db.commit()
    db.refresh(m)
    u = db.query(User).filter(User.id == m.user_id).first()
    return {"member": _serialize_member(m, u)}


@router.post("/team/invites/{invite_id}/resend")
async def company_team_invite_resend(
    invite_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    company = _require_company(db, current_user)
    invite = db.query(CompanyInvite).filter(CompanyInvite.id == invite_id, CompanyInvite.company_id == company.id).first()
    if not invite:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invite not found")
    invite.status = "pending"
    invite.expires_at = datetime.utcnow() + timedelta(days=7)
    raw = create_verification_token()  # re-issue so the resent link is valid
    invite.token_hash = hash_token(raw)
    db.commit()
    _send_team_invite_email(invite, raw, company, current_user)
    return {"invite": {"_id": invite.id, "email": invite.email, "role": invite.role, "status": invite.status},
            "emailDelivery": {"status": "queued"}}


@router.post("/team/invites/{invite_id}/revoke")
async def company_team_invite_revoke(
    invite_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    company = _require_company(db, current_user)
    invite = db.query(CompanyInvite).filter(CompanyInvite.id == invite_id, CompanyInvite.company_id == company.id).first()
    if not invite:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invite not found")
    invite.status = "revoked"
    db.commit()
    return {"invite": {"_id": invite.id, "status": invite.status}}


@router.delete("/team/members/{member_id}")
async def company_team_remove_member(
    member_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    company = _require_company(db, current_user)
    m = db.query(CompanyMember).filter(CompanyMember.id == member_id, CompanyMember.company_id == company.id).first()
    if not m:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member not found")
    db.delete(m)
    db.commit()
    return {"deleted": True, "memberId": member_id}


# ── Activity timeline, logo, approvals, presence ────────────────────────────

@router.get("/audit-timeline")
async def company_audit_timeline(
    page: int = 1,
    limit: int = 20,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Lightweight activity timeline derived from the company's jobs & applications."""
    company = _require_company(db, current_user)
    entries: list[dict[str, Any]] = []
    for j in db.query(Job).filter(Job.company_id == company.id).order_by(Job.created_at.desc()).limit(30).all():
        entries.append({
            "_id": f"job-{j.id}", "action": "job.created", "resourceType": "job",
            "resourceId": j.id, "details": {"title": j.title, "status": j.status},
            "createdAt": j.created_at.isoformat() if j.created_at else None,
        })
    for a in db.query(JobApplication).filter(JobApplication.company_id == company.id).order_by(JobApplication.created_at.desc()).limit(30).all():
        entries.append({
            "_id": f"app-{a.id}", "action": "application.received", "resourceType": "application",
            "resourceId": a.id, "details": {"candidate": a.applicant_full_name, "status": a.status},
            "createdAt": a.created_at.isoformat() if a.created_at else None,
        })
    entries.sort(key=lambda e: e["createdAt"] or "", reverse=True)
    total = len(entries)
    start = (page - 1) * limit
    return {"entries": entries[start:start + limit],
            "pagination": {"page": page, "limit": limit, "total": total, "totalPages": max(1, (total + limit - 1) // limit)}}


@router.post("/profile/logo")
async def upload_company_logo(
    logo: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Upload/replace the company logo."""
    company = _require_company(db, current_user)
    ext = _Path(logo.filename or "").suffix.lower() or ".png"
    if ext not in {".png", ".jpg", ".jpeg", ".webp", ".svg"}:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Formato de imagem não suportado")
    data = await logo.read()
    path = StorageService.save_file(data, f"company-logo-{company.id}{ext}")
    company.logo_url = path
    db.commit()
    return {"company": {"_id": company.id, "logoUrl": company.logo_url}, "logoUrl": company.logo_url}


@router.get("/job-approvals")
async def company_job_approvals(
    page: int = 1,
    limit: int = 20,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Internal approval queue: company jobs awaiting platform review."""
    company = _require_company(db, current_user)
    q = db.query(Job).filter(Job.company_id == company.id, Job.status == "pending_platform_review")
    total = q.count()
    rows = q.order_by(Job.created_at.desc()).offset((page - 1) * limit).limit(limit).all()
    approvals = [
        {"_id": j.id, "jobId": j.id, "title": j.title, "status": j.status,
         "createdAt": j.created_at.isoformat() if j.created_at else None}
        for j in rows
    ]
    return {"approvals": approvals,
            "pagination": {"page": page, "limit": limit, "total": total, "totalPages": max(1, (total + limit - 1) // limit)}}


@router.patch("/job-approvals/{job_id}/review")
async def company_job_approval_review(
    job_id: str,
    payload: dict[str, Any],
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    company = _require_company(db, current_user)
    job = db.query(Job).filter(Job.id == job_id, Job.company_id == company.id).first()
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")
    decision = str(payload.get("decision") or payload.get("status") or "").strip().lower()
    if decision in {"approve", "approved"}:
        job.status = "approved"
        job.published_at = job.published_at or datetime.utcnow()
    elif decision in {"reject", "rejected"}:
        job.status = "rejected"
    db.commit()
    return {"approval": {"_id": job.id, "status": job.status}}


@router.post("/presence/heartbeat")
async def company_presence_heartbeat(current_user: User = Depends(get_current_user)):
    return {"onlineUsersCount": 1, "isDoubleLogged": False}


@router.get("/presence/status")
async def company_presence_status(current_user: User = Depends(get_current_user)):
    return {"onlineUsersCount": 1, "isDoubleLogged": False}
