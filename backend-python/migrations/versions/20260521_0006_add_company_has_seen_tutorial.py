"""Add has_seen_tutorial to companies (company onboarding guide state).

Revision ID: 20260521_0006
Revises: 20260521_0005
Create Date: 2026-05-21 00:00:06
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "20260521_0006"
down_revision: Union[str, None] = "20260521_0005"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = {c["name"] for c in inspector.get_columns("companies")}
    if "has_seen_tutorial" not in columns:
        op.add_column(
            "companies",
            sa.Column("has_seen_tutorial", sa.Boolean(), nullable=False, server_default=sa.false()),
        )
        if bind.dialect.name != "sqlite":
            op.alter_column("companies", "has_seen_tutorial", server_default=None)


def downgrade() -> None:
    op.drop_column("companies", "has_seen_tutorial")
