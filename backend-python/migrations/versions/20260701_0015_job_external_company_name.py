"""Add jobs.external_company_name, backfill from scraped_jobs.company_name.

Scraped jobs are published under a synthetic "Parvagas Aggregator" company
(see admin._aggregator_company), which silently discarded the real hiring
company name. This adds a column to carry it through to the public listing.

Revision ID: 20260701_0015
Revises: 20260630_0014
Create Date: 2026-07-01 00:00:00
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260701_0015"
down_revision: Union[str, None] = "20260630_0014"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = {c["name"] for c in inspector.get_columns("jobs")}

    if "external_company_name" not in columns:
        op.add_column("jobs", sa.Column("external_company_name", sa.String(length=255), nullable=True))

    if "scraped_jobs" in inspector.get_table_names():
        bind.execute(
            sa.text(
                "UPDATE jobs SET external_company_name = ("
                "  SELECT sj.company_name FROM scraped_jobs sj WHERE sj.published_job_id = jobs.id"
                ") "
                "WHERE external_company_name IS NULL "
                "AND id IN (SELECT published_job_id FROM scraped_jobs WHERE published_job_id IS NOT NULL)"
            )
        )


def downgrade() -> None:
    op.drop_column("jobs", "external_company_name")
