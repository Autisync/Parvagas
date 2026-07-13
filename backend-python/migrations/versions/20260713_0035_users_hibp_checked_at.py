"""Add users.hibp_checked_at for the daily Have I Been Pwned breach scan.

Revision ID: 20260713_0035
Revises: 20260713_0034
Create Date: 2026-07-13 12:00:00
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260713_0035"
down_revision: Union[str, None] = "20260713_0034"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = {c["name"] for c in inspector.get_columns("users")}
    if "hibp_checked_at" in columns:
        return
    op.add_column("users", sa.Column("hibp_checked_at", sa.DateTime(), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "hibp_checked_at")
