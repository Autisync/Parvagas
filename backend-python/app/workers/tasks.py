"""Celery tasks for async operations."""
import json
import os
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
from urllib.parse import quote
from celery.exceptions import SoftTimeLimitExceeded
from app.workers.celery_app import celery
from app.db.session import SessionLocal
from app.models import User, UserRole, EmailVerificationToken, PasswordResetToken, CVUpload, NewsletterIssue, NewsletterSubscriber
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


@celery.task(name='app.workers.tasks.send_newsletter_issue')
@track_task_run('send_newsletter_issue')
def send_newsletter_issue(issue_id: str, jobs_html: str = "") -> dict:
    """Fan-out a composed newsletter to every active subscriber. Each
    recipient goes through the generic send_templated_email dispatcher (not
    a dedicated task) so every send gets EmailLog coverage in the admin
    deliverability panel. No autoretry here — this task only issues cheap
    in-process .delay() calls; retrying it would risk double-queuing
    already-dispatched per-subscriber sends."""
    db = SessionLocal()
    try:
        issue = db.query(NewsletterIssue).filter(NewsletterIssue.id == issue_id).first()
        if not issue:
            logger.error(f"send_newsletter_issue: issue {issue_id} not found")
            return {"success": False, "error": "issue not found"}

        subscribers = db.query(NewsletterSubscriber).filter(NewsletterSubscriber.unsubscribed_at.is_(None)).all()
        paragraphs = json.loads(issue.intro_paragraphs or "[]")
        frontend_url = (settings.FRONTEND_URL or "https://parvagas.pt").rstrip("/")

        for subscriber in subscribers:
            send_templated_email.delay("send_newsletter_issue_email", {
                "email": subscriber.email,
                "subject": issue.subject,
                "intro_paragraphs": paragraphs,
                "jobs_html": jobs_html,
                "unsubscribe_url": f"{frontend_url}/newsletter/cancelar?token={subscriber.unsubscribe_token}",
            })

        issue.status = "sent"
        issue.sent_at = datetime.utcnow()
        issue.queued_count = len(subscribers)
        db.commit()

        return {"success": True, "queuedCount": len(subscribers)}
    except Exception as e:
        logger.error(f"Failed to send newsletter issue {issue_id}: {str(e)}")
        db.rollback()
        try:
            issue = db.query(NewsletterIssue).filter(NewsletterIssue.id == issue_id).first()
            if issue:
                issue.status = "failed"
                db.commit()
        except Exception:  # noqa: BLE001 — best-effort status update
            pass
        return {"success": False, "error": str(e)}
    finally:
        db.close()


def _log_email_attempt(template: str, payload: dict, success: bool, error: str | None) -> None:
    """Best-effort deliverability record — one row per attempt (a retried
    send logs once per attempt, not once per logical email; a template
    that's actually struggling still shows up with a worse ratio either
    way). Opens its own short-lived session since this task has no
    request-scoped db. Never let logging break the send/retry."""
    try:
        import hashlib
        from app.db.session import SessionLocal
        from app.models import EmailLog

        recipient = (payload or {}).get("email") or ""
        db = SessionLocal()
        try:
            db.add(EmailLog(
                template=template,
                recipient_hash=hashlib.sha256(recipient.strip().lower().encode("utf-8")).hexdigest() if recipient else None,
                success=success,
                error=(error or "")[:2000] or None,
            ))
            db.commit()
        finally:
            db.close()
    except Exception as exc:  # noqa: BLE001
        logger.warning(f"could not record email log for '{template}': {exc}")


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
        _log_email_attempt(method, payload, True, None)
        return ok
    except Exception as e:
        logger.error(f"Failed to send templated email '{method}': {str(e)}")
        _log_email_attempt(method, payload, False, str(e))
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


def _record_scraper_source_validators(db, source_id: str | None, outcome) -> None:
    """Persist fresh conditional-GET validators (ETag/Last-Modified/body
    hash) onto the ScraperSource row so the *next* run can send them back
    and short-circuit an unchanged feed. Best-effort, same as
    _record_scraper_source_run."""
    if not source_id or outcome is None:
        return
    try:
        from app.models import ScraperSource

        row = db.query(ScraperSource).filter(ScraperSource.id == source_id).first()
        if row:
            if outcome.etag is not None:
                row.http_etag = outcome.etag[:500]
            if outcome.last_modified is not None:
                row.http_last_modified = outcome.last_modified[:200]
            if outcome.body_hash is not None:
                row.last_body_hash = outcome.body_hash
    except Exception as exc:  # noqa: BLE001
        logger.warning(f"could not record scraper source validators for {source_id}: {exc}")


