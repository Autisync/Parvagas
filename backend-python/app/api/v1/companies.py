"""Company API endpoints."""
from datetime import datetime, timedelta
from typing import Any, Optional
import json
import re
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session, joinedload
from app.db.session import get_db
from app.models import (
    User, Company, UserRole, Job, JobApplication, CompanyMember, CompanyInvite,
)
from app.api.v1.applications import list_company_applications
from app.api.v1.jobs import serialize_job
from app.schemas import CompanyProfileResponse, CompanyProfileUpdateRequest
from app.core.logging import get_logger
from app.core.security import create_verification_token, hash_token
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
router = APIRouter(prefix="/companies", tags=["companies"])

_deletion_requests: list[dict[str, Any]] = []


def _ensure_admin(current_user: User) -> User:
    if current_user.role != UserRole.admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    return current_user


def _require_company(db: Session, current_user: User) -> Company:
    """Resolve the company owned by the current user, or 404."""
    company = db.query(Company).filter(Company.owner_user_id == current_user.id).first()
    if not company:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Company not found")
    return company


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


@router.get("/profile", response_model=CompanyProfileResponse)
async def get_company_profile(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get current company profile."""
    company = db.query(Company).filter(
        Company.owner_user_id == current_user.id
    ).first()
    
    if not company:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Company not found")
    
    return company


@router.put("/profile", response_model=CompanyProfileResponse)
async def update_company_profile(
    request: CompanyProfileUpdateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Update company profile."""
    company = db.query(Company).filter(
        Company.owner_user_id == current_user.id
    ).first()
    
    if not company:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Company not found")
    
    # Update fields
    update_data = request.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(company, key, value)
    
    db.commit()
    db.refresh(company)
    
    return company


@router.patch("/tutorial/seen")
async def mark_company_tutorial_seen(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Mark the company onboarding guide as seen for the current user's company."""
    company = db.query(Company).filter(Company.owner_user_id == current_user.id).first()
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

    next_status = str(payload.get("status") or payload.get("verificationStatus") or "").strip()
    if next_status:
        company.status = next_status

    db.commit()
    db.refresh(company)

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
async def list_deletion_requests(current_user: User = Depends(get_current_user)):
    """List pending deletion requests for super-admin review."""
    _ensure_admin(current_user)

    admin_level = getattr(current_user, "admin_level", "moderator")
    if admin_level != "super-admin":
        return {"requests": []}

    pending = [entry for entry in _deletion_requests if entry.get("status") == "pending_admin_approval"]
    return {"requests": pending}


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

    request_entry = {
        "_id": str(uuid.uuid4()),
        "companyId": company.id,
        "reason": reason,
        "requestedByAdminLevel": admin_level,
        "createdAt": datetime.utcnow().isoformat(),
        "status": "pending_admin_approval",
        "company": {
            "_id": company.id,
            "name": company.name,
            "status": company.status,
            "verificationStatus": "verified" if company.status == "active" else company.status,
            "contactEmail": company.email,
            "createdAt": company.created_at.isoformat() if company.created_at else None,
        },
        "requestedBy": {
            "fullName": admin.full_name,
            "email": admin.email,
        },
    }
    _deletion_requests.append(request_entry)
    return {"mode": "pending", "request": request_entry}


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

    request_entry = next((entry for entry in _deletion_requests if entry.get("_id") == request_id), None)
    if not request_entry:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Deletion request not found")

    decision = str(payload.get("decision", "")).strip().lower()
    if decision not in {"approve", "reject"}:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid decision")

    request_entry["status"] = "approved" if decision == "approve" else "rejected"
    request_entry["reviewedAt"] = datetime.utcnow().isoformat()
    request_entry["reviewedBy"] = {"fullName": admin.full_name, "email": admin.email}
    request_entry["reviewNote"] = str(payload.get("reviewNote", "")).strip()

    if decision == "approve":
        company_id = str(request_entry.get("companyId", ""))
        company = db.query(Company).filter(Company.id == company_id).first()
        if company:
            company.status = "rejected"
            db.commit()

    return {"request": request_entry}


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
    """Accept send-email request from admin UI (placeholder success response)."""
    _ensure_admin(current_user)
    company = db.query(Company).filter(Company.id == company_id).first()
    if not company:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Company not found")

    return {
        "queued": True,
        "companyId": company.id,
        "toEmail": company.email or "",
        "subject": str(payload.get("subject", "")),
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
    return {"jobs": [serialize_job(j, detail=True) for j in rows], **pagination, "pagination": pagination}


@router.post("/jobs")
async def create_company_job(
    payload: dict[str, Any],
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a job posting (enters the moderation queue)."""
    company = _require_company(db, current_user)
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
    return {"job": serialize_job(job, detail=True), "spamScore": score, "spamFlags": flags}


@router.patch("/jobs/{job_id}")
async def update_company_job(
    job_id: str,
    payload: dict[str, Any],
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update a job owned by the current user's company."""
    company = _require_company(db, current_user)
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
    """Archive (soft delete) a job owned by the current user's company."""
    company = _require_company(db, current_user)
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

    top_jobs = sorted(jobs, key=lambda j: (j.views or 0), reverse=True)[:5]
    apply_rate = round((total_apps / total_views) * 100, 1) if total_views else 0.0
    return {
        "totals": {"jobs": len(jobs), "liveJobs": live, "views": total_views, "applications": total_apps},
        "applyRatePct": apply_rate,
        "applicationsByStatus": [{"label": k, "value": v} for k, v in apps_by_status.items()],
        "topJobs": [{"_id": j.id, "title": j.title, "views": j.views or 0} for j in top_jobs],
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
    # Email delivery is best-effort and handled by the notification layer.
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
