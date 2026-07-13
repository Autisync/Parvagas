"""Add User.is_guest_account + guest_claim_email_sent_at (C5,
EXECUTION_PLAN_NATIVE_CV_BUILDER.md).

Both shadow-account creation sites (resume_sso.py's guest_start,
jobs.py's submit_spontaneous_cv) mint a random, never-shown password —
these two columns let the rest of the app tell that account apart from a
real signup: is_guest_account starts true and flips to false the moment
the candidate actually sets a password via the existing reset-password
flow (see AuthService.reset_password); guest_claim_email_sent_at tracks
the one-time "O seu CV está guardado" nudge email so it's never sent twice.

Revision ID: 20260713_0031
Revises: 20260713_0030
Create Date: 2026-07-13 01:00:00
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260713_0031"
down_revision: Union[str, None] = "20260713_0030"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("is_guest_account", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column("users", sa.Column("guest_claim_email_sent_at", sa.DateTime(), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "guest_claim_email_sent_at")
    op.drop_column("users", "is_guest_account")
