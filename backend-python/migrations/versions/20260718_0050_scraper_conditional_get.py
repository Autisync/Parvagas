"""Add conditional-GET cache columns + trusted_auto_approve to
scraper_sources. Previously every 2-hourly scrape run re-downloaded and
re-parsed every source's feed even when unchanged; caching ETag/
Last-Modified/body-hash lets the fetch short-circuit to "unchanged" and
skip parse+dedup entirely. trusted_auto_approve is a per-source opt-in
(defaults False) for the separate, also-default-off global auto-approve
feature flag.

Revision ID: 20260718_0050
Revises: 20260718_0049
Create Date: 2026-07-18 00:00:00
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260718_0050"
down_revision: Union[str, None] = "20260718_0049"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = {c["name"] for c in inspector.get_columns("scraper_sources")}

    if "http_etag" not in columns:
        op.add_column("scraper_sources", sa.Column("http_etag", sa.String(length=500), nullable=True))
    if "http_last_modified" not in columns:
        op.add_column("scraper_sources", sa.Column("http_last_modified", sa.String(length=200), nullable=True))
    if "last_body_hash" not in columns:
        op.add_column("scraper_sources", sa.Column("last_body_hash", sa.String(length=64), nullable=True))
    if "trusted_auto_approve" not in columns:
        op.add_column(
            "scraper_sources",
            sa.Column("trusted_auto_approve", sa.Boolean(), nullable=False, server_default=sa.false()),
        )


def downgrade() -> None:
    op.drop_column("scraper_sources", "trusted_auto_approve")
    op.drop_column("scraper_sources", "last_body_hash")
    op.drop_column("scraper_sources", "http_last_modified")
    op.drop_column("scraper_sources", "http_etag")
