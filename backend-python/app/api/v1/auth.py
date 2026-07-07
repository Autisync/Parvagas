"""Authentication API endpoints."""
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session
import os
import json
import secrets
from datetime import datetime, timedelta
from app.db.session import get_db
from app.api.deps import get_current_user
from app.core.observability import limiter
from app.core.security import hash_token, hash_password
from app.services.notification_service import send_sms
from app.models import User, UserRole, OtpCode, CompanyInvite, CompanyMember, AuditLog, EmailVerificationToken
from app.schemas import (
    UserRegisterRequest, UserLoginRequest, AuthTokenResponse,
    UserResponse, EmailVerificationRequest, ResendVerificationRequest,
    ForgotPasswordRequest, ResetPasswordRequest, MessageResponse
)
from app.services.auth_service import AuthService
from app.services.email_service import EmailService
from app.workers.tasks import (
    send_verification_email, send_password_reset_email, send_welcome_email
)
from app.core.config import get_settings
from app.core.errors import ConflictError, ParavagasException, ValidationError
from app.core.logging import get_logger

logger = get_logger(__name__)
settings = get_settings()
router = APIRouter(prefix="/auth", tags=["auth"])

# Minimum time between verification-email sends for the SAME account. The
# @limiter.limit("5/hour") on the resend endpoint is per-IP, so it doesn't
# stop someone from hammering a single victim's inbox from different IPs —
# this closes that gap independent of where the request comes from.
VERIFICATION_RESEND_COOLDOWN_SECONDS = 60


def _verification_resend_wait_seconds(db: Session, user: User, now: datetime | None = None) -> int:
    """Seconds a caller must still wait before another verification email can
    be sent to this user (0 if none / cooldown already elapsed)."""
    now = now or datetime.utcnow()
    last = (
        db.query(EmailVerificationToken)
        .filter(EmailVerificationToken.user_id == user.id)
        .order_by(EmailVerificationToken.created_at.desc())
        .first()
    )
    if not last:
        return 0
    elapsed = (now - last.created_at).total_seconds()
    remaining = VERIFICATION_RESEND_COOLDOWN_SECONDS - elapsed
    return max(0, int(remaining))


def _audit(db: Session, *, action: str, user, ip: str | None = None, extra: dict | None = None) -> None:
    """Write a durable auth audit row. Never raises — auditing must not block auth."""
    try:
        details = {"ip": ip}
        if extra:
            details.update(extra)
        db.add(AuditLog(
            actor_user_id=str(user.id) if user is not None else None,
            actor_email=getattr(user, "email", None),
            action=action,
            resource_type="user",
            resource_id=str(user.id) if user is not None else None,
            details=json.dumps(details),
        ))
        db.commit()
    except Exception as e:  # pragma: no cover - defensive
        logger.warning(f"Audit log ({action}) failed: {e}")
        db.rollback()


def _friendly_auth_detail(detail: str) -> str:
    message = str(detail or "").strip()
    translations = {
        "Email already registered": "Este email ja esta registado. Inicie sessao ou recupere a password.",
        "Company identifier already registered": "Este NIF/identificador ja esta registado.",
        "Company name is required": "O nome da empresa e obrigatorio.",
        "Company identifier (NIF) must be 6-20 alphanumeric characters": "O NIF/identificador deve ter 6 a 20 caracteres alfanumericos.",
        "Invalid password reset token": "Token de recuperacao invalido.",
        "Password reset token expired": "O token de recuperacao expirou. Solicite um novo email.",
        "Token already used": "Este token ja foi utilizado. Solicite um novo email.",
        "Passwords do not match": "As passwords nao coincidem.",
    }
    return translations.get(message, message or "Nao foi possivel concluir a operacao.")


