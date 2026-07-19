"""Add Parvagas CV Builder one-time authorization code table.

Revision ID: 20260717_0027
Revises: 20260712_0026
Create Date: 2026-07-17 00:00:00
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260717_0027"
down_revision: Union[str, None] = "20260712_0026"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if not inspector.has_table("cv_builder_auth_codes"):
        op.create_table(
            "cv_builder_auth_codes",
            sa.Column("id", sa.String(36), nullable=False),
            sa.Column("code_hash", sa.String(128), nullable=False),
            sa.Column("audience", sa.String(64), nullable=False, server_default="cv-builder"),
            sa.Column("user_id", sa.String(36), nullable=False),
            sa.Column("nonce", sa.String(128), nullable=False),
            sa.Column("return_url", sa.String(1024), nullable=False),
            sa.Column("target_resume_id", sa.String(255), nullable=True),
            sa.Column("expires_at", sa.DateTime(), nullable=False),
            sa.Column("used_at", sa.DateTime(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("code_hash"),
        )
        op.create_index("ix_cv_builder_auth_codes_code_hash", "cv_builder_auth_codes", ["code_hash"])
        op.create_index("ix_cv_builder_auth_codes_user_id", "cv_builder_auth_codes", ["user_id"])


def downgrade() -> None:
    op.drop_table("cv_builder_auth_codes")
