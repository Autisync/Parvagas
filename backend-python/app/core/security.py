"""Security utilities for JWT, password hashing, etc."""
import re
from datetime import datetime, timedelta, timezone
from typing import Optional
import jwt
from jwt import PyJWTError
from passlib.context import CryptContext

from app.core.config import get_settings


settings = get_settings()
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

EMAIL_FORMAT_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

# Characters Excel/Google Sheets treat as a live-formula trigger when they
# open a CSV cell — a leading one turns the cell into a formula instead of
# literal text (CWE-1236). Free text from public forms (quick-apply,
# newsletter signup) eventually reaches admin CSV exports (see admin.py's
# `_csv_safe_cell`, which also neutralises at export time as defense-in-
# depth); rejecting it at submission time gives the submitter immediate
# feedback instead of silently mangling a legitimate name/email.
_FORMULA_INJECTION_TRIGGERS = ("=", "+", "-", "@", "\t", "\r", "\n")


def is_valid_email_format(value: str) -> bool:
    """Basic email shape check — not a full RFC 5322 validator, just enough
    to reject obviously-malformed input on public forms."""
    return bool(EMAIL_FORMAT_RE.match(value))


def has_leading_formula_char(value: str | None) -> bool:
    """True if `value` starts with a spreadsheet formula-trigger character.
    See `_FORMULA_INJECTION_TRIGGERS` above for why this matters. Checks the
    literal leading character with no trimming — a leading tab/CR/LF is
    itself one of the trigger characters, so stripping it first would
    silently defeat that check."""
    return bool(value) and value.startswith(_FORMULA_INJECTION_TRIGGERS)


def hash_password(password: str) -> str:
    """Hash a password using bcrypt."""
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a plain password against a hash."""
    return pwd_context.verify(plain_password, hashed_password)


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """Create a JWT access token."""
    to_encode = data.copy()
    now = datetime.now(timezone.utc)
    if expires_delta:
        expire = now + expires_delta
    else:
        expire = now + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)

    to_encode.update({"exp": expire, "iat": now})
    encoded_jwt = jwt.encode(to_encode, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)
    return encoded_jwt


def decode_token(token: str) -> dict:
    """Decode and verify a JWT token. Tokens minted by create_access_token
    never carry an aud/iss claim, so PyJWT's defaults (no audience/issuer
    check unless explicitly requested) match the old jose behavior exactly."""
    try:
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
        return payload
    except PyJWTError:
        return None


def create_verification_token() -> str:
    """Create a random verification token."""
    import secrets
    return secrets.token_urlsafe(32)


def hash_token(token: str) -> str:
    """Hash a token for storage."""
    import hashlib
    return hashlib.sha256(token.encode()).hexdigest()
