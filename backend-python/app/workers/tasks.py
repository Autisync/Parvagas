"""Celery tasks for async operations."""
import json
import os
from datetime import datetime
from urllib.parse import quote
from celery.exceptions import SoftTimeLimitExceeded
from app.workers.celery_app import celery
from app.db.session import SessionLocal
from app.models import User, UserRole, EmailVerificationToken, PasswordResetToken, CVUpload
from app.services.email_service import EmailService
from app.services.cv_parser_service import CVParserService
from app.services.task_heartbeat import track_task_run
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
    name='app.workers.tasks.send_guest_cv_claim_email',
    bind=True,
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_jitter=True,
    retry_kwargs={"max_retries": 5},
)
def send_guest_cv_claim_email(self, user_id: str, raw_token: str) -> bool:
    """C5 (EXECUTION_PLAN_NATIVE_CV_BUILDER.md): one-time nudge after a
    guest-created account's first CV export. Reuses the password-reset
    token/link shape — same claim mechanism, different copy/subject."""
    try:
        db = SessionLocal()
        user = db.query(User).filter(User.id == user_id).first()

        if not user:
            logger.warning(f"User {user_id} not found for guest CV claim email")
            return False

        claim_link = f"{settings.FRONTEND_URL}/Login?resetToken={quote(raw_token)}&role=candidate"

        success = EmailService.send_guest_cv_claim_email(
            user.email,
            user.full_name,
            claim_link
        )

        if not success:
            raise RuntimeError(f"Guest CV claim email send failed for {user.email}")

        db.close()
        return success

    except Exception as e:
        logger.error(f"Failed to send guest CV claim email: {str(e)}")
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
def send_application_received_email(self, email: str, full_name: str, job_id: str, tracking_url: str = "") -> bool:
    """Send application acknowledgement email task."""
    try:
        success = EmailService.send_application_received_email(
            email=email,
            full_name=full_name,
            job_id=job_id,
            tracking_url=tracking_url,
        )

        if not success:
            raise RuntimeError(f"Application confirmation email send failed for {email}")

        return success

    except Exception as e:
        logger.error(f"Failed to send application confirmation email: {str(e)}")
        raise


@celery.task(
    name='app.workers.tasks.send_newsletter_confirmation_email',
    bind=True,
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_jitter=True,
    retry_kwargs={"max_retries": 5},
)
def send_newsletter_confirmation_email(self, email: str) -> bool:
    """Send newsletter opt-in confirmation email task."""
    try:
        success = EmailService.send_newsletter_confirmation_email(email=email)

        if not success:
            raise RuntimeError(f"Newsletter confirmation email send failed for {email}")

        return success

    except Exception as e:
        logger.error(f"Failed to send newsletter confirmation email: {str(e)}")
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
                hard_skills = _as_list(_pick("hard_skills"))
                techniques = _as_list(_pick("techniques"))
                tools = _as_list(_pick("tools"))
                languages = _as_list(_pick("languages"))
                certifications = _as_list(_pick("certifications"))
                work_experience = _pick("work_experience", "workExperience", "experience")
                education = _pick("education")

                profile.skills = json.dumps(skills, ensure_ascii=True)
                profile.hard_skills = json.dumps(hard_skills, ensure_ascii=True)
                profile.techniques = json.dumps(techniques, ensure_ascii=True)
                profile.tools = json.dumps(tools, ensure_ascii=True)
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


def _parse_scraped_deadline(value) -> "datetime | None":
    """Best-effort ISO-date parse for a source-provided hiring deadline."""
    if not value:
        return None
    raw = str(value).strip()
    if not raw:
        return None
    try:
        if len(raw) == 10:
            return datetime.fromisoformat(raw)
        return datetime.fromisoformat(raw.replace("Z", "+00:00")).replace(tzinfo=None)
    except ValueError:
        return None


# Per-run ingestion budget fallback — only used if the ScraperSettings row
# is somehow missing (see scraper_service.get_scraper_settings); the normal
# path reads these from the admin-editable ScraperSettings row instead, so
# a single scrape run can't outgrow the resources reserved for it (see the
# dedicated 'scraping' queue/worker in celery_app.py).
_FALLBACK_SCRAPER_MAX_INGEST_PER_RUN = 200
_FALLBACK_SCRAPER_RUN_BUDGET_SECONDS = 300