@router.post("/register", response_model=MessageResponse)
@limiter.limit("10/hour")
async def register(
    request: Request,
    payload: UserRegisterRequest,
    db: Session = Depends(get_db)
):
    """Register a new user."""
    from app.core.captcha import verify_captcha
    _ip = request.client.host if request.client else None
    if not await verify_captcha(request.headers.get("x-captcha-token"), action="register", remote_ip=_ip):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Verificação anti-robô falhou. Tente novamente.")
    try:
        # Register user
        user = AuthService.register_user(
            db=db,
            email=payload.email,
            password=payload.password,
            full_name=payload.full_name,
            role=payload.role,
            company_name=payload.company_name,
            company_legal_name=payload.company_legal_name,
            nif=payload.nif,
        )
        
        # Create verification token
        raw_token = AuthService.create_verification_token(db, user)
        
        # Send verification email async
        send_verification_email.delay(str(user.id), raw_token)

        # Alert admins when a new company registers and awaits verification.
        if str(payload.role) == "company" or getattr(payload.role, "value", "") == "company":
            try:
                from app.workers.tasks import send_templated_email
                from app.services.notification_service import admin_emails
                for admin_email in admin_emails(db):
                    send_templated_email.delay("send_admin_company_pending_email", {
                        "email": admin_email, "company_name": payload.company_name or user.full_name,
                    })
            except Exception as e:
                logger.warning(f"Could not enqueue admin company-pending alert: {e}")

        return {"message": "Registration successful. Please check your email to verify your account."}
    
    except (ConflictError, ValidationError, ParavagasException) as e:
        logger.error(f"Registration error: {str(e)}")
        raise HTTPException(status_code=e.status_code, detail=_friendly_auth_detail(e.detail))
    except Exception as e:
        logger.error(f"Registration error: {str(e)}")
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Nao foi possivel criar a conta.")


@router.post("/login", response_model=AuthTokenResponse)
@limiter.limit("10/minute")
async def login(
    request: Request,
    payload: UserLoginRequest,
    db: Session = Depends(get_db)
):
    """Authenticate user and return access token."""
    from app.core.captcha import verify_captcha
    _ip = request.client.host if request.client else None
    if not await verify_captcha(request.headers.get("x-captcha-token"), action="login", remote_ip=_ip):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Verificação anti-robô falhou. Tente novamente.")
    try:
        user = AuthService.authenticate_user(
            db=db,
            email=payload.email,
            password=payload.password,
            role_hint=payload.role_hint
        )
        
        token = AuthService.create_access_token(user)
        _audit(db, action="auth.login", user=user, ip=_ip, extra={"method": "password"})

        return {
            "access_token": token,
            "token_type": "bearer",
            "user": UserResponse.model_validate(AuthService.build_user_response(db, user))
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Login error: {str(e)}")
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(e))


@router.post("/verify-email", response_model=MessageResponse)
async def verify_email(
    request: EmailVerificationRequest,
    db: Session = Depends(get_db)
):
    """Verify user email with token."""
    try:
        user = AuthService.verify_email(db, request.token)

        # Send welcome email only after email is successfully verified.
        send_welcome_email.delay(str(user.id))
        return {"message": "Email verified successfully. You can now log in."}
    
    except Exception as e:
        logger.error(f"Email verification error: {str(e)}")
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.post("/resend-verification-email", response_model=MessageResponse)
@limiter.limit("5/hour")
async def resend_verification_email(
    request: Request,
    payload: ResendVerificationRequest,
    db: Session = Depends(get_db)
):
    """Resend verification email to user."""
    try:
        user = db.query(User).filter(User.email == payload.email.lower()).first()
        
        if not user:
            # Don't reveal if email exists
            return {"message": "If an account exists with this email, a verification link has been sent."}
        
        if user.email_verified:
            return {"message": "This email is already verified."}

        wait_seconds = _verification_resend_wait_seconds(db, user)
        if wait_seconds > 0:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Aguarde {wait_seconds}s antes de pedir um novo email de verificação.",
            )

        # Create new verification token
        raw_token = AuthService.create_verification_token(db, user)
        
        # Send email async
        send_verification_email.delay(str(user.id), raw_token)
        
        return {"message": "Verification email sent. Please check your inbox."}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Resend verification error: {str(e)}")
        return {"message": "If an account exists with this email, a verification link has been sent."}


