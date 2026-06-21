"""Growth features: alerts, team, ATS notes, audit logs, scraped jobs,
payments, OTP, plus job search/analytics/trust columns and user phone.

Revision ID: 20260521_0007
Revises: 20260521_0006
Create Date: 2026-05-21 00:00:07
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260521_0007"
down_revision: Union[str, None] = "20260521_0006"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _ts():
    return [
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    ]


def _add_col(inspector, table, column, coltype, **kw):
    cols = {c["name"] for c in inspector.get_columns(table)}
    if column not in cols:
        op.add_column(table, sa.Column(column, coltype, **kw))


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    is_sqlite = bind.dialect.name == "sqlite"

    # ── new columns on existing tables ──────────────────────────────────────
    _add_col(insp, "jobs", "salary_min", sa.Integer(), nullable=True)
    _add_col(insp, "jobs", "salary_max", sa.Integer(), nullable=True)
    _add_col(insp, "jobs", "views", sa.Integer(), nullable=False, server_default="0")
    _add_col(insp, "jobs", "spam_score", sa.Integer(), nullable=False, server_default="0")
    _add_col(insp, "jobs", "spam_flags", sa.Text(), nullable=True)
    _add_col(insp, "users", "phone", sa.String(length=20), nullable=True)
    _add_col(insp, "users", "phone_verified", sa.Boolean(), nullable=False, server_default=sa.false())
    if not is_sqlite:
        for tbl, col in [("jobs", "views"), ("jobs", "spam_score"), ("users", "phone_verified")]:
            op.alter_column(tbl, col, server_default=None)

    def create(table, *cols, indexes=None, uniques=None):
        if not insp.has_table(table):
            op.create_table(table, *cols, sa.PrimaryKeyConstraint("id"))
            for name, c in (indexes or []):
                op.create_index(name, table, c)
            for name, c in (uniques or []):
                op.create_index(name, table, c, unique=True)

    create(
        "job_alerts",
        sa.Column("id", sa.String(36), nullable=False),
        sa.Column("candidate_user_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("keyword", sa.String(255), nullable=True),
        sa.Column("location", sa.String(255), nullable=True),
        sa.Column("category", sa.String(100), nullable=True),
        sa.Column("work_mode", sa.String(50), nullable=True),
        sa.Column("frequency", sa.String(20), nullable=False, server_default="daily"),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("last_notified_at", sa.DateTime(), nullable=True),
        *_ts(),
        indexes=[("ix_job_alerts_candidate", ["candidate_user_id"])],
    )
    create(
        "company_members",
        sa.Column("id", sa.String(36), nullable=False),
        sa.Column("company_id", sa.String(36), sa.ForeignKey("companies.id"), nullable=False),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("role", sa.String(30), nullable=False, server_default="recruiter"),
        *_ts(),
        indexes=[("ix_company_members_company", ["company_id"]), ("ix_company_members_user", ["user_id"])],
    )
    create(
        "company_invites",
        sa.Column("id", sa.String(36), nullable=False),
        sa.Column("company_id", sa.String(36), sa.ForeignKey("companies.id"), nullable=False),
        sa.Column("email", sa.String(255), nullable=False),
        sa.Column("role", sa.String(30), nullable=False, server_default="recruiter"),
        sa.Column("token_hash", sa.String(255), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="pending"),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        *_ts(),
        indexes=[("ix_company_invites_company", ["company_id"]), ("ix_company_invites_email", ["email"])],
        uniques=[("uq_company_invites_token", ["token_hash"])],
    )
    create(
        "application_notes",
        sa.Column("id", sa.String(36), nullable=False),
        sa.Column("application_id", sa.String(36), sa.ForeignKey("applications.id"), nullable=False),
        sa.Column("author_user_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("body", sa.Text(), nullable=True),
        sa.Column("rating", sa.Integer(), nullable=True),
        *_ts(),
        indexes=[("ix_application_notes_app", ["application_id"])],
    )
    create(
        "audit_logs",
        sa.Column("id", sa.String(36), nullable=False),
        sa.Column("actor_user_id", sa.String(36), nullable=True),
        sa.Column("actor_email", sa.String(255), nullable=True),
        sa.Column("action", sa.String(100), nullable=False),
        sa.Column("resource_type", sa.String(50), nullable=True),
        sa.Column("resource_id", sa.String(64), nullable=True),
        sa.Column("details", sa.Text(), nullable=True),
        *_ts(),
        indexes=[("ix_audit_logs_actor", ["actor_user_id"]), ("ix_audit_logs_action", ["action"])],
    )
    create(
        "scraped_jobs",
        sa.Column("id", sa.String(36), nullable=False),
        sa.Column("source", sa.String(100), nullable=True),
        sa.Column("source_url", sa.String(1000), nullable=True),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("company_name", sa.String(255), nullable=True),
        sa.Column("location", sa.String(255), nullable=True),
        sa.Column("category", sa.String(100), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("status", sa.String(30), nullable=False, server_default="pending"),
        sa.Column("duplicate_of", sa.String(36), nullable=True),
        sa.Column("published_job_id", sa.String(36), nullable=True),
        *_ts(),
        indexes=[("ix_scraped_jobs_status", ["status"]), ("ix_scraped_jobs_source", ["source"])],
    )
    create(
        "plans",
        sa.Column("id", sa.String(36), nullable=False),
        sa.Column("code", sa.String(50), nullable=False),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("price", sa.Float(), nullable=False, server_default="0"),
        sa.Column("currency", sa.String(8), nullable=False, server_default="AOA"),
        sa.Column("interval", sa.String(20), nullable=False, server_default="month"),
        sa.Column("features", sa.Text(), nullable=True),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.true()),
        *_ts(),
        uniques=[("uq_plans_code", ["code"])],
    )
    create(
        "subscriptions",
        sa.Column("id", sa.String(36), nullable=False),
        sa.Column("company_id", sa.String(36), sa.ForeignKey("companies.id"), nullable=False),
        sa.Column("plan_id", sa.String(36), sa.ForeignKey("plans.id"), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="pending"),
        sa.Column("current_period_end", sa.DateTime(), nullable=True),
        *_ts(),
        indexes=[("ix_subscriptions_company", ["company_id"])],
    )
    create(
        "transactions",
        sa.Column("id", sa.String(36), nullable=False),
        sa.Column("company_id", sa.String(36), sa.ForeignKey("companies.id"), nullable=True),
        sa.Column("plan_id", sa.String(36), nullable=True),
        sa.Column("amount", sa.Float(), nullable=False, server_default="0"),
        sa.Column("currency", sa.String(8), nullable=False, server_default="AOA"),
        sa.Column("provider", sa.String(40), nullable=False, server_default="manual"),
        sa.Column("reference", sa.String(64), nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="pending"),
        sa.Column("kind", sa.String(30), nullable=False, server_default="subscription"),
        *_ts(),
        indexes=[("ix_transactions_company", ["company_id"]), ("ix_transactions_reference", ["reference"])],
    )
    create(
        "otp_codes",
        sa.Column("id", sa.String(36), nullable=False),
        sa.Column("phone", sa.String(20), nullable=False),
        sa.Column("code_hash", sa.String(255), nullable=False),
        sa.Column("purpose", sa.String(30), nullable=False, server_default="login"),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("consumed_at", sa.DateTime(), nullable=True),
        sa.Column("attempts", sa.Integer(), nullable=False, server_default="0"),
        *_ts(),
        indexes=[("ix_otp_codes_phone", ["phone"])],
    )


def downgrade() -> None:
    for t in ["otp_codes", "transactions", "subscriptions", "plans", "scraped_jobs",
              "audit_logs", "application_notes", "company_invites", "company_members", "job_alerts"]:
        op.drop_table(t)
    for tbl, col in [("users", "phone_verified"), ("users", "phone"),
                     ("jobs", "spam_flags"), ("jobs", "spam_score"), ("jobs", "views"),
                     ("jobs", "salary_max"), ("jobs", "salary_min")]:
        op.drop_column(tbl, col)
