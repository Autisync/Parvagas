"""Add users.guest_converted_at — a durable marker set once when a guest
account converts, so the admin dashboard can compute a real guest-to-
registered conversion rate (is_guest_account alone only shows current
state, not history).

Revision ID: 20260718_0047
Revises: 20260717_0046
Create Date: 2026-07-18 00:00:00
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260718_0047"
down_revision: Union[str, None] = "20260717_0046"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = {c["name"] for c in inspector.get_columns("users")}

    if "guest_converted_at" not in columns:
        op.add_column("users", sa.Column("guest_converted_at", sa.DateTime(), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "guest_converted_at")
