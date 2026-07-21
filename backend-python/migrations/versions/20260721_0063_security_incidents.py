"""Create security_incidents and security_incident_log_entries — Wave X1,
EXECUTION_PLAN_LEGAL_AND_PAYMENTS.md. Operationalizes the runbook in
seguranca-incidentes.md, including the GDPR Art. 33 72-hour notification
clock.

Revision ID: 20260721_0063
Revises: 20260721_0062
Create Date: 2026-07-21 00:00:00
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260721_0063"
down_revision: Union[str, None] = "20260721_0062"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if "security_incidents" not in inspector.get_table_names():
        op.create_table(
            "security_incidents",
            sa.Column("id", sa.String(length=36), primary_key=True),
            sa.Column("title", sa.String(length=255), nullable=False),
            sa.Column("description", sa.Text(), nullable=False),
            sa.Column("severity", sa.String(length=10), nullable=False, server_default="baixa"),
            sa.Column("created_by_user_id", sa.String(length=36), sa.ForeignKey("users.id"), nullable=True),
            sa.Column("assigned_to_user_id", sa.String(length=36), sa.ForeignKey("users.id"), nullable=True),
            sa.Column("contained_at", sa.DateTime(), nullable=True),
            sa.Column("impact_assessed_at", sa.DateTime(), nullable=True),
            sa.Column("is_personal_data_breach", sa.Boolean(), nullable=True),
            sa.Column("risk_level", sa.String(length=10), nullable=True),
            sa.Column("affected_data_categories", sa.Text(), nullable=True),
            sa.Column("affected_subject_count_estimate", sa.Integer(), nullable=True),
            sa.Column("authority_notified_at", sa.DateTime(), nullable=True),
            sa.Column("subjects_notified_at", sa.DateTime(), nullable=True),
            sa.Column("client_notified_at", sa.DateTime(), nullable=True),
            sa.Column("remediated_at", sa.DateTime(), nullable=True),
            sa.Column("remediation_notes", sa.Text(), nullable=True),
            sa.Column("closed_at", sa.DateTime(), nullable=True),
            sa.Column("post_incident_review_notes", sa.Text(), nullable=True),
            sa.Column("deadline_alert_sent_at", sa.DateTime(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
        )
        op.create_index("ix_security_incidents_severity", "security_incidents", ["severity"])

    if "security_incident_log_entries" not in inspector.get_table_names():
        op.create_table(
            "security_incident_log_entries",
            sa.Column("id", sa.String(length=36), primary_key=True),
            sa.Column("incident_id", sa.String(length=36), sa.ForeignKey("security_incidents.id"), nullable=False),
            sa.Column("entry_type", sa.String(length=30), nullable=False, server_default="note"),
            sa.Column("body", sa.Text(), nullable=False),
            sa.Column("created_by_user_id", sa.String(length=36), sa.ForeignKey("users.id"), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
        )
        op.create_index("ix_security_incident_log_entries_incident_id", "security_incident_log_entries", ["incident_id"])


def downgrade() -> None:
    op.drop_table("security_incident_log_entries")
    op.drop_table("security_incidents")
