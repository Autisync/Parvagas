"""SSO bridge: Parvagas acts as an OIDC provider for the self-hosted
Reactive Resume CV builder (cv.parvagas.pt), configured on that side as a
generic OIDC client (OAUTH_AUTHORIZATION_URL/OAUTH_TOKEN_URL/OAUTH_USER_INFO_URL
pointing back here, OAUTH_CLIENT_SECRET = settings.RESUME_BUILDER_SECRET).

Two-step code exchange, not the usual single OIDC authorization code, because
Parvagas auth is pure bearer-token (JWT in the frontend's localStorage, no
session cookie) — see app.main's attach_auth_context. A real /oauth/authorize
hit arrives as a full-page browser GET redirect from Reactive Resume, which
cannot carry an Authorization header. So:

  1. The Next.js frontend, while it still holds the bearer token, calls
     POST /resume-sso/handoff (authenticated) to mint a ~60s single-use
     SSOHandoffCode tied to the user.
  2. The frontend then navigates the browser to GET /oauth/authorize with
     that handoff code attached, which consumes it, resolves the user, mints
     a proper OAuthAuthorizationCode, and 302s to Reactive Resume's
     redirect_uri with the OIDC `code`.
  3. Reactive Resume's OWN backend exchanges that code server-to-server at
     POST /oauth/token for an ID token — signed with RESUME_BUILDER_SECRET,
     deliberately NOT settings.JWT_SECRET, so a token minted for/leaked from
     the CV builder can never be replayed against Parvagas's own API.

Single-client allow-list (RESUME_SSO_CLIENT_ID/RESUME_SSO_REDIRECT_URI) —
no OAuth client registry table, since Reactive Resume is the only consumer.

PIVOT (2026-07-12, see FEASIBILITY_NATIVE_CV_BUILDER.md): the CV builder is
being rebuilt natively inside the Parvagas portal instead of embedding
Reactive Resume, so this whole OIDC bridge has no live caller anymore — the
three frontend entry points now link straight to
/Portal/Candidato/Construtor-CV instead of minting a handoff code. Kept
dark (harmless, still tested) rather than deleted here; EXECUTION_PLAN_
NATIVE_CV_BUILDER.md's A7 owns the deliberate removal once Phase A ships.
`guest_start` below is the one endpoint that DID change — it now returns a
normal login response instead of a handoff code, since the guest's next
stop is the native editor, not an external OIDC redirect.
"""
import json
import re
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import RedirectResponse
from jose import JWTError, jwt
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.config import get_settings
from app.core.logging import get_logger
from app.core.observability import limiter
from app.core.security import hash_password
from app.db.session import get_db
from app.models import AuditLog, CandidateProfile, OAuthAuthorizationCode, SSOHandoffCode, User, UserRole
from app.schemas import UserResponse
from app.services.auth_service import AuthService
from app.workers.tasks import send_verification_email

settings = get_settings()
logger = get_logger(__name__)
router = APIRouter(tags=["resume-sso"])

HANDOFF_TTL_SECONDS = 60
AUTH_CODE_TTL_SECONDS = 60
ACCESS_TOKEN_TTL_SECONDS = 3600
_SSO_ALGORITHM = "HS256"


def _audit(db: Session, *, action: str, user_id: str | None, extra: dict | None = None) -> None:
    """Durable audit row for every SSO bridge step. Never raises."""
    try:
        db.add(AuditLog(
            actor_user_id=user_id,
            action=action,
            resource_type="resume_sso",
            resource_id=user_id,
            details=json.dumps(extra or {}),
        ))
        db.commit()
    except Exception as e:  # pragma: no cover - defensive
        logger.warning(f"resume_sso audit ({action}) failed: {e}")
        db.rollback()


