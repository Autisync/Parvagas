"""Authentication API endpoints."""
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session
import os
import secrets
from datetime import datetime, timedelta
from app.db.session import get_db
from app.api.deps import get_current_user
from app.core.observability import limiter
from app.core.security import hash_token, hash_password
from app.services.notification_service import send_sms
from app.models import User, UserRole, OtpCode, CompanyInvite, CompanyMember
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
    if not verify_captcha(request.headers.get("x-captcha-token"), action="register", remote_ip=_ip):
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
    if not verify_captcha(request.headers.get("x-captcha-token"), action="login", remote_ip=_ip):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Verificação anti-robô falhou. Tente novamente.")
    try:
        user = AuthService.authenticate_user(
            db=db,
            email=payload.email,
            password=payload.password,
            role_hint=payload.role_hint
        )
        
        token = AuthService.create_access_token(user)
        
        return {
            "access_token": token,
            "token_type": "bearer",
            "user": UserResponse.model_validate(user)
        }
    
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
        
        # Create new verification token
        raw_token = AuthService.create_verification_token(db, user)
        
        # Send email async
        send_verification_email.delay(str(user.id), raw_token)
        
        return {"message": "Verification email sent. Please check your inbox."}
    
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
    return {"access_token": token, "token_type": "bearer", "user": UserResponse.model_validate(user)}


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
    return {"access_token": token, "token_type": "bearer", "user": UserResponse.model_validate(user)}


@router.get("/me", response_model=UserResponse)
async def get_me(current_user: User = Depends(get_current_user)):
    """Return the authenticated user's profile."""
    return UserResponse.model_validate(current_user)


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
    if not user:
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
    token = AuthService.create_access_token(user)
    return {"access_token": token, "token_type": "bearer", "user": UserResponse.model_validate(user)}


@router.post("/google", response_model=AuthTokenResponse)
async def google_login(payload: dict, db: Session = Depends(get_db)):
    """Sign in with a Google ID token. Requires GOOGLE_CLIENT_ID + network verify."""
    id_token = str(payload.get("idToken", "")).strip()
    client_id = os.getenv("GOOGLE_CLIENT_ID", "")
    if not client_id:
        raise HTTPException(status_code=status.HTTP_501_NOT_IMPLEMENTED, detail="Login Google não configurado (GOOGLE_CLIENT_ID).")
    if not id_token:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="idToken em falta")
    try:
        import httpx
        resp = httpx.get("https://oauth2.googleapis.com/tokeninfo", params={"id_token": id_token}, timeout=8)
        info = resp.json() if resp.status_code == 200 else {}
    except Exception:
        info = {}
    if not info or info.get("aud") != client_id or not info.get("email"):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token Google inválido")
    email = str(info["email"]).lower()
    user = db.query(User).filter(User.email == email).first()
    if not user:
        user = User(email=email, full_name=info.get("name", "Utilizador Google"),
                    password_hash="!", role=UserRole.candidate, email_verified=True,
                    email_verified_at=datetime.utcnow())
        db.add(user)
        db.commit()
        db.refresh(user)
    token = AuthService.create_access_token(user)
    return {"access_token": token, "token_type": "bearer", "user": UserResponse.model_validate(user)}