@router.post("/forgot-password", response_model=MessageResponse)
@limiter.limit("5/hour")
async def forgot_password(
    request: Request,
    payload: ForgotPasswordRequest,
    db: Session = Depends(get_db)
):
    """Initiate password reset process."""
    from app.core.captcha import verify_captcha
    _ip = request.client.host if request.client else None
    if not await verify_captcha(request.headers.get("x-captcha-token"), action="forgot_password", remote_ip=_ip):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Verificação anti-robô falhou. Tente novamente.")
    try:
        user = db.query(User).filter(User.email == payload.email.lower()).first()
        
        if not user:
            # Don't reveal if email exists
            return {"message": "If an account exists with this email, a password reset link has been sent."}
        
        # Create reset token
        raw_token = AuthService.create_password_reset_token(db, user)
        
        # Send email async
        send_password_reset_email.delay(str(user.id), raw_token)
        
        return {"message": "Password reset link sent. Please check your email."}
    
    except Exception as e:
        logger.error(f"Forgot password error: {str(e)}")
        return {"message": "If an account exists with this email, a password reset link has been sent."}


@router.post("/reset-password", response_model=MessageResponse)
@limiter.limit("10/hour")
async def reset_password(
    request: Request,
    payload: ResetPasswordRequest,
    db: Session = Depends(get_db)
):
    """Reset password with token."""
    from app.core.captcha import verify_captcha
    _ip = request.client.host if request.client else None
    if not await verify_captcha(request.headers.get("x-captcha-token"), action="reset_password", remote_ip=_ip):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Verificação anti-robô falhou. Tente novamente.")
    try:
        if payload.new_password != payload.confirm_password:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Passwords do not match"
            )

        user = AuthService.reset_password(db, payload.token, payload.new_password)
        return {"message": "Password reset successfully. You can now log in with your new password."}
    
    except (ValidationError, ParavagasException) as e:
        logger.error(f"Reset password error: {str(e)}")
        raise HTTPException(status_code=e.status_code, detail=_friendly_auth_detail(e.detail))
    except HTTPException as e:
        logger.error(f"Reset password error: {str(e)}")
        raise HTTPException(status_code=e.status_code, detail=_friendly_auth_detail(str(e.detail)))
    except Exception as e:
        logger.error(f"Reset password error: {str(e)}")
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Nao foi possivel redefinir a password.")


@router.post("/company-invite/accept", response_model=AuthTokenResponse)
async def accept_company_invite(payload: dict, db: Session = Depends(get_db)):
    """Accept a company team invite: create/attach the user as a company member."""
    token_raw = str(payload.get("inviteToken", "")).strip()
    if not token_raw:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Convite em falta")
    invite = (
        db.query(CompanyInvite)
        .filter(CompanyInvite.token_hash == hash_token(token_raw), CompanyInvite.status == "pending")
        .first()
    )
    if not invite or invite.expires_at < datetime.utcnow():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Convite inválido ou expirado")

    user = db.query(User).filter(User.email == invite.email.lower()).first()
    if not user:
        password = str(payload.get("password", "")).strip()
        if len(password) < 8:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Password deve ter pelo menos 8 caracteres")
        user = User(
            email=invite.email.lower(),
            full_name=str(payload.get("fullName", "")).strip() or invite.email.split("@")[0],
            password_hash=hash_password(password),
            role=UserRole.company, email_verified=True, email_verified_at=datetime.utcnow(),
        )
        db.add(user)
        db.flush()

    existing = (
        db.query(CompanyMember)
        .filter(CompanyMember.company_id == invite.company_id, CompanyMember.user_id == user.id)
        .first()
    )
    if not existing:
        db.add(CompanyMember(company_id=invite.company_id, user_id=user.id, role=invite.role))
    invite.status = "accepted"
    db.commit()
    db.refresh(user)
    token = AuthService.create_access_token(user)
    return {"access_token": token, "token_type": "bearer", "user": UserResponse.model_validate(AuthService.build_user_response(db, user))}


