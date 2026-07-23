"""Shared URL-slug generation — used by CareerPost and Company. Single
source of truth so both stay on the same slugify + collision-suffix
convention instead of drifting into separate ad-hoc copies."""
from __future__ import annotations

import re
import unicodedata
import uuid

from sqlalchemy import inspect
from sqlalchemy.orm import Session


def slugify(value: str) -> str:
    text = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode("ascii")
    text = re.sub(r"[^a-zA-Z0-9]+", "-", text).strip("-").lower()
    return text or uuid.uuid4().hex[:8]


def generate_unique_slug(db: Session, model, value: str, *, slug_column: str = "slug") -> str:
    """slugify(value), appending a random 6-hex-char suffix on collision —
    same convention already used for CareerPost.slug."""
    column = inspect(model).columns[slug_column]
    base = slugify(value)
    slug = base
    while db.query(model).filter(column == slug).first():
        slug = f"{base}-{uuid.uuid4().hex[:6]}"
    return slug
