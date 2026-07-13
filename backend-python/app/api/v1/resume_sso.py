"""Guest "Criar CV do Zero" entry point for the native CV builder.

Historical note: this module used to also host an OIDC bridge (Parvagas as
identity provider for the self-hosted Reactive Resume instance at
cv.parvagas.pt) — /oauth/authorize, /oauth/token, /oauth/userinfo,
/.well-known/openid-configuration, and POST /resume-sso/handoff. That
external CV builder has been fully replaced by the native one built inside
this portal (EXECUTION_PLAN_NATIVE_CV_BUILDER.md); the bridge had no live
caller since Phase A shipped (A5) and was removed in A7's cleanup pass —
see REACTIVE_RESUME_DECOMMISSION_GUIDE.md and git history for the OIDC
code if it's ever needed for reference.

`guest_start` below is unrelated to that bridge and stays: it's a plain
JWT-issuing shadow-account endpoint (same find-or-create-by-email pattern
as the sibling guest CV-drop endpoint in jobs.py), used by
CVBuilderGuestForm.jsx to log a first-time visitor straight into
/Portal/Candidato/Construtor-CV — no external redirect involved.
"""
import json
import re
import secrets

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.logging import get_logger
from app.core.observability import limiter
from app.core.security import hash_password
from app.db.session import get_db
from app.models import AuditLog, CandidateProfile, User, UserRole
from app.schemas import UserResponse
from app.services.auth_service import AuthService
from app.workers.tasks import send_verification_email

settings = get_settings()
logger = get_logger(__name__)
router = APIRouter(tags=["resume-sso"])


def _audit(db: Session, *, action: str, user_id: str | None, extra: dict | None = None) -> None:
    """Durable audit row for the guest-start step. Never raises."""
    try:
        db.add(AuditLog(
            actor_user_id=user_id,
            action=action,
            resource_type="resume_sso",
            resource_id=user_id,
            details=json.dumps(extra or {}),
        ))
        db.commit()
    except Exception as e:  # pragma: no cover - defensive
        logger.warning(f"resume_sso audit ({action}) failed: {e}")
        db.rollback()


class GuestStartRequest(BaseModel):
    fullName: str
    email: str


def _split_name(full_name: str) -> tuple[str, str]:
    parts = full_name.strip().split(None, 1)
    if len(parts) == 2:
        return parts[0], parts[1]
    return (parts[0], "") if parts else ("", "")


@router.post("/public/resume-sso/guest-start")
@limiter.limit("5/hour")
async def guest_start(
    request: Request,
    payload: GuestStartRequest,
    db: Session = Depends(get_db),
):
    """"Build a CV from scratch" entry point for visitors with no account —
    same find-or-create-by-email shadow-account pattern as the sibling guest
    CV-drop endpoint (POST /public/cv-submissions in jobs.py), but skips the
    file upload/parse entirely. Returns a normal login response (access
    token + user, same shape as POST /auth/login) so the frontend can log
    the guest straight into the native CV builder. The account isn't a
    dead end — new users get a verification email and can claim a real
    password later via the existing forgot-password flow, exactly like
    today's guest CV-drop accounts."""
    full_name = payload.fullName.strip()
    email_norm = payload.email.strip().lower()
    if not full_name or not email_norm:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Nome completo e email são obrigatórios.")
    if not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", email_norm):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email inválido.")

    user = db.query(User).filter(User.email == email_norm).first()
    is_new_user = user is None
    if user and user.role != UserRole.candidate:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Este email já está associado a outro tipo de conta.")

    if not user:
        generated_password = secrets.token_urlsafe(18)
        user = User(
            email=email_norm, full_name=full_name,
            password_hash=hash_password(generated_password), role=UserRole.candidate,
            is_guest_account=True,
        )
        db.add(user)
        db.flush()

    profile = db.query(CandidateProfile).filter(CandidateProfile.user_id == user.id).first()
    if not profile:
        first_name, last_name = _split_name(full_name)
        profile = CandidateProfile(user_id=user.id, first_name=first_name, last_name=last_name)
        db.add(profile)
    db.flush()

    db.commit()

    if is_new_user:
        raw_token = AuthService.create_verification_token(db, user)
        send_verification_email.delay(str(user.id), raw_token)

    _audit(db, action="resume_sso.guest_start", user_id=user.id, extra={"isNewUser": is_new_user})

    token = AuthService.create_access_token(user)
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": UserResponse.model_validate(AuthService.build_user_response(db, user)),
        "isNewUser": is_new_user,
    }