@router.post("/first-login-reset", response_model=AuthTokenResponse)
async def first_login_reset(payload: dict, db: Session = Depends(get_db)):
    """Force-reset a password on first login using a reset token, then sign in."""
    reset_token = str(payload.get("resetToken", "")).strip()
    new_password = str(payload.get("newPassword", "")).strip()
    if not reset_token or len(new_password) < 8:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Token ou password inválidos")
    try:
        user = AuthService.reset_password(db, reset_token, new_password)
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=_friendly_auth_detail(str(getattr(e, "detail", e))))
    token = AuthService.create_access_token(user)
    return {"access_token": token, "token_type": "bearer", "user": UserResponse.model_validate(AuthService.build_user_response(db, user))}


@router.get("/me", response_model=UserResponse)
async def get_me(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Return the authenticated user's profile."""
    return UserResponse.model_validate(AuthService.build_user_response(db, current_user))


@router.post("/logout", response_model=MessageResponse)
async def logout(current_user: User = Depends(get_current_user)):
    """Stateless logout — the client discards the token."""
    return {"message": "Logged out successfully."}


# ── Phone / OTP login (mobile-first market) ─────────────────────────────────

def _normalize_phone(raw: str) -> str:
    digits = "".join(ch for ch in str(raw or "") if ch.isdigit() or ch == "+")
    return digits


@router.post("/otp/request", response_model=None)
@limiter.limit("5/hour")
async def otp_request(request: Request, payload: dict, db: Session = Depends(get_db)):
    """Generate and send a one-time login code to a phone number."""
    from app.core.captcha import verify_captcha
    _ip = request.client.host if request.client else None
    if not await verify_captcha(request.headers.get("x-captcha-token"), action="otp_request", remote_ip=_ip):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Verificação anti-robô falhou. Tente novamente.")
    phone = _normalize_phone(payload.get("phone", ""))
    if len(phone) < 9:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Número de telefone inválido")
    code = f"{secrets.randbelow(900000) + 100000}"  # 6 digits
    db.add(OtpCode(
        phone=phone, code_hash=hash_token(code), purpose="login",
        expires_at=datetime.utcnow() + timedelta(minutes=10),
    ))
    db.commit()
    delivery = send_sms(phone, f"O seu código Parvagas é {code} (válido 10 min).")
    body = {"sent": True, "delivery": delivery.get("status")}
    # In non-production, surface the code so the flow is testable without an SMS provider.
    if os.getenv("APP_ENV", "development").lower() not in ("production", "prod") or delivery.get("status") == "logged":
        body["devCode"] = code
    return body


@router.post("/otp/verify", response_model=AuthTokenResponse)
@limiter.limit("10/hour")
async def otp_verify(request: Request, payload: dict, db: Session = Depends(get_db)):
    """Verify an OTP and issue a session token (creates a candidate on first login)."""
    from app.core.captcha import verify_captcha
    _ip = request.client.host if request.client else None
    if not await verify_captcha(request.headers.get("x-captcha-token"), action="otp_verify", remote_ip=_ip):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Verificação anti-robô falhou. Tente novamente.")
    phone = _normalize_phone(payload.get("phone", ""))
    code = str(payload.get("code", "")).strip()
    rec = (
        db.query(OtpCode)
        .filter(OtpCode.phone == phone, OtpCode.consumed_at.is_(None))
        .order_by(OtpCode.created_at.desc())
        .first()
    )
    if not rec or rec.expires_at < datetime.utcnow():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Código inválido ou expirado")
    rec.attempts = (rec.attempts or 0) + 1
    if rec.attempts > 5:
        db.commit()
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail="Demasiadas tentativas")
    if rec.code_hash != hash_token(code):
        db.commit()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Código incorreto")

    rec.consumed_at = datetime.utcnow()
    user = db.query(User).filter(User.phone == phone).first()
    is_new_user = user is None
    if is_new_user:
        user = User(
            email=f"{phone}@phone.parvagas", full_name="Novo Utilizador",
            password_hash="!", role=UserRole.candidate, phone=phone, phone_verified=True,
            email_verified=False,
        )
        db.add(user)
    else:
        user.phone_verified = True
    db.commit()
    db.refresh(user)
    _audit(
        db,
        action="auth.otp.register" if is_new_user else "auth.otp.login",
        user=user, ip=_ip, extra={"method": "otp", "new_user": is_new_user},
    )
    token = AuthService.create_access_token(user)
    return {"access_token": token, "token_type": "bearer", "user": UserResponse.model_validate(AuthService.build_user_response(db, user))}


