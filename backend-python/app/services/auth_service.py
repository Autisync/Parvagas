"""Authentication service."""
import re

from sqlalchemy.orm import Session
from datetime import datetime, timedelta
from app.models import CandidateProfile, Company, CompanyMember, User, UserRole, EmailVerificationToken, PasswordResetToken
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
        role: str = "candidate",
        company_name: str | None = None,
        company_legal_name: str | None = None,
        nif: str | None = None,
    ) -> User:
        """Register a new user."""
        AuthService._reject_pwned_password(password)

        # Check if user already exists
        existing_user = db.query(User).filter(User.email == email.lower()).first()
        if existing_user:
            raise ConflictError("Email already registered")

        normalized_role = UserRole(role)
        if normalized_role == UserRole.company:
            if not (company_name or "").strip():
                raise ValidationError("Company name is required")

            normalized_nif = re.sub(r"[^A-Za-z0-9]", "", (nif or "").strip()).upper()
            if not normalized_nif or not re.fullmatch(r"[A-Z0-9]{6,20}", normalized_nif):
                raise ValidationError("Company identifier (NIF) must be 6-20 alphanumeric characters")

            existing_company = db.query(Company).filter(Company.nif == normalized_nif).first()
            if existing_company:
                raise ConflictError("Company identifier already registered")
        else:
            normalized_nif = ""
        
        # Create user
        user = User(
            email=email.lower(),
            full_name=full_name,
            password_hash=hash_password(password),
            role=normalized_role,
            email_verified=False
        )
        
        db.add(user)
        db.flush()

        if normalized_role == UserRole.company:
            company = Company(
                owner_user_id=user.id,
                name=(company_name or "").strip(),
                legal_name=(company_legal_name or "").strip() or None,
                nif=normalized_nif,
                email=user.email,
                status="pending_verification",
            )
            db.add(company)

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
    def _reject_pwned_password(password: str) -> None:
        """Refuse passwords found in known breach corpora (HIBP Pwned
        Passwords, k-anonymity — the plaintext never leaves the server).

        Gated by HIBP_PASSWORD_CHECK_ENABLED (default off). A failed CHECK
        (network error, API down) never blocks the flow — only a confirmed
        pwned=True does.
        """
        from app.services.hibp_service import password_is_pwned

        if password_is_pwned(password) is True:
            raise ValidationError(
                "Esta palavra-passe aparece em fugas de dados conhecidas. "
                "Por segurança, escolha uma palavra-passe diferente."
            )

    @staticmethod
    def reset_password(db: Session, raw_token: str, new_password: str) -> User:
        """Reset user password with token."""
        AuthService._reject_pwned_password(new_password)

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
        # C5: setting a real password is exactly what "claiming" a guest
        # shadow account means — this is the one place that transition
        # happens for every guest-account flow (CV builder, CV-drop).
        user.is_guest_account = False

        db.commit()
        db.refresh(user)
        
        return user
    
    @staticmethod
    def build_user_response(db: Session, user: User) -> dict:
        """Assemble the login/me payload, including the onboarding/tutorial
        flags the frontend needs to decide whether to force the wizard.

        These flags live on CandidateProfile/Company/CompanyMember, not on
        User itself — a bare ``UserResponse.model_validate(user)`` leaves them
        None, which the frontend was treating as "not completed yet" on every
        login (the onboarding screen kept reappearing for already-onboarded
        candidates). Every auth endpoint that returns a user must go through
        this helper instead of validating the bare ORM object.
        """
        payload = {
            "id": user.id,
            "email": user.email,
            "full_name": user.full_name,
            "role": user.role.value if hasattr(user.role, "value") else user.role,
            "admin_level": user.admin_level,
            "email_verified": user.email_verified,
            "is_guest_account": bool(user.is_guest_account),
        }

        if user.role == UserRole.candidate:
            profile = db.query(CandidateProfile).filter(CandidateProfile.user_id == user.id).first()
            payload["has_completed_onboarding"] = bool(profile.has_completed_onboarding) if profile else False
            payload["has_seen_tutorial"] = bool(profile.has_seen_tutorial) if profile else False
        elif user.role == UserRole.company:
            company = db.query(Company).filter(Company.owner_user_id == user.id).first()
            member = None
            if not company:
                member = db.query(CompanyMember).filter(CompanyMember.user_id == user.id).first()
                if member:
                    company = db.query(Company).filter(Company.id == member.company_id).first()
            payload["has_seen_empresa_tutorial"] = bool(company.has_seen_tutorial) if company else False
            payload["company_status"] = company.status if company else None
            payload["company_team_role"] = "owner" if (company and not member) else (member.role if member else None)

        return payload

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