def _find_matching_live_job(db, title: str, company: str | None):
    """Best-effort match against a Job a real employer already posted
    directly through the platform (Company portal) — lets the scraper skip
    re-adding something that's already live rather than duplicating it into
    the curation queue. Deliberately excludes aggregator-published Jobs
    (`source` set) so this only catches genuine employer postings; scraped-
    vs-scraped duplicates are already handled by the content_hash/source_url
    dedup above this call in the ingestion loop."""
    norm_title = (title or "").strip().lower()
    norm_company = (company or "").strip().lower()
    if not norm_title or not norm_company:
        return None
    from sqlalchemy import func
    from app.models import Job, Company
    from app.api.v1.jobs import PUBLIC_JOB_STATUSES

    return (
        db.query(Job)
        .join(Company, Job.company_id == Company.id)
        .filter(
            Job.status.in_(PUBLIC_JOB_STATUSES),
            Job.source.is_(None),
            func.lower(func.trim(Job.title)) == norm_title,
            func.lower(func.trim(Company.name)) == norm_company,
        )
        .first()
    )


_SCRAPE_FETCH_MAX_WORKERS = 4


def _fetch_adapters_parallel(adapters: list) -> list[tuple]:
    """Fetch a batch of adapters concurrently (network I/O only — no DB
    session is touched here or from any worker thread; ingestion happens
    back on the caller's thread after this returns). Returns
    (adapter, items, error) tuples in COMPLETION order, not input order —
    the caller doesn't depend on ordering within a batch.

    Politeness: a per-host threading.Semaphore(1), built up front so the
    dict itself is never mutated concurrently, ensures two sources on the
    same host never fetch at the same time; different hosts still run in
    parallel up to _SCRAPE_FETCH_MAX_WORKERS at once."""
    host_locks: dict[str, threading.Semaphore] = {}
    for adapter in adapters:
        host = adapter.host_key()
        if host not in host_locks:
            host_locks[host] = threading.Semaphore(1)

    def _run(adapter):
        with host_locks[adapter.host_key()]:
            try:
                return adapter, adapter.fetch(), None
            except Exception as e:  # noqa: BLE001 — surfaced to the caller, not raised in-thread
                return adapter, None, e

    results: list[tuple] = []
    with ThreadPoolExecutor(max_workers=min(_SCRAPE_FETCH_MAX_WORKERS, len(adapters))) as executor:
        futures = [executor.submit(_run, adapter) for adapter in adapters]
        for future in as_completed(futures):
            results.append(future.result())
    return results


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
    from app.services.feature_flags import get_flag
    from app.api.v1.admin import _publish_scraped_job, _list_to_json

    db = SessionLocal()
    adapters: list = []
    ingested = 0
    skipped = 0
    auto_approved = 0
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
        # Fetch (network I/O) happens in parallel, chunked by
        # _SCRAPE_FETCH_MAX_WORKERS so a budget check between chunks still
        # stops the run from dispatching new fetches once exhausted —
        # ingestion (DB writes) always happens back here, sequentially, one
        # adapter's results at a time, same as before parallelizing fetch.
        for chunk_start in range(0, len(adapters), _SCRAPE_FETCH_MAX_WORKERS):
            if _scrape_budget_exhausted(ingested, started_at, datetime.utcnow(), max_ingest_per_run, run_budget_seconds):
                budget_hit = True
                break
            chunk = adapters[chunk_start:chunk_start + _SCRAPE_FETCH_MAX_WORKERS]
            fetch_results = _fetch_adapters_parallel(chunk)

            for adapter, items, fetch_error in fetch_results:
                if _scrape_budget_exhausted(ingested, started_at, datetime.utcnow(), max_ingest_per_run, run_budget_seconds):
                    budget_hit = True
                    break
                sources_processed += 1
                source_ingested = 0
                if fetch_error is not None:
                    logger.warning(f"scraper source '{adapter.name}' failed: {fetch_error}")
                    _record_scraper_source_run(db, adapter.source_id, "error", str(fetch_error), 0)
                    db.commit()
                    continue

                # Conditional-GET short-circuit: the source confirmed (via 304
                # or an identical body hash) that nothing changed since last
                # run — skip parsing/dedup entirely for this source.
                # Validators are still refreshed (a 304 can arrive with a
                # rotated ETag).
                if adapter.last_fetch is not None and adapter.last_fetch.unchanged:
                    _record_scraper_source_validators(db, adapter.source_id, adapter.last_fetch)
                    _record_scraper_source_run(db, adapter.source_id, "unchanged", None, 0)
                    db.commit()
                    continue

                # Batched dedup: previously every item cost up to 2 DB
                # round-trips (hash lookup + URL lookup) — hundreds of
                # queries per run. Two IN queries per source replace them;
                # the dicts are then also updated with rows added below so
                # intra-batch duplicates keep deduping (matching the old
                # per-item autoflush behavior).
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
                    live_match = _find_matching_live_job(db, title, it.get("company"))
                    if live_match is not None:
                        duplicate_row = ScrapedJob(
                            title=title, company_name=it.get("company"), location=it.get("location"),
                            category=it.get("category"), description=it.get("description"),
                            source=it.get("source"), source_url=it.get("sourceUrl"),
                            application_deadline=_parse_scraped_deadline(it.get("deadline")),
                            audience_lane=classify_audience_lane(title, it.get("category"), it.get("description")),
                            status="duplicate", duplicate_of=live_match.id,
                            content_hash=chash, last_seen_at=now,
                        )
                        db.add(duplicate_row)
                        existing_by_hash[chash] = duplicate_row
                        if it.get("sourceUrl"):
                            existing_by_url[it["sourceUrl"]] = duplicate_row
                        skipped += 1
                        source_ingested += 1
                        continue
                    # Structured content (when a source's feed actually provides
                    # it) both fills in the same fields an admin would otherwise
                    # curate by hand, and feeds the quality gate below — a
                    # listing missing both is flagged, so quality_score can only
                    # reach 0 (eligible for auto-approve) when a source's feed is
                    # genuinely complete, not just has a long description.
                    responsibilities_json = _list_to_json(it.get("responsibilities"))
                    requirements_json = _list_to_json(it.get("requirements"))
                    quality_score, quality_flags = assess_scraped_job_quality(
                        title, it.get("description"), it.get("company"),
                        has_responsibilities=bool(responsibilities_json), has_requirements=bool(requirements_json),
                    )
                    created = ScrapedJob(
                        title=title, company_name=it.get("company"), location=it.get("location"),
                        category=it.get("category"), description=it.get("description"),
                        source=it.get("source"), source_url=it.get("sourceUrl"),
                        application_deadline=_parse_scraped_deadline(it.get("deadline")),
                        audience_lane=classify_audience_lane(title, it.get("category"), it.get("description")),
                        responsibilities=responsibilities_json, requirements=requirements_json,
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
                    # Trusted-source auto-approve: gated OFF by default at both
                    # the global flag and per-source levels — an admin must
                    # deliberately opt in to both before anything here
                    # publishes without human review. quality_score == 0 (no
                    # flags at all) keeps this to the cleanest items only.
                    if (
                        adapter.trusted_auto_approve
                        and quality_score == 0
                        and not quality_flags
                        and get_flag("SCRAPER_AUTO_APPROVE_ENABLED", False, db=db)
                    ):
                        _publish_scraped_job(db, created)
                        auto_approved += 1
                _record_scraper_source_validators(db, adapter.source_id, adapter.last_fetch)
                _record_scraper_source_run(db, adapter.source_id, "ok" if source_ingested else "empty", None, source_ingested)
                db.commit()
                if budget_hit:
                    break
            if budget_hit:
                break
        if budget_hit:
            logger.info(
                f"scrape_external_jobs: run budget exhausted after {sources_processed}/{len(adapters)} "
                f"source(s) — {ingested} ingested ({auto_approved} auto-approved), {skipped} skipped so far"
            )
        else:
            logger.info(
                f"scrape_external_jobs: {ingested} ingested ({auto_approved} auto-approved), "
                f"{skipped} skipped from {len(adapters)} source(s)"
            )
        return {
            "sources": len(adapters), "sourcesProcessed": sources_processed,
            "ingested": ingested, "skipped": skipped, "autoApproved": auto_approved,
            "budgetExhausted": budget_hit,
        }
    except SoftTimeLimitExceeded:
        # Keep whatever was already committed per-source; don't lose the run entirely.
        logger.warning(f"scrape_external_jobs: soft time limit hit — {ingested} ingested before cutoff")
        return {
            "sources": len(adapters), "ingested": ingested, "skipped": skipped,
            "autoApproved": auto_approved, "budgetExhausted": True,
        }
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
    """Daily: remind companies AND candidates whose plan expires within
    `days_ahead` days. Skips anything with cancel_requested_at set (Wave
    P2) — no point nagging someone to renew a plan they already asked to
    cancel; subscription_lifecycle_service finalizes those at period end
    instead."""
    from datetime import timedelta
    from app.models import CandidateCVSubscription, CandidateProfile, Company, Plan, Subscription, User
    from app.services.candidate_billing_service import get_cv_builder_plans

    db = SessionLocal()
    sent = 0
    try:
        now = datetime.utcnow()
        horizon = now + timedelta(days=days_ahead)

        company_subs = (
            db.query(Subscription)
            .filter(
                Subscription.status == "active",
                Subscription.cancel_requested_at.is_(None),
                Subscription.current_period_end.isnot(None),
                Subscription.current_period_end >= now,
                Subscription.current_period_end <= horizon,
            )
            .all()
        )
        for sub in company_subs:
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

        candidate_subs = (
            db.query(CandidateCVSubscription)
            .filter(
                CandidateCVSubscription.status == "active",
                CandidateCVSubscription.plan_tier != "free",
                CandidateCVSubscription.cancel_requested_at.is_(None),
                CandidateCVSubscription.current_period_end.isnot(None),
                CandidateCVSubscription.current_period_end >= now,
                CandidateCVSubscription.current_period_end <= horizon,
            )
            .all()
        )
        plans_by_tier = {p["tier"]: p for p in get_cv_builder_plans(db)}
        for sub in candidate_subs:
            profile = db.query(CandidateProfile).filter(CandidateProfile.id == sub.candidate_profile_id).first()
            user = db.query(User).filter(User.id == profile.user_id).first() if profile else None
            if not user or not user.email:
                continue
            plan_name = plans_by_tier.get(sub.plan_tier, {}).get("name", sub.plan_tier)
            days_left = max(0, (sub.current_period_end - now).days)
            EmailService.send_subscription_expiring_email(user.email, user.full_name or "", plan_name, days_left)
            sent += 1

        return {"reminders_sent": sent}
    except Exception as e:
        logger.error(f"Failed to dispatch expiry reminders: {str(e)}")
        return {"success": False, "error": str(e)}
    finally:
        db.close()


@celery.task(name='app.workers.tasks.process_lapsed_subscriptions')
@track_task_run('process_lapsed_subscriptions')
def process_lapsed_subscriptions() -> dict:
    """Daily: finalize subscriptions whose current_period_end has passed —
    grace-period notice on day 0, expiry after GRACE_PERIOD_DAYS. See
    app.services.subscription_lifecycle_service module docstring for why
    there's no auto-charge retry step on this platform."""
    from app.services.subscription_lifecycle_service import process_lapsed_subscriptions as _process

    db = SessionLocal()
    try:
        return _process(db)
    except Exception as e:
        logger.error(f"Failed to process lapsed subscriptions: {str(e)}")
        db.rollback()
        return {"success": False, "error": str(e)}
    finally:
        db.close()


@celery.task(name='app.workers.tasks.check_breach_notification_deadlines')
@track_task_run('check_breach_notification_deadlines')
def check_breach_notification_deadlines() -> dict:
    """Runs every 6h (not daily — a 72h legal deadline needs finer-grained
    monitoring than the once-a-day cadence used elsewhere in this file).
    See app.services.incident_service.check_notification_deadlines."""
    from app.services.incident_service import check_notification_deadlines

    db = SessionLocal()
    try:
        return check_notification_deadlines(db)
    except Exception as e:
        logger.error(f"Failed to check breach notification deadlines: {str(e)}")
        db.rollback()
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