_GOOGLE_ISSUERS = {"accounts.google.com", "https://accounts.google.com"}


@router.post("/google", response_model=AuthTokenResponse)
@limiter.limit("20/hour")
async def google_login(request: Request, payload: dict, db: Session = Depends(get_db)):
    """Sign in with a Google ID token. Requires GOOGLE_CLIENT_ID + network verify.

    Security: the token is verified server-side against Google (signature, aud,
    iss, email_verified, expiry). We never trust client-sent profile data —
    only the fields inside the Google-validated token. Every sign-in and any
    first-time account creation is written to the durable audit log.
    """
    id_token = str(payload.get("idToken", "")).strip()
    client_id = os.getenv("GOOGLE_CLIENT_ID", "")
    if not client_id:
        raise HTTPException(status_code=status.HTTP_501_NOT_IMPLEMENTED, detail="Login Google não configurado (GOOGLE_CLIENT_ID).")
    if not id_token:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="idToken em falta")
    try:
        import httpx
        async with httpx.AsyncClient(timeout=8) as client:
            resp = await client.get("https://oauth2.googleapis.com/tokeninfo", params={"id_token": id_token})
        info = resp.json() if resp.status_code == 200 else {}
    except Exception:
        info = {}
    # Validate the token: audience must be our client, issuer must be Google,
    # and the email must be present AND Google-verified.
    email_verified = str(info.get("email_verified", "")).lower() == "true"
    if (
        not info
        or info.get("aud") != client_id
        or info.get("iss") not in _GOOGLE_ISSUERS
        or not info.get("email")
        or not email_verified
    ):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token Google inválido")

    email = str(info["email"]).lower()
    _ip = request.client.host if request.client else None
    user = db.query(User).filter(User.email == email).first()
    is_new_user = user is None
    if is_new_user:
        user = User(email=email, full_name=info.get("name", "Utilizador Google"),
                    password_hash="!", role=UserRole.candidate, email_verified=True,
                    email_verified_at=datetime.utcnow())
        db.add(user)
        db.commit()
        db.refresh(user)

    # Durable audit trail (no PII beyond email/sub, never the raw token).
    _audit(
        db,
        action="auth.google.register" if is_new_user else "auth.google.login",
        user=user, ip=_ip,
        extra={"method": "google", "google_sub": info.get("sub"), "new_user": is_new_user},
    )

    # New Google users are pre-verified by Google (no verification email needed) —
    # send a welcome email instead. Fire-and-forget; never block sign-in.
    if is_new_user:
        try:
            send_welcome_email.delay(str(user.id))
        except Exception:  # noqa: BLE001 - email queue must never break auth
            pass

    token = AuthService.create_access_token(user)
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": UserResponse.model_validate(AuthService.build_user_response(db, user)),
        "isNewUser": is_new_user,
    }