def _scrape_budget_exhausted(
    ingested: int, started_at: datetime, now: datetime,
    max_ingest_per_run: int = _FALLBACK_SCRAPER_MAX_INGEST_PER_RUN,
    run_budget_seconds: int = _FALLBACK_SCRAPER_RUN_BUDGET_SECONDS,
) -> bool:
    """True once the run should stop pulling in more sources/items."""
    if ingested >= max_ingest_per_run:
        return True
    return (now - started_at).total_seconds() >= run_budget_seconds


def _record_scraper_source_run(db, source_id: str | None, status: str, detail: str | None, job_count: int) -> None:
    """Best-effort write-back of the last run's outcome onto its
    ScraperSource row — never let this break the actual scrape run."""
    if not source_id:
        return
    try:
        from app.models import ScraperSource

        row = db.query(ScraperSource).filter(ScraperSource.id == source_id).first()
        if row:
            row.last_run_at = datetime.utcnow()
            row.last_run_status = status
            row.last_run_detail = (detail or "")[:2000] or None
            row.last_run_job_count = job_count
    except Exception as exc:  # noqa: BLE001
        logger.warning(f"could not record scraper source run for {source_id}: {exc}")


@celery.task(
    name='app.workers.tasks.scrape_external_jobs',
    # Runs on its own low-priority queue/worker (see celery_app.py) so a heavy
    # or slow scrape run can never starve web-facing tasks (emails, CV
    # parsing) of worker capacity — this is the guardrail against the earlier
    # host-resource-exhaustion incident. rate_limit throttles bursts against
    # source sites; soft/time_limit bound a single run's wall-clock cost.
    rate_limit='6/m',
    soft_time_limit=8 * 60,
    time_limit=10 * 60,
)
@track_task_run('scrape_external_jobs')
def scrape_external_jobs() -> dict:
    """Fetch jobs from admin-configured external sources into the ScrapedJob queue (pending review)."""
    from app.models import ScrapedJob
    from app.services.scraper_service import get_adapters, get_scraper_settings, content_hash, classify_audience_lane, assess_scraped_job_quality

    db = SessionLocal()
    adapters: list = []
    ingested = 0
    skipped = 0
    sources_processed = 0
    budget_hit = False
    started_at = datetime.utcnow()
    try:
        adapters = get_adapters(db)
        if not adapters:
            logger.info("scrape_external_jobs: no scraper sources configured (or disabled); nothing to do")
            return {"sources": 0, "ingested": 0, "skipped": 0}

        settings = get_scraper_settings(db)
        max_ingest_per_run = settings.max_ingest_per_run
        run_budget_seconds = settings.run_budget_seconds

        now = datetime.utcnow()
        for adapter in adapters:
            if _scrape_budget_exhausted(ingested, started_at, datetime.utcnow(), max_ingest_per_run, run_budget_seconds):
                budget_hit = True
                break
            sources_processed += 1
            source_ingested = 0
            try:
                items = adapter.fetch()
            except Exception as e:
                logger.warning(f"scraper source '{adapter.name}' failed: {e}")
                _record_scraper_source_run(db, adapter.source_id, "error", str(e), 0)
                db.commit()
                continue
            # Batched dedup: previously every item cost up to 2 DB round-trips
            # (hash lookup + URL lookup) — hundreds of queries per run. Two IN
            # queries per source replace them; the dicts are then also updated
            # with rows added below so intra-batch duplicates keep deduping
            # (matching the old per-item autoflush behavior).
            prepared: list[tuple[dict, str, str]] = []
            for it in items:
                title = (it.get("title") or "").strip()
                if not title:
                    continue
                prepared.append((it, title, content_hash(title, it.get("company"), it.get("location"))))

            existing_by_hash: dict[str, ScrapedJob] = {}
            existing_by_url: dict[str, ScrapedJob] = {}
            batch_hashes = [chash for _, _, chash in prepared]
            batch_urls = [it["sourceUrl"] for it, _, _ in prepared if it.get("sourceUrl")]
            if batch_hashes:
                for row in db.query(ScrapedJob).filter(ScrapedJob.content_hash.in_(batch_hashes)).all():
                    existing_by_hash[row.content_hash] = row
            if batch_urls:
                for row in db.query(ScrapedJob).filter(ScrapedJob.source_url.in_(batch_urls)).all():
                    existing_by_url[row.source_url] = row

            for it, title, chash in prepared:
                if _scrape_budget_exhausted(ingested, started_at, datetime.utcnow(), max_ingest_per_run, run_budget_seconds):
                    budget_hit = True
                    break
                existing = existing_by_hash.get(chash)
                if not existing and it.get("sourceUrl"):
                    existing = existing_by_url.get(it["sourceUrl"])
                if existing:
                    existing.last_seen_at = now  # keep alive; don't re-create
                    new_deadline = _parse_scraped_deadline(it.get("deadline"))
                    if new_deadline:
                        existing.application_deadline = new_deadline
                    skipped += 1
                    source_ingested += 1
                    continue
                quality_score, quality_flags = assess_scraped_job_quality(
                    title, it.get("description"), it.get("company"),
                )
                created = ScrapedJob(
                    title=title, company_name=it.get("company"), location=it.get("location"),
                    category=it.get("category"), description=it.get("description"),
                    source=it.get("source"), source_url=it.get("sourceUrl"),
                    application_deadline=_parse_scraped_deadline(it.get("deadline")),
                    audience_lane=classify_audience_lane(title, it.get("category"), it.get("description")),
                    quality_score=quality_score,
                    quality_flags=json.dumps(quality_flags, ensure_ascii=False) if quality_flags else None,
                    status="pending", content_hash=chash, last_seen_at=now,
                )
                db.add(created)
                existing_by_hash[chash] = created
                if it.get("sourceUrl"):
                    existing_by_url[it["sourceUrl"]] = created
                ingested += 1
                source_ingested += 1
            _record_scraper_source_run(db, adapter.source_id, "ok" if source_ingested else "empty", None, source_ingested)
            db.commit()
            if budget_hit:
                break
        if budget_hit:
            logger.info(
                f"scrape_external_jobs: run budget exhausted after {sources_processed}/{len(adapters)} "
                f"source(s) — {ingested} ingested, {skipped} skipped so far"
            )
        else:
            logger.info(f"scrape_external_jobs: {ingested} ingested, {skipped} skipped from {len(adapters)} source(s)")
        return {
            "sources": len(adapters), "sourcesProcessed": sources_processed,
            "ingested": ingested, "skipped": skipped, "budgetExhausted": budget_hit,
        }
    except SoftTimeLimitExceeded:
        # Keep whatever was already committed per-source; don't lose the run entirely.
        logger.warning(f"scrape_external_jobs: soft time limit hit — {ingested} ingested before cutoff")
        return {"sources": len(adapters), "ingested": ingested, "skipped": skipped, "budgetExhausted": True}
    except Exception as e:
        logger.error(f"scrape_external_jobs failed: {str(e)}")
        db.rollback()
        return {"success": False, "error": str(e)}
    finally:
        db.close()