@router.post("/resume-sso/handoff")
@limiter.limit("30/hour")
async def create_handoff_code(
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Mint a short-lived bridge code for an already-authenticated candidate,
    to be carried on the next full-page redirect into /oauth/authorize."""
    code = secrets.token_urlsafe(32)
    db.add(SSOHandoffCode(
        code=code,
        user_id=current_user.id,
        expires_at=datetime.utcnow() + timedelta(seconds=HANDOFF_TTL_SECONDS),
    ))
    db.commit()
    _audit(db, action="resume_sso.handoff", user_id=current_user.id)
    return {"code": code, "expiresIn": HANDOFF_TTL_SECONDS}


class GuestStartRequest(BaseModel):
    fullName: str
    email: str


def _split_name(full_name: str) -> tuple[str, str]:
    parts = full_name.strip().split(None, 1)
    if len(parts) == 2:
        return parts[0], parts[1]
    return (parts[0], "") if parts else ("", "")


@router.post("/public/resume-sso/guest-start")
@limiter.limit("5/hour")
async def guest_start(
    request: Request,
    payload: GuestStartRequest,
    db: Session = Depends(get_db),
):
    """"Build a CV from scratch" entry point for visitors with no account —
    same find-or-create-by-email shadow-account pattern as the sibling guest
    CV-drop endpoint (POST /public/cv-submissions in jobs.py), but skips the
    file upload/parse entirely. Returns a normal login response (access
    token + user, same shape as POST /auth/login) so the frontend can log
    the guest straight into the native CV builder — no SSO handoff code,
    since there's no external app to hand off to anymore. The account
    isn't a dead end — new users get a verification email and can claim a
    real password later via the existing forgot-password flow, exactly like
    today's guest CV-drop accounts."""
    full_name = payload.fullName.strip()
    email_norm = payload.email.strip().lower()
    if not full_name or not email_norm:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Nome completo e email são obrigatórios.")
    if not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", email_norm):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email inválido.")

    user = db.query(User).filter(User.email == email_norm).first()
    is_new_user = user is None
    if user and user.role != UserRole.candidate:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Este email já está associado a outro tipo de conta.")

    if not user:
        generated_password = secrets.token_urlsafe(18)
        user = User(
            email=email_norm, full_name=full_name,
            password_hash=hash_password(generated_password), role=UserRole.candidate,
            is_guest_account=True,
        )
        db.add(user)
        db.flush()

    profile = db.query(CandidateProfile).filter(CandidateProfile.user_id == user.id).first()
    if not profile:
        first_name, last_name = _split_name(full_name)
        profile = CandidateProfile(user_id=user.id, first_name=first_name, last_name=last_name)
        db.add(profile)
    db.flush()

    db.commit()

    if is_new_user:
        raw_token = AuthService.create_verification_token(db, user)
        send_verification_email.delay(str(user.id), raw_token)

    _audit(db, action="resume_sso.guest_start", user_id=user.id, extra={"isNewUser": is_new_user})

    token = AuthService.create_access_token(user)
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": UserResponse.model_validate(AuthService.build_user_response(db, user)),
        "isNewUser": is_new_user,
    }


@router.get("/oauth/authorize")
async def authorize(
    request: Request,
    client_id: str = Query(...),
    redirect_uri: str = Query(...),
    response_type: str = Query("code"),
    scope: str = Query("openid profile email"),
    state: str | None = Query(None),
    nonce: str | None = Query(None),
    handoff: str = Query(...),
    db: Session = Depends(get_db),
):
    """OIDC authorization endpoint. Consumes the handoff code minted by
    POST /resume-sso/handoff, resolves the candidate, mints a proper
    single-use OAuth authorization code, and redirects back to Reactive
    Resume's callback."""
    if response_type != "code":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="unsupported_response_type")
    if client_id != settings.RESUME_SSO_CLIENT_ID:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="unauthorized_client")
    if not settings.RESUME_SSO_REDIRECT_URI or redirect_uri != settings.RESUME_SSO_REDIRECT_URI:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="invalid_redirect_uri")

    now = datetime.utcnow()
    handoff_row = (
        db.query(SSOHandoffCode)
        .filter(SSOHandoffCode.code == handoff, SSOHandoffCode.consumed_at.is_(None))
        .first()
    )
    if not handoff_row or handoff_row.expires_at < now:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="invalid_or_expired_handoff")
    handoff_row.consumed_at = now

    auth_code = secrets.token_urlsafe(32)
    db.add(OAuthAuthorizationCode(
        code=auth_code,
        user_id=handoff_row.user_id,
        client_id=client_id,
        redirect_uri=redirect_uri,
        scope=scope,
        nonce=nonce,
        expires_at=now + timedelta(seconds=AUTH_CODE_TTL_SECONDS),
    ))
    db.commit()
    _audit(db, action="resume_sso.authorize", user_id=handoff_row.user_id, extra={"client_id": client_id})

    query = f"code={auth_code}"
    if state:
        query += f"&state={state}"
    return RedirectResponse(url=f"{redirect_uri}?{query}", status_code=status.HTTP_302_FOUND)


