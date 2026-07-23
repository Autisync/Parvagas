"""Add applications.interview_scheduled_at / interview_location /
interview_meeting_link (overnight-audit W-extra) — moving an application
to "interview" only ever flipped a status label; there was no home
anywhere in the data model for the actual scheduling details.

Revision ID: 20260723_0067
Revises: 20260723_0066
Create Date: 2026-07-23 00:00:00
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260723_0067"
down_revision: Union[str, None] = "20260723_0066"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = {c["name"] for c in inspector.get_columns("applications")}

    if "interview_scheduled_at" not in columns:
        op.add_column("applications", sa.Column("interview_scheduled_at", sa.DateTime(), nullable=True))
    if "interview_location" not in columns:
        op.add_column("applications", sa.Column("interview_location", sa.String(length=500), nullable=True))
    if "interview_meeting_link" not in columns:
        op.add_column("applications", sa.Column("interview_meeting_link", sa.String(length=500), nullable=True))


def downgrade() -> None:
    op.drop_column("applications", "interview_meeting_link")
    op.drop_column("applications", "interview_location")
    op.drop_column("applications", "interview_scheduled_at")