@celery.task(name='app.workers.tasks.expire_stale_aggregated_jobs')
@track_task_run('expire_stale_aggregated_jobs')
def expire_stale_aggregated_jobs() -> dict:
    """Archive aggregated jobs whose shelf life has passed."""
    from app.models import ScrapedJob, Job

    db = SessionLocal()
    expired = 0
    try:
        now = datetime.utcnow()
        stale = (
            db.query(ScrapedJob)
            .filter(ScrapedJob.expires_at.isnot(None), ScrapedJob.expires_at < now,
                    ScrapedJob.status == "approved")
            .all()
        )
        for s in stale:
            s.status = "expired"
            if s.published_job_id:
                job = db.query(Job).filter(Job.id == s.published_job_id).first()
                if job and job.status not in ("archived", "expired"):
                    job.status = "expired"
            expired += 1
        db.commit()
        return {"expired": expired}
    except Exception as e:
        logger.error(f"expire_stale_aggregated_jobs failed: {str(e)}")
        db.rollback()
        return {"success": False, "error": str(e)}
    finally:
        db.close()


@celery.task(name='app.workers.tasks.publish_scheduled_scraped_jobs')
@track_task_run('publish_scheduled_scraped_jobs')
def publish_scheduled_scraped_jobs() -> dict:
    """Publish ScrapedJob rows an admin approved-and-scheduled, once their
    scheduled_publish_at time arrives."""
    from app.models import ScrapedJob
    from app.api.v1.admin import _publish_scraped_job

    db = SessionLocal()
    published = 0
    try:
        now = datetime.utcnow()
        due = (
            db.query(ScrapedJob)
            .filter(ScrapedJob.status == "scheduled", ScrapedJob.scheduled_publish_at.isnot(None),
                    ScrapedJob.scheduled_publish_at <= now)
            .all()
        )
        for s in due:
            if s.published_job_id:
                continue  # already published somehow — don't double-publish
            _publish_scraped_job(db, s)
            published += 1
        db.commit()
        if published:
            logger.info(f"publish_scheduled_scraped_jobs: published {published} scheduled job(s)")
        return {"published": published}
    except Exception as e:
        logger.error(f"publish_scheduled_scraped_jobs failed: {str(e)}")
        db.rollback()
        return {"success": False, "error": str(e)}
    finally:
        db.close()


