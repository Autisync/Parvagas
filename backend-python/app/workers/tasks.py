"""Celery tasks for async operations."""
import json
from datetime import datetime
from urllib.parse import quote
from celery.exceptions import SoftTimeLimitExceeded
from app.workers.celery_app import celery
from app.db.session import SessionLocal
from app.models import User, UserRole, EmailVerificationToken, PasswordResetToken, CVUpload
from app.services.email_service import EmailService
from app.services.cv_parser_service import CVParserService
from app.core.config import get_settings
from app.core.logging import get_logger

logger = get_logger(__name__)
settings = get_settings()


@celery.task(
    name='app.workers.tasks.send_verification_email',
    bind=True,
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_jitter=True,
    retry_kwargs={"max_retries": 5},
)
def send_verification_email(self, user_id: str, raw_token: str) -> bool:
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

        if not success:
            raise RuntimeError(f"Verification email send failed for {user.email}")

        db.close()
        return success

    except Exception as e:
        logger.error(f"Failed to send verification email: {str(e)}")
        raise


@celery.task(
    name='app.workers.tasks.send_password_reset_email',
    bind=True,
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_jitter=True,
    retry_kwargs={"max_retries": 5},
)
def send_password_reset_email(self, user_id: str, raw_token: str) -> bool:
    """Send password reset email task."""
    try:
        db = SessionLocal()
        user = db.query(User).filter(User.id == user_id).first()
        
        if not user:
            logger.warning(f"User {user_id} not found for password reset email")
            return False
        
        login_path = "/Admin/Login" if user.role == UserRole.admin else "/Login"
        role_query = f"&role={quote(user.role.value)}" if user.role in {UserRole.candidate, UserRole.company} else ""
        reset_link = f"{settings.FRONTEND_URL}{login_path}?resetToken={quote(raw_token)}{role_query}"
        
        success = EmailService.send_password_reset_email(
            user.email,
            user.full_name,
            reset_link
        )

        if not success:
            raise RuntimeError(f"Password reset email send failed for {user.email}")

        db.close()
        return success

    except Exception as e:
        logger.error(f"Failed to send password reset email: {str(e)}")
        raise


@celery.task(
    name='app.workers.tasks.send_welcome_email',
    bind=True,
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_jitter=True,
    retry_kwargs={"max_retries": 5},
)
def send_welcome_email(self, user_id: str) -> bool:
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

        if not success:
            raise RuntimeError(f"Welcome email send failed for {user.email}")

        db.close()
        return success

    except Exception as e:
        logger.error(f"Failed to send welcome email: {str(e)}")
        raise


@celery.task(
    name='app.workers.tasks.send_application_received_email',
    bind=True,
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_jitter=True,
    retry_kwargs={"max_retries": 5},
)
def send_application_received_email(self, email: str, full_name: str, job_id: str) -> bool:
    """Send application acknowledgement email task."""
    try:
        success = EmailService.send_application_received_email(
            email=email,
            full_name=full_name,
            job_id=job_id,
        )

        if not success:
            raise RuntimeError(f"Application confirmation email send failed for {email}")

        return success

    except Exception as e:
        logger.error(f"Failed to send application confirmation email: {str(e)}")
        raise


@celery.task(
    name='app.workers.tasks.send_application_status_email',
    bind=True,
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_jitter=True,
    retry_kwargs={"max_retries": 5},
)
def send_application_status_email(self, email: str, full_name: str, job_title: str, new_status: str) -> bool:
    """Notify a candidate when their application status changes."""
    try:
        success = EmailService.send_application_status_email(
            email=email,
            full_name=full_name,
            job_title=job_title,
            new_status=new_status,
        )
        if not success:
            raise RuntimeError(f"Application status email send failed for {email}")
        return success
    except Exception as e:
        logger.error(f"Failed to send application status email: {str(e)}")
        raise


