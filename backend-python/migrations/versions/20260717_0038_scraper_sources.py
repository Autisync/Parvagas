"""Create scraper_sources and scraper_settings tables.

Moves the job-board scraper's source list and runtime tuning knobs out of
the SCRAPER_SOURCES/SCRAPER_* env vars and into admin-editable DB rows, so
an admin can add/edit/disable a source or change timeouts without a
redeploy. Seeds one default scraper_settings row so the admin board always
has something to read/edit.

Revision ID: 20260717_0038
Revises: 20260715_0037
Create Date: 2026-07-17 00:00:00
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260717_0038"
down_revision: Union[str, None] = "20260715_0037"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_tables = inspector.get_table_names()

    if "scraper_sources" not in existing_tables:
        op.create_table(
            "scraper_sources",
            sa.Column("id", sa.String(length=36), primary_key=True),
            sa.Column("name", sa.String(length=120), nullable=False),
            sa.Column("type", sa.String(length=20), nullable=False),
            sa.Column("url", sa.String(length=1000), nullable=False),
            sa.Column("category", sa.String(length=120), nullable=True),
            sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
            sa.Column("max_results", sa.Integer(), nullable=True),
            sa.Column("last_run_at", sa.DateTime(), nullable=True),
            sa.Column("last_run_status", sa.String(length=20), nullable=True),
            sa.Column("last_run_detail", sa.Text(), nullable=True),
            sa.Column("last_run_job_count", sa.Integer(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
        )

    if "scraper_settings" not in existing_tables:
        op.create_table(
            "scraper_settings",
            sa.Column("id", sa.String(length=20), primary_key=True),
            sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
            sa.Column("default_timeout_seconds", sa.Integer(), nullable=False, server_default="12"),
            sa.Column("default_max_per_source", sa.Integer(), nullable=False, server_default="100"),
            sa.Column("user_agent", sa.String(length=255), nullable=True),
            sa.Column("max_ingest_per_run", sa.Integer(), nullable=False, server_default="200"),
            sa.Column("run_budget_seconds", sa.Integer(), nullable=False, server_default="300"),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
        )
        op.execute(
            sa.text(
                "INSERT INTO scraper_settings (id, enabled, default_timeout_seconds, "
                "default_max_per_source, user_agent, max_ingest_per_run, run_budget_seconds, "
                "created_at, updated_at) VALUES ('default', TRUE, 12, 100, NULL, 200, 300, "
                "CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)"
            )
        )


def downgrade() -> None:
    op.drop_table("scraper_settings")
    op.drop_table("scraper_sources")
