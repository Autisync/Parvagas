"""Add angolanizacao flag to companies (70% national-hiring badge).

Revision ID: 20260521_0011
Revises: 20260521_0010
Create Date: 2026-05-21 00:00:11
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "20260521_0011"
down_revision: Union[str, None] = "20260521_0010"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    cols = {c["name"] for c in sa.inspect(bind).get_columns("companies")}
    if "angolanizacao" not in cols:
        op.add_column("companies", sa.Column("angolanizacao", sa.Boolean(), nullable=False, server_default=sa.false()))
        if bind.dialect.name != "sqlite":
            op.alter_column("companies", "angolanizacao", server_default=None)


def downgrade() -> None:
    op.drop_column("companies", "angolanizacao")
