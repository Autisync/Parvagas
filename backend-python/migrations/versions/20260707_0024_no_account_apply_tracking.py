"""Add contact-email + tracking-token columns for the no-account apply flow.

- jobs.external_contact_email / jobs.employer_access_token: lets a real
  hiring company with no Parvagas account receive application emails and
  view them via a token link instead of a portal login.
- scraped_jobs.contact_email: admin-curated source for the above.
- applications.tracking_token: lets a guest applicant check their own
  application status without an account.

Revision ID: 20260707_0024
Revises: 20260707_0023
Create Date: 2026-07-07 00:00:00
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260707_0024"
down_revision: Union[str, None] = "20260707_0023"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    job_columns = {c["name"] for c in inspector.get_columns("jobs")}
    if "external_contact_email" not in job_columns:
        op.add_column("jobs", sa.Column("external_contact_email", sa.String(255), nullable=True))
    if "employer_access_token" not in job_columns:
        op.add_column("jobs", sa.Column("employer_access_token", sa.String(64), nullable=True))
        op.create_unique_constraint("uq_jobs_employer_access_token", "jobs", ["employer_access_token"])

    scraped_columns = {c["name"] for c in inspector.get_columns("scraped_jobs")}
    if "contact_email" not in scraped_columns:
        op.add_column("scraped_jobs", sa.Column("contact_email", sa.String(255), nullable=True))

    application_columns = {c["name"] for c in inspector.get_columns("applications")}
    if "tracking_token" not in application_columns:
        op.add_column("applications", sa.Column("tracking_token", sa.String(64), nullable=True))
        op.create_unique_constraint("uq_applications_tracking_token", "applications", ["tracking_token"])


def downgrade() -> None:
    op.drop_constraint("uq_applications_tracking_token", "applications", type_="unique")
    op.drop_column("applications", "tracking_token")
    op.drop_column("scraped_jobs", "contact_email")
    op.drop_constraint("uq_jobs_employer_access_token", "jobs", type_="unique")
    op.drop_column("jobs", "employer_access_token")
    op.drop_column("jobs", "external_contact_email")