@celery.task(
    name='app.workers.tasks.parse_cv',
    bind=True,
    soft_time_limit=settings.CV_PARSE_TASK_SOFT_TIMEOUT_SECONDS,
    time_limit=settings.CV_PARSE_TASK_TIMEOUT_SECONDS,
)
def parse_cv(self, cv_upload_id: str) -> dict:
    """Parse CV file task."""
    db = None
    try:
        db = SessionLocal()
        cv_upload = db.query(CVUpload).filter(CVUpload.id == cv_upload_id).first()

        if not cv_upload:
            logger.warning(f"CV upload {cv_upload_id} not found")
            return {"success": False, "error": "CV upload not found"}

        cv_upload.parse_status = "processing"
        cv_upload.parse_error = None
        db.commit()

        # Parse CV
        result = CVParserService.parse_cv_file(cv_upload.file_path, cv_upload.mime_type)

        # Update CV upload with results
        if result.get("success"):
            cv_upload.parse_status = "completed"
            parsed = result.get("parsedProfile", {}) if isinstance(result.get("parsedProfile"), dict) else {}
            warnings = result.get("warnings", []) if isinstance(result.get("warnings"), list) else []
            cv_upload.parsed_data = json.dumps(parsed, ensure_ascii=True)

            confidence = result.get("confidence", {}) if isinstance(result.get("confidence"), dict) else {}
            confidence_values = [float(v) for v in confidence.values() if isinstance(v, (int, float))]
            cv_upload.parse_confidence = sum(confidence_values) / len(confidence_values) if confidence_values else None
            cv_upload.parse_error = json.dumps(warnings, ensure_ascii=True) if warnings else None

            # Update candidate profile with parsed data
            if cv_upload.candidate_profile and parsed:
                profile = cv_upload.candidate_profile

                def _pick(*keys):
                    for key in keys:
                        value = parsed.get(key)
                        if value is not None and str(value).strip() != "":
                            return value
                    return None

                def _as_list(value):
                    if isinstance(value, list):
                        return value
                    if isinstance(value, str):
                        parts = [item.strip() for item in value.split(",")]
                        return [item for item in parts if item]
                    return []

                first_name = _pick("first_name", "firstName")
                last_name = _pick("last_name", "lastName")
                full_name = _pick("full_name", "fullName")
                phone = _pick("phone")
                location = _pick("location")
                postcode = _pick("postcode")
                linkedin = _pick("linkedin_url", "linkedinUrl")
                portfolio = _pick("portfolio_url", "portfolioUrl")
                github = _pick("github_url", "githubUrl")
                summary = _pick("professional_summary", "professionalSummary", "summary")
                title = _pick("job_title", "jobTitle", "professionalTitle")
                years = _pick("years_of_experience", "yearsOfExperience")

                if first_name:
                    profile.first_name = str(first_name).strip()
                if last_name:
                    profile.last_name = str(last_name).strip()
                if phone:
                    profile.phone = str(phone).strip()
                if location:
                    profile.location = str(location).strip()
                if postcode:
                    profile.postcode = str(postcode).strip()
                if linkedin:
                    profile.linkedin_url = str(linkedin).strip()
                if portfolio:
                    profile.portfolio_url = str(portfolio).strip()
                if github:
                    profile.github_url = str(github).strip()
                if summary:
                    profile.professional_summary = str(summary).strip()
                if title:
                    profile.job_title = str(title).strip()
                if years is not None:
                    try:
                        profile.years_of_experience = int(years)
                    except Exception:
                        profile.years_of_experience = None

                skills = _as_list(_pick("skills"))
                languages = _as_list(_pick("languages"))
                certifications = _as_list(_pick("certifications"))
                work_experience = _pick("work_experience", "workExperience", "experience")
                education = _pick("education")

                profile.skills = json.dumps(skills, ensure_ascii=True)
                profile.languages = json.dumps(languages, ensure_ascii=True)
                profile.certifications = json.dumps(certifications, ensure_ascii=True)
                profile.work_experience = json.dumps(work_experience if isinstance(work_experience, list) else [], ensure_ascii=True)
                profile.education = json.dumps(education if isinstance(education, list) else [], ensure_ascii=True)

                if cv_upload.candidate_profile.user and full_name:
                    cv_upload.candidate_profile.user.full_name = str(full_name).strip()
        else:
            cv_upload.parse_status = "failed"
            warnings = result.get("warnings", ["Unknown error"])
            cv_upload.parse_error = json.dumps(warnings, ensure_ascii=True)

        db.commit()
        return result

    except SoftTimeLimitExceeded:
        logger.error(f"CV parsing soft timeout for {cv_upload_id}")
        if db:
            cv_upload = db.query(CVUpload).filter(CVUpload.id == cv_upload_id).first()
            if cv_upload:
                cv_upload.parse_status = "failed"
                cv_upload.parse_error = json.dumps(["Tempo limite de processamento do CV excedido."], ensure_ascii=True)
                db.commit()
        return {"success": False, "error": "CV parsing timeout"}

    except Exception as e:
        logger.error(f"Failed to parse CV: {str(e)}")
        try:
            if not db:
                db = SessionLocal()
            cv_upload = db.query(CVUpload).filter(CVUpload.id == cv_upload_id).first()
            if cv_upload:
                cv_upload.parse_status = "failed"
                cv_upload.parse_error = json.dumps([str(e)], ensure_ascii=True)
                db.commit()
        except Exception:
            pass
        return {"success": False, "error": str(e)}

    finally:
        if db:
            db.close()


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
