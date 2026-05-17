"""Authentication service."""
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
from app.models import User, UserRole, EmailVerificationToken, PasswordResetToken
from app.core.security import (
    hash_password, verify_password, create_access_token, 
    create_verification_token, hash_token
)
from app.core.errors import (
    AuthenticationError, ConflictError, ValidationError,
    EmailNotVerifiedError, NotFoundError
)


class AuthService:
    """Authentication service."""
    
    @staticmethod
    def register_user(
        db: Session,
        email: str,
        password: str,
        full_name: str,
        role: str = "candidate"
    ) -> User:
        """Register a new user."""
        # Check if user already exists
        existing_user = db.query(User).filter(User.email == email.lower()).first()
        if existing_user:
            raise ConflictError("Email already registered")
        
        # Create user
        user = User(
            email=email.lower(),
            full_name=full_name,
            password_hash=hash_password(password),
            role=UserRole(role),
            email_verified=False
        )
        
        db.add(user)
        db.commit()
        db.refresh(user)
        
        return user
    
    @staticmethod
    def authenticate_user(
        db: Session,
        email: str,
        password: str,
        role_hint: str = None
    ) -> User:
        """Authenticate a user by email and password."""
        # Build query
        query = db.query(User).filter(User.email == email.lower())
        
        # Apply role hint if provided
        if role_hint:
            try:
                query = query.filter(User.role == UserRole(role_hint))
            except ValueError:
                pass
        
        user = query.first()
        
        if not user:
            raise AuthenticationError("Invalid email or password")
        
        if user.suspended:
            raise AuthenticationError("Account suspended")
        
        # Check account lock
        if user.locked_until and datetime.utcnow() < user.locked_until:
            raise AuthenticationError("Account temporarily locked. Try again later.")
        
        # Verify password
        if not verify_password(password, user.password_hash):
            # Increment failed attempts
            user.failed_login_attempts = (user.failed_login_attempts or 0) + 1
            if user.failed_login_attempts >= 8:
                user.locked_until = datetime.utcnow() + timedelta(minutes=15)
            db.commit()
            raise AuthenticationError("Invalid email or password")
        
        # Check email verification
        if not user.email_verified:
            raise EmailNotVerifiedError()
        
        # Reset failed attempts
        user.failed_login_attempts = 0
        user.locked_until = None
        db.commit()
        
        return user
    
    @staticmethod
    def create_verification_token(db: Session, user: User) -> str:
        """Create an email verification token."""
        raw_token = create_verification_token()
        token_hash = hash_token(raw_token)
        
        # Delete old tokens
        db.query(EmailVerificationToken).filter(
            EmailVerificationToken.user_id == user.id
        ).delete()
        
        # Create new token
        verification_token = EmailVerificationToken(
            user_id=user.id,
            token_hash=token_hash,
            expires_at=datetime.utcnow() + timedelta(hours=24)
        )
        
        db.add(verification_token)
        db.commit()
        
        return raw_token
    
    @staticmethod
    def verify_email(db: Session, raw_token: str) -> User:
        """Verify user email with token."""
        token_hash = hash_token(raw_token)
        
        # Find token
        token = db.query(EmailVerificationToken).filter(
            EmailVerificationToken.token_hash == token_hash
        ).first()
        
        if not token:
            raise ValidationError("Invalid verification token")
        
        if datetime.utcnow() > token.expires_at:
            raise ValidationError("Verification token expired")
        
        if token.used_at:
            raise ValidationError("Token already used")
        
        # Mark as used and verify user
        token.used_at = datetime.utcnow()
        user = db.query(User).get(token.user_id)
        user.email_verified = True
        user.email_verified_at = datetime.utcnow()
        
        db.commit()
        db.refresh(user)
        
        return user
    
    @staticmethod
    def create_password_reset_token(db: Session, user: User) -> str:
        """Create a password reset token."""
        raw_token = create_verification_token()
        token_hash = hash_token(raw_token)
        
        # Delete old tokens
        db.query(PasswordResetToken).filter(
            PasswordResetToken.user_id == user.id
        ).delete()
        
        # Create new token
        reset_token = PasswordResetToken(
            user_id=user.id,
            token_hash=token_hash,
            expires_at=datetime.utcnow() + timedelta(hours=1)
        )
        
        db.add(reset_token)
        db.commit()
        
        return raw_token
    
    @staticmethod
    def reset_password(db: Session, raw_token: str, new_password: str) -> User:
        """Reset user password with token."""
        token_hash = hash_token(raw_token)
        
        # Find token
        token = db.query(PasswordResetToken).filter(
            PasswordResetToken.token_hash == token_hash
        ).first()
        
        if not token:
            raise ValidationError("Invalid password reset token")
        
        if datetime.utcnow() > token.expires_at:
            raise ValidationError("Password reset token expired")
        
        if token.used_at:
            raise ValidationError("Token already used")
        
        # Update password
        token.used_at = datetime.utcnow()
        user = db.query(User).get(token.user_id)
        user.password_hash = hash_password(new_password)
        
        db.commit()
        db.refresh(user)
        
        return user
    
    @staticmethod
    def create_access_token(user: User) -> str:
        """Create JWT access token for user."""
        payload = {
            "sub": str(user.id),
            "email": user.email,
            "role": user.role.value
        }
        admin_level = getattr(user, "admin_level", None)
        if user.role == UserRole.admin and admin_level is not None:
            payload["admin_level"] = admin_level.value if hasattr(admin_level, "value") else str(admin_level)

        return create_access_token(payload)
