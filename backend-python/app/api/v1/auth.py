"""Authentication API endpoints."""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.db.session import get_db
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
from app.core.logging import get_logger

logger = get_logger(__name__)
settings = get_settings()
router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=MessageResponse)
async def register(
    request: UserRegisterRequest,
    db: Session = Depends(get_db)
):
    """Register a new user."""
    try:
        # Register user
        user = AuthService.register_user(
            db=db,
            email=request.email,
            password=request.password,
            full_name=request.full_name,
            role=request.role
        )
        
        # Create verification token
        raw_token = AuthService.create_verification_token(db, user)
        
        # Send verification email async
        send_verification_email.delay(str(user.id), raw_token)
        
        # Send welcome email async
        send_welcome_email.delay(str(user.id))
        
        return {"message": "Registration successful. Please check your email to verify your account."}
    
    except Exception as e:
        logger.error(f"Registration error: {str(e)}")
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.post("/login", response_model=AuthTokenResponse)
async def login(
    request: UserLoginRequest,
    db: Session = Depends(get_db)
):
    """Authenticate user and return access token."""
    try:
        user = AuthService.authenticate_user(
            db=db,
            email=request.email,
            password=request.password,
            role_hint=request.role_hint
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
        return {"message": "Email verified successfully. You can now log in."}
    
    except Exception as e:
        logger.error(f"Email verification error: {str(e)}")
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.post("/resend-verification-email", response_model=MessageResponse)
async def resend_verification_email(
    request: ResendVerificationRequest,
    db: Session = Depends(get_db)
):
    """Resend verification email to user."""
    try:
        user = db.query(User).filter(User.email == request.email.lower()).first()
        
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
async def forgot_password(
    request: ForgotPasswordRequest,
    db: Session = Depends(get_db)
):
    """Initiate password reset process."""
    try:
        user = db.query(User).filter(User.email == request.email.lower()).first()
        
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
async def reset_password(
    request: ResetPasswordRequest,
    db: Session = Depends(get_db)
):
    """Reset password with token."""
    try:
        if request.new_password != request.confirm_password:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Passwords do not match"
            )
        
        user = AuthService.reset_password(db, request.token, request.new_password)
        return {"message": "Password reset successfully. You can now log in with your new password."}
    
    except Exception as e:
        logger.error(f"Reset password error: {str(e)}")
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
