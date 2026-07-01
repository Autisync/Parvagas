"""Add scraped_jobs.application_deadline (the real hiring deadline).

Distinct from the existing `expires_at` shelf-life fallback used when the
source doesn't advertise a deadline.

Revision ID: 20260701_0017
Revises: 20260701_0016
Create Date: 2026-07-01 00:00:00
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260701_0017"
down_revision: Union[str, None] = "20260701_0016"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = {c["name"] for c in inspector.get_columns("scraped_jobs")}
    if "application_deadline" not in columns:
        op.add_column("scraped_jobs", sa.Column("application_deadline", sa.DateTime(), nullable=True))


def downgrade() -> None:
    op.drop_column("scraped_jobs", "application_deadline")
