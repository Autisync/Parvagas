"""Add scraped_jobs.scheduled_publish_at (approve-now vs schedule-for-later).

Revision ID: 20260702_0019
Revises: 20260701_0018
Create Date: 2026-07-02 00:00:00
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260702_0019"
down_revision: Union[str, None] = "20260701_0018"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = {c["name"] for c in inspector.get_columns("scraped_jobs")}
    if "scheduled_publish_at" not in columns:
        op.add_column("scraped_jobs", sa.Column("scheduled_publish_at", sa.DateTime(), nullable=True))


def downgrade() -> None:
    op.drop_column("scraped_jobs", "scheduled_publish_at")
