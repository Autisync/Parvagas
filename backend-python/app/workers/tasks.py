"""Celery tasks for async operations."""
from datetime import datetime
from sqlalchemy.orm import Session
from app.workers.celery_app import celery
from app.db.session import SessionLocal
from app.models import User, EmailVerificationToken, PasswordResetToken, CVUpload
from app.services.email_service import EmailService
from app.services.cv_parser_service import CVParserService
from app.core.config import get_settings
from app.core.logging import get_logger

logger = get_logger(__name__)
settings = get_settings()


@celery.task(name='app.workers.tasks.send_verification_email')
def send_verification_email(user_id: str, raw_token: str) -> bool:
    """Send verification email task."""
    try:
        db = SessionLocal()
        user = db.query(User).filter(User.id == user_id).first()
        
        if not user:
            logger.warning(f"User {user_id} not found for verification email")
            return False
        
        verification_link = f"{settings.FRONTEND_URL}/verify-email?token={raw_token}"
        
        success = EmailService.send_verification_email(
            user.email,
            user.full_name,
            verification_link
        )
        
        db.close()
        return success
    
    except Exception as e:
        logger.error(f"Failed to send verification email: {str(e)}")
        return False


@celery.task(name='app.workers.tasks.send_password_reset_email')
def send_password_reset_email(user_id: str, raw_token: str) -> bool:
    """Send password reset email task."""
    try:
        db = SessionLocal()
        user = db.query(User).filter(User.id == user_id).first()
        
        if not user:
            logger.warning(f"User {user_id} not found for password reset email")
            return False
        
        reset_link = f"{settings.FRONTEND_URL}/reset-password?token={raw_token}"
        
        success = EmailService.send_password_reset_email(
            user.email,
            user.full_name,
            reset_link
        )
        
        db.close()
        return success
    
    except Exception as e:
        logger.error(f"Failed to send password reset email: {str(e)}")
        return False


@celery.task(name='app.workers.tasks.send_welcome_email')
def send_welcome_email(user_id: str) -> bool:
    """Send welcome email task."""
    try:
        db = SessionLocal()
        user = db.query(User).filter(User.id == user_id).first()
        
        if not user:
            logger.warning(f"User {user_id} not found for welcome email")
            return False
        
        success = EmailService.send_welcome_email(
            user.email,
            user.full_name,
            user.role.value
        )
        
        db.close()
        return success
    
    except Exception as e:
        logger.error(f"Failed to send welcome email: {str(e)}")
        return False


@celery.task(name='app.workers.tasks.parse_cv')
def parse_cv(cv_upload_id: str) -> dict:
    """Parse CV file task."""
    try:
        db = SessionLocal()
        cv_upload = db.query(CVUpload).filter(CVUpload.id == cv_upload_id).first()
        
        if not cv_upload:
            logger.warning(f"CV upload {cv_upload_id} not found")
            return {"success": False, "error": "CV upload not found"}
        
        # Parse CV
        result = CVParserService.parse_cv_file(cv_upload.file_path, cv_upload.mime_type)
        
        # Update CV upload with results
        if result.get("success"):
            cv_upload.parse_status = "completed"
            cv_upload.parsed_data = str(result.get("parsedProfile", {}))
            cv_upload.parse_confidence = str(result.get("confidence", {}))
            
            # Update candidate profile with parsed data
            if cv_upload.candidate_profile:
                parsed = result.get("parsedProfile", {})
                if parsed.get("first_name"):
                    cv_upload.candidate_profile.first_name = parsed.get("first_name")
                if parsed.get("last_name"):
                    cv_upload.candidate_profile.last_name = parsed.get("last_name")
                if parsed.get("job_title"):
                    cv_upload.candidate_profile.job_title = parsed.get("job_title")
                if parsed.get("years_of_experience"):
                    cv_upload.candidate_profile.years_of_experience = parsed.get("years_of_experience")
                if parsed.get("skills"):
                    cv_upload.candidate_profile.skills = str(parsed.get("skills"))
                if parsed.get("professional_summary"):
                    cv_upload.candidate_profile.professional_summary = parsed.get("professional_summary")
        else:
            cv_upload.parse_status = "failed"
            cv_upload.parse_error = str(result.get("warnings", ["Unknown error"]))
        
        db.commit()
        db.close()
        
        return result
    
    except Exception as e:
        logger.error(f"Failed to parse CV: {str(e)}")
        try:
            db = SessionLocal()
            cv_upload = db.query(CVUpload).filter(CVUpload.id == cv_upload_id).first()
            if cv_upload:
                cv_upload.parse_status = "failed"
                cv_upload.parse_error = str(e)
                db.commit()
            db.close()
        except:
            pass
        return {"success": False, "error": str(e)}


@celery.task(name='app.workers.tasks.cleanup_expired_tokens')
def cleanup_expired_tokens() -> dict:
    """Cleanup expired verification and password reset tokens."""
    try:
        db = SessionLocal()
        
        # Delete expired verification tokens
        deleted_verification = db.query(EmailVerificationToken).filter(
            EmailVerificationToken.expires_at < datetime.utcnow()
        ).delete()
        
        # Delete expired password reset tokens
        deleted_password = db.query(PasswordResetToken).filter(
            PasswordResetToken.expires_at < datetime.utcnow()
        ).delete()
        
        db.commit()
        db.close()
        
        logger.info(f"Cleaned up {deleted_verification} verification tokens and {deleted_password} password reset tokens")
        
        return {
            "verification_tokens_deleted": deleted_verification,
            "password_tokens_deleted": deleted_password
        }
    
    except Exception as e:
        logger.error(f"Failed to cleanup tokens: {str(e)}")
        return {"success": False, "error": str(e)}
