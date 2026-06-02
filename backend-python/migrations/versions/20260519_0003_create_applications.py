"""Create applications table for job apply flows.

Revision ID: 20260519_0003
Revises: 20260517_0002
Create Date: 2026-05-19 00:00:03
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "20260519_0003"
down_revision: Union[str, None] = "20260517_0002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if not inspector.has_table("applications"):
        op.create_table(
            "applications",
            sa.Column("id", sa.String(length=36), nullable=False),
            sa.Column("job_id", sa.String(length=36), nullable=False),
            sa.Column("candidate_user_id", sa.String(length=36), nullable=True),
            sa.Column("applicant_full_name", sa.String(length=255), nullable=False),
            sa.Column("applicant_email", sa.String(length=255), nullable=False),
            sa.Column("applicant_phone", sa.String(length=20), nullable=True),
            sa.Column("applicant_location", sa.String(length=255), nullable=True),
            sa.Column("cover_letter", sa.Text(), nullable=True),
            sa.Column("profile_source", sa.String(length=50), nullable=False),
            sa.Column("status", sa.String(length=50), nullable=False),
            sa.Column("cv_file_path", sa.String(length=500), nullable=True),
            sa.Column("saved_cv_document_id", sa.String(length=36), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
            sa.ForeignKeyConstraint(["candidate_user_id"], ["users.id"]),
            sa.PrimaryKeyConstraint("id"),
        )

    existing_indexes = {index["name"] for index in inspector.get_indexes("applications")}
    for index_name, columns in [
        (op.f("ix_applications_job_id"), ["job_id"]),
        (op.f("ix_applications_candidate_user_id"), ["candidate_user_id"]),
        (op.f("ix_applications_applicant_email"), ["applicant_email"]),
    ]:
        if index_name not in existing_indexes:
            op.create_index(index_name, "applications", columns, unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_applications_applicant_email"), table_name="applications")
    op.drop_index(op.f("ix_applications_candidate_user_id"), table_name="applications")
    op.drop_index(op.f("ix_applications_job_id"), table_name="applications")
    op.drop_table("applications")
