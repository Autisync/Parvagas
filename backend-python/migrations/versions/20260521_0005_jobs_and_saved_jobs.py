"""Create jobs and saved_jobs tables; link applications.job_id to jobs.

Revision ID: 20260521_0005
Revises: 20260519_0004
Create Date: 2026-05-21 00:00:05
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "20260521_0005"
down_revision: Union[str, None] = "20260519_0004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if not inspector.has_table("jobs"):
        op.create_table(
            "jobs",
            sa.Column("id", sa.String(length=36), nullable=False),
            sa.Column("company_id", sa.String(length=36), nullable=False),
            sa.Column("title", sa.String(length=255), nullable=False),
            sa.Column("description", sa.Text(), nullable=True),
            sa.Column("responsibilities", sa.Text(), nullable=True),
            sa.Column("requirements", sa.Text(), nullable=True),
            sa.Column("required_skills", sa.Text(), nullable=True),
            sa.Column("preferred_skills", sa.Text(), nullable=True),
            sa.Column("languages", sa.Text(), nullable=True),
            sa.Column("location", sa.String(length=255), nullable=True),
            sa.Column("work_mode", sa.String(length=50), nullable=True),
            sa.Column("category", sa.String(length=100), nullable=True),
            sa.Column("contract_type", sa.String(length=50), nullable=True),
            sa.Column("job_type", sa.String(length=50), nullable=True),
            sa.Column("salary_range", sa.String(length=255), nullable=True),
            sa.Column("experience_level", sa.String(length=50), nullable=True),
            sa.Column("required_experience_years", sa.Integer(), nullable=True),
            sa.Column("status", sa.String(length=50), nullable=False, server_default="pending_platform_review"),
            sa.Column("visibility", sa.String(length=50), nullable=False, server_default="public"),
            sa.Column("moderation_reason", sa.Text(), nullable=True),
            sa.Column("expires_at", sa.DateTime(), nullable=True),
            sa.Column("published_at", sa.DateTime(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.ForeignKeyConstraint(["company_id"], ["companies.id"]),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index("ix_jobs_company_id", "jobs", ["company_id"])
        op.create_index("ix_jobs_status", "jobs", ["status"])
        op.create_index("ix_jobs_category", "jobs", ["category"])
        op.create_index("ix_jobs_location", "jobs", ["location"])

    if not inspector.has_table("saved_jobs"):
        op.create_table(
            "saved_jobs",
            sa.Column("id", sa.String(length=36), nullable=False),
            sa.Column("candidate_user_id", sa.String(length=36), nullable=False),
            sa.Column("job_id", sa.String(length=36), nullable=False),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.ForeignKeyConstraint(["candidate_user_id"], ["users.id"]),
            sa.ForeignKeyConstraint(["job_id"], ["jobs.id"]),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("candidate_user_id", "job_id", name="uq_saved_jobs_candidate_job"),
        )
        op.create_index("ix_saved_jobs_candidate_user_id", "saved_jobs", ["candidate_user_id"])
        op.create_index("ix_saved_jobs_job_id", "saved_jobs", ["job_id"])

    # Link applications.job_id -> jobs.id, but ONLY when it is safe: a hard FK
    # would fail if existing applications reference job ids that have no row in
    # the new (empty) jobs table. Skip rather than corrupt/abort an upgrade.
    _maybe_add_applications_job_fk(bind, inspector)


def _maybe_add_applications_job_fk(bind, inspector) -> None:
    if not inspector.has_table("applications"):
        return

    fk_names = {fk.get("name") for fk in inspector.get_foreign_keys("applications")}
    if "fk_applications_job_id_jobs" in fk_names:
        return

    orphans = bind.execute(
        sa.text(
            "SELECT COUNT(*) FROM applications a "
            "WHERE a.job_id IS NOT NULL "
            "AND NOT EXISTS (SELECT 1 FROM jobs j WHERE j.id = a.job_id)"
        )
    ).scalar()

    if orphans and int(orphans) > 0:
        # Leave job_id as a logical reference; integrity can be backfilled later.
        print(
            f"[migration 0005] Skipping applications.job_id FK: "
            f"{orphans} application(s) reference non-existent jobs."
        )
        return

    with op.batch_alter_table("applications") as batch_op:
        batch_op.create_foreign_key(
            "fk_applications_job_id_jobs",
            "jobs",
            ["job_id"],
            ["id"],
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if inspector.has_table("applications"):
        fk_names = {fk.get("name") for fk in inspector.get_foreign_keys("applications")}
        if "fk_applications_job_id_jobs" in fk_names:
            with op.batch_alter_table("applications") as batch_op:
                batch_op.drop_constraint("fk_applications_job_id_jobs", type_="foreignkey")

    op.drop_table("saved_jobs")
    op.drop_table("jobs")
