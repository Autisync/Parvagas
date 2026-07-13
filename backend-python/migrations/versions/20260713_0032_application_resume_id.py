"""Add JobApplication.resume_id (D1, EXECUTION_PLAN_NATIVE_CV_BUILDER.md).

Lets a candidate apply with a specific CV built in the native Construtor
de CV, as an alternative to the existing "saved CVUpload document" /
"upload a new file" choices. Nullable — every existing application and
every non-native-resume application flow is unaffected.

Revision ID: 20260713_0032
Revises: 20260713_0031
Create Date: 2026-07-13 02:00:00
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260713_0032"
down_revision: Union[str, None] = "20260713_0031"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("applications", sa.Column("resume_id", sa.String(length=36), nullable=True))
    op.create_index("ix_applications_resume_id", "applications", ["resume_id"])


def downgrade() -> None:
    op.drop_index("ix_applications_resume_id", table_name="applications")
    op.drop_column("applications", "resume_id")
