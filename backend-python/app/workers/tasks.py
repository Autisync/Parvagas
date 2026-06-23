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
    name='app.workers.tasks.send_templated_email',
    bind=True,
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_jitter=True,
    retry_kwargs={"max_retries": 5},
)
def send_templated_email(self, method: str, payload: dict) -> bool:
    """Generic async dispatcher for any EmailService.send_* template.

    Keeps one task for the whole template catalog instead of one task each.
    `method` must name a real EmailService method (allow-listed by prefix).
    """
    if not method.startswith("send_"):
        logger.error(f"Refusing non-send email method: {method}")
        return False
    fn = getattr(EmailService, method, None)
    if not callable(fn):
        logger.error(f"Unknown email template method: {method}")
        return False
    try:
        ok = fn(**(payload or {}))
        if not ok:
            raise RuntimeError(f"Email '{method}' send failed")
        return ok
    except Exception as e:
        logger.error(f"Failed to send templated email '{method}': {str(e)}")
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


_PUBLIC_JOB_STATUSES = ("approved", "published", "active")


@celery.task(name='app.workers.tasks.dispatch_job_alert_digests')
def dispatch_job_alert_digests() -> dict:
    """Daily: email candidates new jobs matching their saved alerts."""
    from datetime import timedelta
    from app.models import JobAlert, Job, User
    from app.services.notification_service import create_notification

    db = SessionLocal()
    sent = 0
    try:
        now = datetime.utcnow()
        alerts = db.query(JobAlert).filter(JobAlert.active.is_(True)).all()
        for alert in alerts:
            # Respect frequency: daily every run; weekly only after 7 days; skip instant here.
            if alert.frequency == "instant":
                continue
            if alert.frequency == "weekly" and alert.last_notified_at and (now - alert.last_notified_at) < timedelta(days=7):
                continue
            since = alert.last_notified_at or (now - timedelta(days=1))
            q = db.query(Job).filter(
                Job.status.in_(_PUBLIC_JOB_STATUSES),
                Job.published_at.isnot(None),
                Job.published_at >= since,
            )
            if alert.keyword:
                like = f"%{alert.keyword}%"
                q = q.filter((Job.title.ilike(like)) | (Job.description.ilike(like)))
            if alert.location:
                q = q.filter(Job.location.ilike(f"%{alert.location}%"))
            if alert.category:
                q = q.filter(Job.category == alert.category)
            if alert.work_mode:
                q = q.filter(Job.work_mode == alert.work_mode)
            jobs = q.order_by(Job.published_at.desc()).limit(10).all()
            if not jobs:
                continue
            user = db.query(User).filter(User.id == alert.candidate_user_id).first()
            if not user or not user.email:
                continue
            query_label = alert.keyword or alert.category or alert.location or "as suas preferências"
            payload = [{"id": j.id, "title": j.title, "company": "", "location": j.location or "",
                        "url": ""} for j in jobs]
            EmailService.send_job_alert_digest(user.email, user.full_name or "Candidato", query_label, payload)
            create_notification(
                db, alert.candidate_user_id, type="job_alert",
                title=f"{len(jobs)} nova(s) vaga(s) para si",
                body=f"Novas vagas para {query_label}.", link="/Vagas-Disponiveis",
            )
            alert.last_notified_at = now
            db.commit()
            sent += 1
        return {"alerts_notified": sent}
    except Exception as e:
        logger.error(f"Failed to dispatch job alert digests: {str(e)}")
        db.rollback()
        return {"success": False, "error": str(e)}
    finally:
        db.close()


@celery.task(name='app.workers.tasks.dispatch_instant_alerts_for_job')
def dispatch_instant_alerts_for_job(job_id: str) -> dict:
    """Instant: when a job is published, notify candidates whose instant alert matches."""
    from app.models import JobAlert, Job, User
    from app.services.notification_service import create_notification

    db = SessionLocal()
    sent = 0
    try:
        job = db.query(Job).filter(Job.id == job_id).first()
        if not job or job.status not in _PUBLIC_JOB_STATUSES:
            return {"notified": 0, "reason": "job not public"}
        alerts = db.query(JobAlert).filter(
            JobAlert.active.is_(True), JobAlert.frequency == "instant"
        ).all()
        text = f"{job.title or ''} {job.description or ''}".lower()
        for alert in alerts:
            if alert.keyword and alert.keyword.lower() not in text:
                continue
            if alert.location and (job.location or "").lower().find(alert.location.lower()) < 0:
                continue
            if alert.category and job.category != alert.category:
                continue
            if alert.work_mode and job.work_mode != alert.work_mode:
                continue
            user = db.query(User).filter(User.id == alert.candidate_user_id).first()
            if not user or not user.email:
                continue
            query_label = alert.keyword or alert.category or alert.location or "as suas preferências"
            EmailService.send_job_alert_digest(
                user.email, user.full_name or "Candidato", query_label,
                [{"id": job.id, "title": job.title, "company": "", "location": job.location or "", "url": ""}],
            )
            create_notification(
                db, alert.candidate_user_id, type="job_alert",
                title="Nova vaga para si", body=job.title or "", link=f"/Vagas-Disponiveis/{job.id}",
            )
            sent += 1
        return {"notified": sent}
    except Exception as e:
        logger.error(f"Failed to dispatch instant alerts for job {job_id}: {str(e)}")
        return {"success": False, "error": str(e)}
    finally:
        db.close()


@celery.task(name='app.workers.tasks.dispatch_subscription_expiry_reminders')
def dispatch_subscription_expiry_reminders(days_ahead: int = 3) -> dict:
    """Daily: remind companies whose plan expires within `days_ahead` days."""
    from datetime import timedelta
    from app.models import Subscription, Company, Plan, User

    db = SessionLocal()
    sent = 0
    try:
        now = datetime.utcnow()
        horizon = now + timedelta(days=days_ahead)
        subs = (
            db.query(Subscription)
            .filter(
                Subscription.status == "active",
                Subscription.current_period_end.isnot(None),
                Subscription.current_period_end >= now,
                Subscription.current_period_end <= horizon,
            )
            .all()
        )
        for sub in subs:
            company = db.query(Company).filter(Company.id == sub.company_id).first()
            if not company or not company.owner_user_id:
                continue
            owner = db.query(User).filter(User.id == company.owner_user_id).first()
            if not owner or not owner.email:
                continue
            plan = db.query(Plan).filter(Plan.id == sub.plan_id).first()
            days_left = max(0, (sub.current_period_end - now).days)
            EmailService.send_subscription_expiring_email(
                owner.email, company.name, plan.name if plan else "", days_left,
            )
            sent += 1
        return {"reminders_sent": sent}
    except Exception as e:
        logger.error(f"Failed to dispatch expiry reminders: {str(e)}")
        return {"success": False, "error": str(e)}
    finally:
        db.close()