@celery.task(name='app.workers.tasks.dispatch_scraped_jobs_digest')
@track_task_run('dispatch_scraped_jobs_digest')
def dispatch_scraped_jobs_digest() -> dict:
    """Daily nudge to admins when scraped jobs are piling up unreviewed.
    Sends nothing when the pending queue is empty — no noise for no work."""
    from app.models import ScrapedJob
    from app.services.notification_service import admin_emails, notify_admins

    db = SessionLocal()
    try:
        pending_count = db.query(ScrapedJob).filter(ScrapedJob.status == "pending").count()
        if pending_count == 0:
            logger.info("dispatch_scraped_jobs_digest: nothing pending, skipping send")
            return {"pendingCount": 0, "sent": 0}

        recipients = admin_emails(db)
        sent = 0
        for email in recipients:
            if EmailService.send_scraped_jobs_digest_email(email, pending_count):
                sent += 1
        notify_admins(
            db, type="scraped_jobs_pending",
            title="Scraped jobs por rever",
            body=f"{pending_count} vaga(s) importada(s) aguardam curadoria.",
            link="/Portal/Admin/scraped",
        )
        return {"pendingCount": pending_count, "sent": sent, "recipients": len(recipients)}
    except Exception as e:
        logger.error(f"dispatch_scraped_jobs_digest failed: {str(e)}")
        return {"success": False, "error": str(e)}
    finally:
        db.close()


@celery.task(name='app.workers.tasks.cleanup_expired_tokens')
@track_task_run('cleanup_expired_tokens')
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
@track_task_run('dispatch_job_alert_digests')
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
@track_task_run('dispatch_subscription_expiry_reminders')
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


@celery.task(name='app.workers.tasks.generate_auto_apply_proposals')
@track_task_run('generate_auto_apply_proposals')
def generate_auto_apply_proposals() -> dict:
    """Periodic sweep: for every opted-in, eligible candidate, score newly
    published jobs in their chosen categories and create review proposals
    for the ones that clear the match threshold. Never submits an
    application itself — see app.services.auto_apply_service module docstring
    for why this stays a "propose then approve" queue."""
    from app.models import CandidateProfile
    from app.services.auto_apply_service import (
        candidate_is_eligible, expire_stale_proposals, generate_proposals_for_candidate,
    )
    from app.services.notification_service import create_notification

    db = SessionLocal()
    candidates_scanned = 0
    proposals_created = 0
    try:
        expired = expire_stale_proposals(db)

        profiles = db.query(CandidateProfile).filter(CandidateProfile.auto_apply_opt_in.is_(True)).all()
        for profile in profiles:
            if not candidate_is_eligible(db, profile):
                continue
            candidates_scanned += 1
            new_proposals = generate_proposals_for_candidate(db, profile)
            if new_proposals:
                proposals_created += len(new_proposals)
                create_notification(
                    db, profile.user_id, type="auto_apply_proposals",
                    title=f"{len(new_proposals)} nova(s) sugestão(ões) de candidatura",
                    body="Reveja e aprove candidaturas sugeridas com base no seu perfil.",
                    link="/Portal/Candidato/CV-e-Documentos",
                )
        return {
            "candidates_scanned": candidates_scanned,
            "proposals_created": proposals_created,
            "proposals_expired": expired,
        }
    except Exception as e:
        logger.error(f"Failed to generate auto-apply proposals: {str(e)}")
        db.rollback()
        return {"success": False, "error": str(e)}
    finally:
        db.close()


