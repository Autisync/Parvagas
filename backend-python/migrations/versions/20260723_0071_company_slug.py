"""Add companies.slug (overnight-audit W5.3) — a public, shareable
identifier for the new company branding page. Backfills every existing
company from its name, resolving collisions with a random 6-hex-char
suffix (Company.name has no uniqueness constraint), matching the
slugify + collision-suffix convention already used for CareerPost.slug
(see app.services.slug_service).

Revision ID: 20260723_0071
Revises: 20260723_0070
Create Date: 2026-07-23 00:00:00
"""
import re
import unicodedata
import uuid
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260723_0071"
down_revision: Union[str, None] = "20260723_0070"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _slugify(value: str) -> str:
    text = unicodedata.normalize("NFKD", value or "").encode("ascii", "ignore").decode("ascii")
    text = re.sub(r"[^a-zA-Z0-9]+", "-", text).strip("-").lower()
    return text or uuid.uuid4().hex[:8]


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = {c["name"] for c in inspector.get_columns("companies")}

    if "slug" not in columns:
        op.add_column("companies", sa.Column("slug", sa.String(length=255), nullable=True))

    rows = bind.execute(sa.text("SELECT id, name, slug FROM companies")).fetchall()
    seen: set[str] = {row.slug for row in rows if row.slug}
    for row in rows:
        if row.slug:
            continue
        base = _slugify(row.name)
        slug = base
        while slug in seen:
            slug = f"{base}-{uuid.uuid4().hex[:6]}"
        seen.add(slug)
        bind.execute(sa.text("UPDATE companies SET slug = :slug WHERE id = :id"), {"slug": slug, "id": row.id})

    op.alter_column("companies", "slug", existing_type=sa.String(length=255), nullable=False)
    op.create_index("ix_companies_slug", "companies", ["slug"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_companies_slug", table_name="companies")
    op.drop_column("companies", "slug")
