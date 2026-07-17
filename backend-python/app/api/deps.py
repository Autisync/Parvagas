"""Shared API dependencies."""
from datetime import datetime, timezone

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models import User


def get_current_user(request: Request, db: Session = Depends(get_db)) -> User:
    """Resolve authenticated user from middleware-provided claims."""
    claims = getattr(request.state, "auth_claims", None)
    auth_error = getattr(request.state, "auth_error", None)

    if not claims:
        detail = auth_error or "Not authenticated"
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=detail)

    user_id = claims.get("sub") or claims.get("user_id")
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token subject")

    user = db.query(User).filter(User.id == str(user_id)).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")

    if user.suspended:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account suspended")

    if user.tokens_revoked_at is not None:
        issued_at = claims.get("iat")
        revoked_at = user.tokens_revoked_at
        if revoked_at.tzinfo is None:
            revoked_at = revoked_at.replace(tzinfo=timezone.utc)
        # No `iat` means a pre-force-logout token shape — treat as revoked
        # rather than silently trusting it.
        if issued_at is None or datetime.fromtimestamp(int(issued_at), tz=timezone.utc) < revoked_at:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session revoked, please log in again")

    return user