@celery.task(name="app.workers.tasks.run_hibp_breach_scan", soft_time_limit=3300, time_limit=3600)
@track_task_run('run_hibp_breach_scan')
def run_hibp_breach_scan() -> dict:
    """Daily Have I Been Pwned account-breach scan.

    Walks registered accounts oldest-checked-first (HIBP_DAILY_CHECK_LIMIT per
    run, HIBP_REQUEST_INTERVAL_SECONDS sleep between API calls to respect the
    rate tier). For each account found in a breach it wasn't already known to
    be in, records a high-severity `hibp_breach` security event; at the end of
    the run, one aggregated alert email goes to the admins listing the newly
    affected accounts (one email per run, not per account — the first-ever run
    will surface many old breaches at once).

    No-ops when HIBP_API_KEY is unset. Never raises past the task boundary.
    """
    import time as _time

    from app.services import hibp_service, security_service
    from app.services.email_service import EmailService

    if not hibp_service.hibp_enabled():
        logger.info("run_hibp_breach_scan: HIBP_API_KEY not set, skipping")
        return {"skipped": True, "reason": "no api key"}

    db = SessionLocal()
    checked = 0
    newly_breached: list[tuple[str, list[str]]] = []
    try:
        users = (
            db.query(User)
            .filter(User.suspended.is_(False))
            .order_by(User.hibp_checked_at.asc().nulls_first(), User.created_at.asc())
            .limit(max(1, settings.HIBP_DAILY_CHECK_LIMIT))
            .all()
        )
        for index, user in enumerate(users):
            if index > 0:
                _time.sleep(max(0.0, settings.HIBP_REQUEST_INTERVAL_SECONDS))
            breaches = hibp_service.check_email_breaches(user.email)
            if breaches is None:  # API error/rate limit — retry this user next run
                continue
            user.hibp_checked_at = datetime.utcnow()
            checked += 1

            if breaches:
                known = _known_hibp_breaches(db, user.email)
                fresh = sorted(set(breaches) - known)
                if fresh:
                    security_service.record_security_event(
                        db,
                        event_type="hibp_breach",
                        severity="high",
                        email=user.email,
                        details={"breaches": fresh, "allBreaches": breaches},
                    )
                    newly_breached.append((user.email, fresh))
            db.commit()

        if newly_breached:
            lines = [
                f"A verificação diária Have I Been Pwned encontrou {len(newly_breached)} "
                "conta(s) presentes em fugas de dados que ainda não estavam registadas:",
            ]
            for email, names in newly_breached[:20]:
                lines.append(f"{email} — {', '.join(names)}")
            if len(newly_breached) > 20:
                lines.append(f"... e mais {len(newly_breached) - 20} conta(s) no separador Segurança.")
            lines.append(
                "Considere notificar os utilizadores afetados para trocarem a palavra-passe. "
                "Detalhe completo no separador Segurança do portal de administração."
            )
            EmailService.send_security_alert_email(
                subject="Contas encontradas em fugas de dados (HIBP)",
                title="Verificação diária Have I Been Pwned",
                lines=lines,
            )

        return {"checked": checked, "newlyBreached": len(newly_breached)}
    except SoftTimeLimitExceeded:
        logger.warning("run_hibp_breach_scan hit soft time limit after %d checks", checked)
        return {"checked": checked, "newlyBreached": len(newly_breached), "timedOut": True}
    except Exception as e:
        logger.error(f"run_hibp_breach_scan failed: {e}")
        db.rollback()
        return {"success": False, "error": str(e), "checked": checked}
    finally:
        db.close()


def _known_hibp_breaches(db, email: str) -> set[str]:
    """Breach names already recorded for this email in prior scans — so each
    run only alerts on NEW breaches, not the same old ones every day."""
    from app.models import SecurityEvent

    known: set[str] = set()
    rows = (
        db.query(SecurityEvent)
        .filter(
            SecurityEvent.event_type == "hibp_breach",
            SecurityEvent.email == email.strip().lower(),
        )
        .all()
    )
    for row in rows:
        try:
            info = json.loads(row.details or "{}")
            known.update(info.get("allBreaches") or info.get("breaches") or [])
        except Exception:  # noqa: BLE001
            continue
    return known
