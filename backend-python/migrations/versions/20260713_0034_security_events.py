"""Add security_events table (admin Segurança tab + alerting).

Written after the no-reply@parvagas.pt SMTP credential compromise (2026-07-09):
failed logins, login bursts, lockouts and outbound-email rate-limit hits are
now recorded here and surfaced to admins, with alert emails on bursts.

Revision ID: 20260713_0034
Revises: 20260713_0033
Create Date: 2026-07-09 00:00:00

Note: authored 2026-07-09 on a parallel branch (under_dev); renumbered to
20260713_0034 when cherry-picked onto staging so it chains after that
branch's own migration history instead of forking from 20260708_0025.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260713_0034"
down_revision: Union[str, None] = "20260713_0033"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "security_events" in inspector.get_table_names():
        return

    op.create_table(
        "security_events",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("event_type", sa.String(60), nullable=False, index=True),
        sa.Column("severity", sa.String(10), nullable=False, server_default="low", index=True),
        sa.Column("email", sa.String(255), nullable=True, index=True),
        sa.Column("ip_address", sa.String(64), nullable=True, index=True),
        sa.Column("user_agent", sa.String(400), nullable=True),
        sa.Column("details", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("security_events")
