"""Add companies.industry / size / location — the company Perfil page has
always collected these in its form, but no matching column ever existed on
the model, so anything typed into them was silently discarded on every
save (compounded by the PATCH/PUT verb mismatch fixed in the same change,
and the snake_case/camelCase response mismatch that made even the fields
that DO round-trip — like the logo — look like they hadn't saved).

Revision ID: 20260723_0065
Revises: 20260722_0064
Create Date: 2026-07-23 00:00:00
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260723_0065"
down_revision: Union[str, None] = "20260722_0064"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = {c["name"] for c in inspector.get_columns("companies")}

    if "industry" not in columns:
        op.add_column("companies", sa.Column("industry", sa.String(length=100), nullable=True))
    if "size" not in columns:
        op.add_column("companies", sa.Column("size", sa.String(length=100), nullable=True))
    if "location" not in columns:
        op.add_column("companies", sa.Column("location", sa.String(length=255), nullable=True))


def downgrade() -> None:
    op.drop_column("companies", "location")
    op.drop_column("companies", "size")
    op.drop_column("companies", "industry")