@router.post("/oauth/token")
async def token(
    request: Request,
    db: Session = Depends(get_db),
):
    """OIDC token endpoint — called server-to-server by Reactive Resume's
    backend, never by the browser. Accepts standard OAuth form-encoded or
    JSON body (grant_type, code, redirect_uri, client_id, client_secret)."""
    content_type = request.headers.get("content-type", "")
    if "application/json" in content_type:
        body = await request.json()
    else:
        form = await request.form()
        body = dict(form)

    grant_type = body.get("grant_type")
    code = body.get("code")
    redirect_uri = body.get("redirect_uri")
    client_id = body.get("client_id")
    client_secret = body.get("client_secret")

    if grant_type != "authorization_code":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="unsupported_grant_type")
    if not settings.RESUME_BUILDER_SECRET or client_secret != settings.RESUME_BUILDER_SECRET:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid_client")
    if client_id != settings.RESUME_SSO_CLIENT_ID:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid_client")

    now = datetime.utcnow()
    auth_row = (
        db.query(OAuthAuthorizationCode)
        .filter(OAuthAuthorizationCode.code == code, OAuthAuthorizationCode.consumed_at.is_(None))
        .first()
    )
    if not auth_row or auth_row.expires_at < now or auth_row.client_id != client_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="invalid_grant")
    if redirect_uri and auth_row.redirect_uri != redirect_uri:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="invalid_grant")
    auth_row.consumed_at = now
    db.commit()

    user = db.query(User).filter(User.id == auth_row.user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="invalid_grant")

    issued_at = datetime.now(timezone.utc)
    expires_at = issued_at + timedelta(seconds=ACCESS_TOKEN_TTL_SECONDS)
    base_claims = {
        "iss": settings.BACKEND_URL,
        "aud": client_id,
        "sub": str(user.id),
        "email": user.email,
        "email_verified": bool(user.email_verified),
        "name": user.full_name,
        "iat": int(issued_at.timestamp()),
        "exp": int(expires_at.timestamp()),
    }
    if auth_row.nonce:
        base_claims["nonce"] = auth_row.nonce

    id_token = jwt.encode(base_claims, settings.RESUME_BUILDER_SECRET, algorithm=_SSO_ALGORITHM)
    access_token = jwt.encode(
        {**base_claims, "scope": auth_row.scope or "openid profile email"},
        settings.RESUME_BUILDER_SECRET,
        algorithm=_SSO_ALGORITHM,
    )
    _audit(db, action="resume_sso.token", user_id=user.id, extra={"client_id": client_id})

    return {
        "access_token": access_token,
        "id_token": id_token,
        "token_type": "Bearer",
        "expires_in": ACCESS_TOKEN_TTL_SECONDS,
        "scope": auth_row.scope or "openid profile email",
    }


@router.get("/oauth/userinfo")
async def userinfo(request: Request, db: Session = Depends(get_db)):
    """OIDC userinfo endpoint. Bearer-auth'd with the access token issued by
    /oauth/token — validated against RESUME_BUILDER_SECRET, NOT the app's own
    JWT_SECRET, since this is a separate trust boundary."""
    authorization = request.headers.get("authorization", "")
    if not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid_token")
    token_str = authorization.split(" ", 1)[1].strip()

    try:
        claims = jwt.decode(
            token_str, settings.RESUME_BUILDER_SECRET, algorithms=[_SSO_ALGORITHM], audience=settings.RESUME_SSO_CLIENT_ID,
        )
    except JWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid_token")

    user = db.query(User).filter(User.id == claims.get("sub")).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid_token")

    return {
        "sub": str(user.id),
        "email": user.email,
        "email_verified": bool(user.email_verified),
        "name": user.full_name,
    }


@router.get("/.well-known/openid-configuration")
async def openid_configuration():
    """Static OIDC discovery document. No JWKS — Reactive Resume is
    configured with the manual authorize/token/userinfo URLs directly and a
    shared HS256 secret (RESUME_BUILDER_SECRET), so no jwks_uri is needed."""
    base = settings.BACKEND_URL.rstrip("/")
    return {
        "issuer": base,
        "authorization_endpoint": f"{base}/api/v1/oauth/authorize",
        "token_endpoint": f"{base}/api/v1/oauth/token",
        "userinfo_endpoint": f"{base}/api/v1/oauth/userinfo",
        "response_types_supported": ["code"],
        "subject_types_supported": ["public"],
        "id_token_signing_alg_values_supported": [_SSO_ALGORITHM],
        "scopes_supported": ["openid", "profile", "email"],
    }
