"""Add companies.benefits / social_links / gallery_photos (overnight-audit
W4.4) — the company profile was name + logo + one free-text paragraph,
giving a candidate deciding whether to apply almost nothing to go on.

Revision ID: 20260723_0066
Revises: 20260723_0065
Create Date: 2026-07-23 00:00:00
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260723_0066"
down_revision: Union[str, None] = "20260723_0065"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = {c["name"] for c in inspector.get_columns("companies")}

    if "benefits" not in columns:
        op.add_column("companies", sa.Column("benefits", sa.Text(), nullable=True))
    if "social_links" not in columns:
        op.add_column("companies", sa.Column("social_links", sa.Text(), nullable=True))
    if "gallery_photos" not in columns:
        op.add_column("companies", sa.Column("gallery_photos", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("companies", "gallery_photos")
    op.drop_column("companies", "social_links")
    op.drop_column("companies", "benefits")
