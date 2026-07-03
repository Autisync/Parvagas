"""Add scraped_jobs.audience_lane (entry_level|skilled_trade|professional|remote).

Revision ID: 20260702_0020
Revises: 20260702_0019
Create Date: 2026-07-02 00:00:00
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260702_0020"
down_revision: Union[str, None] = "20260702_0019"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = {c["name"] for c in inspector.get_columns("scraped_jobs")}
    if "audience_lane" not in columns:
        op.add_column("scraped_jobs", sa.Column("audience_lane", sa.String(length=30), nullable=True))
        op.create_index("ix_scraped_jobs_audience_lane", "scraped_jobs", ["audience_lane"])


def downgrade() -> None:
    op.drop_index("ix_scraped_jobs_audience_lane", table_name="scraped_jobs")
    op.drop_column("scraped_jobs", "audience_lane")
