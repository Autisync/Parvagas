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
"""
import json
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import RedirectResponse
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.config import get_settings
from app.core.logging import get_logger
from app.core.observability import limiter
from app.db.session import get_db
from app.models import AuditLog, OAuthAuthorizationCode, SSOHandoffCode, User

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
