"""Public newsletter signup — email opt-in for job-opening announcements."""
from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.security import has_leading_formula_char, is_valid_email_format
from app.db.session import get_db
from app.models import NewsletterSubscriber
from app.workers.tasks import send_newsletter_confirmation_email
from app.core.logging import get_logger

logger = get_logger(__name__)
router = APIRouter(tags=["newsletter"])


class NewsletterSubscribeRequest(BaseModel):
    email: str
    source: str | None = None


@router.post("/newsletter/subscribe")
async def subscribe_newsletter(
    payload: NewsletterSubscribeRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    from app.core.captcha import verify_captcha

    _ip = request.client.host if request.client else None
    if not await verify_captcha(request.headers.get("x-captcha-token"), action="newsletter_subscribe", remote_ip=_ip):
        from app.services.security_service import record_security_event
        record_security_event(db, event_type="captcha_failed", ip_address=_ip, user_agent=request.headers.get("user-agent"), details={"action": "newsletter_subscribe"})
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Verificação anti-robô falhou. Tente novamente.")

    email = (payload.email or "").strip().lower()
    if not email or not is_valid_email_format(email) or has_leading_formula_char(email):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="E-mail inválido.")

    source = (payload.source or "").strip()[:50] or None
    if source and has_leading_formula_char(source):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Origem inválida.")

    existing = db.query(NewsletterSubscriber).filter(NewsletterSubscriber.email == email).first()
    if existing:
        if existing.unsubscribed_at is not None:
            existing.unsubscribed_at = None
            db.commit()
        return {"message": "Subscrição confirmada."}

    subscriber = NewsletterSubscriber(
        email=email,
        source=source,
    )
    db.add(subscriber)
    db.commit()

    send_newsletter_confirmation_email.delay(email)

    return {"message": "Subscrição confirmada."}


class NewsletterUnsubscribeRequest(BaseModel):
    token: str


@router.post("/newsletter/unsubscribe")
async def unsubscribe_newsletter(payload: NewsletterUnsubscribeRequest, db: Session = Depends(get_db)):
    token = (payload.token or "").strip()
    if not token:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Token em falta.")

    subscriber = db.query(NewsletterSubscriber).filter(NewsletterSubscriber.unsubscribe_token == token).first()
    if not subscriber:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Subscrição não encontrada.")

    if subscriber.unsubscribed_at is None:
        from datetime import datetime

        subscriber.unsubscribed_at = datetime.utcnow()
        db.commit()

    return {"message": "Subscrição cancelada."}
