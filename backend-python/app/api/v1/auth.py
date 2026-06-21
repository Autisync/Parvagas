"""Authentication API endpoints."""
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.api.deps import get_current_user
from app.core.observability import limiter
from app.models import User
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


@router.get("/me", response_model=UserResponse)
async def get_me(current_user: User = Depends(get_current_user)):
    """Return the authenticated user's profile."""
    return UserResponse.model_validate(current_user)


@router.post("/logout", response_model=MessageResponse)
async def logout(current_user: User = Depends(get_current_user)):
    """Stateless logout — the client discards the token."""
    return {"message": "Logged out successfully."}
