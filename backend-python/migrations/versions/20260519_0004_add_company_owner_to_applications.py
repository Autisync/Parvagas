"""Add company mapping field to applications for company-scoped filtering.

Revision ID: 20260519_0004
Revises: 20260519_0003
Create Date: 2026-05-19 00:00:04
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "20260519_0004"
down_revision: Union[str, None] = "20260519_0003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    columns = {column["name"] for column in inspector.get_columns("applications")}
    if "company_id" not in columns:
        op.add_column(
            "applications",
            sa.Column("company_id", sa.String(length=36), nullable=True),
        )
        op.create_foreign_key(
            "fk_applications_company_id_companies",
            "applications",
            "companies",
            ["company_id"],
            ["id"],
        )

    indexes = {index["name"] for index in inspector.get_indexes("applications")}
    index_name = op.f("ix_applications_company_id")
    if index_name not in indexes:
        op.create_index(index_name, "applications", ["company_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_applications_company_id"), table_name="applications")
    op.drop_constraint("fk_applications_company_id_companies", "applications", type_="foreignkey")
    op.drop_column("applications", "company_id")
