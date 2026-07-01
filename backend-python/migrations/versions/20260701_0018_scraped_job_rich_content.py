"""Add structured content to scraped_jobs + external company logo to jobs.

Published scraped jobs were collapsing the source listing's full content
(responsibilities, qualifications, company branding) into a single short
description, because ScrapedJob never had anywhere to hold that data and the
admin curation UI had no fields for it. This adds the columns; a follow-up
change wires the admin UI and publish flow to populate/carry them.

Revision ID: 20260701_0018
Revises: 20260701_0017
Create Date: 2026-07-01 00:00:00
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260701_0018"
down_revision: Union[str, None] = "20260701_0017"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    scraped_columns = {c["name"] for c in inspector.get_columns("scraped_jobs")}
    if "responsibilities" not in scraped_columns:
        op.add_column("scraped_jobs", sa.Column("responsibilities", sa.Text(), nullable=True))
    if "requirements" not in scraped_columns:
        op.add_column("scraped_jobs", sa.Column("requirements", sa.Text(), nullable=True))
    if "company_logo_url" not in scraped_columns:
        op.add_column("scraped_jobs", sa.Column("company_logo_url", sa.Text(), nullable=True))
    if "company_website" not in scraped_columns:
        op.add_column("scraped_jobs", sa.Column("company_website", sa.String(length=500), nullable=True))

    job_columns = {c["name"] for c in inspector.get_columns("jobs")}
    if "external_company_logo_url" not in job_columns:
        op.add_column("jobs", sa.Column("external_company_logo_url", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("jobs", "external_company_logo_url")
    op.drop_column("scraped_jobs", "company_website")
    op.drop_column("scraped_jobs", "company_logo_url")
    op.drop_column("scraped_jobs", "requirements")
    op.drop_column("scraped_jobs", "responsibilities")
