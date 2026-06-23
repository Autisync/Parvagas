"""Ads (cost/targeting) + scraping (dedup/expiry) + job source attribution.

Revision ID: 20260521_0009
Revises: 20260521_0008
Create Date: 2026-05-21 00:00:09
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "20260521_0009"
down_revision: Union[str, None] = "20260521_0008"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _cols(inspector, table):
    return {c["name"] for c in inspector.get_columns(table)}


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    is_sqlite = bind.dialect.name == "sqlite"

    # --- ad_campaigns: cost model + targeting ---
    ad_cols = _cols(inspector, "ad_campaigns")
    add = [
        ("cost_per_click", sa.Column("cost_per_click", sa.Float(), nullable=False, server_default="0")),
        ("cost_per_impression", sa.Column("cost_per_impression", sa.Float(), nullable=False, server_default="0")),
        ("target_category", sa.Column("target_category", sa.String(length=100), nullable=True)),
        ("target_location", sa.Column("target_location", sa.String(length=255), nullable=True)),
    ]
    for name, col in add:
        if name not in ad_cols:
            op.add_column("ad_campaigns", col)
    if not is_sqlite:
        op.alter_column("ad_campaigns", "cost_per_click", server_default=None)
        op.alter_column("ad_campaigns", "cost_per_impression", server_default=None)

    # --- scraped_jobs: dedup + lifecycle ---
    sj_cols = _cols(inspector, "scraped_jobs")
    for name, col in [
        ("content_hash", sa.Column("content_hash", sa.String(length=64), nullable=True)),
        ("last_seen_at", sa.Column("last_seen_at", sa.DateTime(), nullable=True)),
        ("expires_at", sa.Column("expires_at", sa.DateTime(), nullable=True)),
    ]:
        if name not in sj_cols:
            op.add_column("scraped_jobs", col)
    if "content_hash" not in sj_cols:
        op.create_index("ix_scraped_jobs_content_hash", "scraped_jobs", ["content_hash"])

    # --- jobs: source attribution ---
    job_cols = _cols(inspector, "jobs")
    for name, col in [
        ("source", sa.Column("source", sa.String(length=100), nullable=True)),
        ("source_url", sa.Column("source_url", sa.String(length=1000), nullable=True)),
    ]:
        if name not in job_cols:
            op.add_column("jobs", col)


def downgrade() -> None:
    op.drop_column("jobs", "source_url")
    op.drop_column("jobs", "source")
    op.drop_index("ix_scraped_jobs_content_hash", table_name="scraped_jobs")
    op.drop_column("scraped_jobs", "expires_at")
    op.drop_column("scraped_jobs", "last_seen_at")
    op.drop_column("scraped_jobs", "content_hash")
    op.drop_column("ad_campaigns", "target_location")
    op.drop_column("ad_campaigns", "target_category")
    op.drop_column("ad_campaigns", "cost_per_impression")
    op.drop_column("ad_campaigns", "cost_per_click")
