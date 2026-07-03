"""Add scraped_jobs.quality_score/quality_flags (thin-content quality gate).

Revision ID: 20260702_0021
Revises: 20260702_0020
Create Date: 2026-07-02 00:00:00
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260702_0021"
down_revision: Union[str, None] = "20260702_0020"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = {c["name"] for c in inspector.get_columns("scraped_jobs")}
    if "quality_score" not in columns:
        op.add_column("scraped_jobs", sa.Column("quality_score", sa.Integer(), nullable=False, server_default="0"))
    if "quality_flags" not in columns:
        op.add_column("scraped_jobs", sa.Column("quality_flags", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("scraped_jobs", "quality_flags")
    op.drop_column("scraped_jobs", "quality_score")
