"""Create newsletter_subscribers table.

Public email opt-in for job-opening announcements (footer / signup checkbox).

Revision ID: 20260701_0016
Revises: 20260701_0015
Create Date: 2026-07-01 00:00:00
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260701_0016"
down_revision: Union[str, None] = "20260701_0015"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if "newsletter_subscribers" not in inspector.get_table_names():
        op.create_table(
            "newsletter_subscribers",
            sa.Column("id", sa.String(length=36), primary_key=True),
            sa.Column("email", sa.String(length=255), nullable=False),
            sa.Column("source", sa.String(length=50), nullable=True),
            sa.Column("unsubscribed_at", sa.DateTime(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
            sa.UniqueConstraint("email", name="uq_newsletter_subscribers_email"),
        )
        op.create_index("ix_newsletter_subscribers_email", "newsletter_subscribers", ["email"])


def downgrade() -> None:
    op.drop_index("ix_newsletter_subscribers_email", table_name="newsletter_subscribers")
    op.drop_table("newsletter_subscribers")
