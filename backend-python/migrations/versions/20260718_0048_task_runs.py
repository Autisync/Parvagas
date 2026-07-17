"""Create task_runs — heartbeat ledger for every celery-beat scheduled
task, generalizing the ScraperSource.last_run_* pattern beyond just the
scraper so the admin portal can show last-run status for all 9 periodic
tasks, not just scraping.

Revision ID: 20260718_0048
Revises: 20260718_0047
Create Date: 2026-07-18 00:00:00
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260718_0048"
down_revision: Union[str, None] = "20260718_0047"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if "task_runs" not in inspector.get_table_names():
        op.create_table(
            "task_runs",
            sa.Column("id", sa.String(length=36), primary_key=True),
            sa.Column("task_name", sa.String(length=120), nullable=False),
            sa.Column("started_at", sa.DateTime(), nullable=False),
            sa.Column("finished_at", sa.DateTime(), nullable=True),
            sa.Column("status", sa.String(length=20), nullable=False, server_default="running"),
            sa.Column("detail", sa.Text(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
        )
        op.create_index("ix_task_runs_task_name", "task_runs", ["task_name"])


def downgrade() -> None:
    op.drop_index("ix_task_runs_task_name", table_name="task_runs")
    op.drop_table("task_runs")
