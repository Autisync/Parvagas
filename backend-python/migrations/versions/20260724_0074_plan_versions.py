"""Add plan_versions table + subscriptions.plan_version_id — versioned,
grandfathered subscription plans. Requested directly by Rex: an admin
Plans editor already existed but did plain in-place edits on the live
Plan row, so every subscribed company's entitlements were re-evaluated
against whatever the row says *right now*, on every request. Mirrors
LegalDocument/LegalDocumentVersion's shape (see 20260630-era legal-doc
migrations): Plan stays the "what's for sale right now" display source,
PlanVersion becomes the "what a specific paid subscription is entitled
to" pinned snapshot.

Backfills one published PlanVersion per existing Plan (its current
column values, becoming v1), then pins every existing Subscription to
that plan's v1 — a subscribed company's current terms become its
grandfathered pin at migration time, the only sane default.

Revision ID: 20260724_0074
Revises: 20260723_0073
Create Date: 2026-07-24 00:00:00
"""
import uuid
from datetime import datetime
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260724_0074"
down_revision: Union[str, None] = "20260723_0073"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    plan_columns = {c["name"] for c in inspector.get_columns("plans")}
    if "promo_price" not in plan_columns:
        op.add_column("plans", sa.Column("promo_price", sa.Float(), nullable=True))
    if "promo_label" not in plan_columns:
        op.add_column("plans", sa.Column("promo_label", sa.String(length=255), nullable=True))
    if "promo_expires_at" not in plan_columns:
        op.add_column("plans", sa.Column("promo_expires_at", sa.DateTime(), nullable=True))

    if "plan_versions" not in inspector.get_table_names():
        op.create_table(
            "plan_versions",
            sa.Column("id", sa.String(length=36), primary_key=True),
            sa.Column("plan_id", sa.String(length=36), sa.ForeignKey("plans.id"), nullable=False),
            sa.Column("version_label", sa.String(length=50), nullable=False),
            sa.Column("name", sa.String(length=120), nullable=False),
            sa.Column("price", sa.Float(), nullable=False),
            sa.Column("currency", sa.String(length=8), nullable=False),
            sa.Column("interval", sa.String(length=20), nullable=False),
            sa.Column("features", sa.Text(), nullable=True),
            sa.Column("max_active_jobs", sa.Integer(), nullable=False),
            sa.Column("candidate_search_included", sa.Boolean(), nullable=False),
            sa.Column("api_access_included", sa.Boolean(), nullable=False),
            sa.Column("promo_price", sa.Float(), nullable=True),
            sa.Column("promo_label", sa.String(length=255), nullable=True),
            sa.Column("promo_expires_at", sa.DateTime(), nullable=True),
            sa.Column("status", sa.String(length=20), nullable=False),
            sa.Column("effective_date", sa.DateTime(), nullable=True),
            sa.Column("published_at", sa.DateTime(), nullable=True),
            sa.Column("published_by_user_id", sa.String(length=36), sa.ForeignKey("users.id"), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
        )
        op.create_index("ix_plan_versions_plan_id", "plan_versions", ["plan_id"])

    sub_columns = {c["name"] for c in inspector.get_columns("subscriptions")}
    if "plan_version_id" not in sub_columns:
        op.add_column(
            "subscriptions",
            sa.Column("plan_version_id", sa.String(length=36), sa.ForeignKey("plan_versions.id"), nullable=True),
        )

    now = datetime.utcnow()
    plans = bind.execute(sa.text(
        "SELECT id, code, name, price, currency, interval, features, max_active_jobs, "
        "candidate_search_included, api_access_included FROM plans"
    )).fetchall()

    for plan in plans:
        existing = bind.execute(
            sa.text("SELECT id FROM plan_versions WHERE plan_id = :plan_id AND status = 'published'"),
            {"plan_id": plan.id},
        ).first()
        if existing:
            version_id = existing.id
        else:
            version_id = str(uuid.uuid4())
            bind.execute(
                sa.text(
                    "INSERT INTO plan_versions (id, plan_id, version_label, name, price, currency, interval, "
                    "features, max_active_jobs, candidate_search_included, api_access_included, promo_price, "
                    "promo_label, promo_expires_at, status, effective_date, published_at, published_by_user_id, "
                    "created_at, updated_at) VALUES (:id, :plan_id, :version_label, :name, :price, :currency, "
                    ":interval, :features, :max_active_jobs, :candidate_search_included, :api_access_included, "
                    "NULL, NULL, NULL, 'published', :now, :now, NULL, :now, :now)"
                ),
                {
                    "id": version_id, "plan_id": plan.id, "version_label": "v1", "name": plan.name,
                    "price": plan.price, "currency": plan.currency, "interval": plan.interval,
                    "features": plan.features, "max_active_jobs": plan.max_active_jobs,
                    "candidate_search_included": plan.candidate_search_included,
                    "api_access_included": plan.api_access_included, "now": now,
                },
            )

        bind.execute(
            sa.text(
                "UPDATE subscriptions SET plan_version_id = :version_id "
                "WHERE plan_id = :plan_id AND plan_version_id IS NULL"
            ),
            {"version_id": version_id, "plan_id": plan.id},
        )


def downgrade() -> None:
    op.drop_column("subscriptions", "plan_version_id")
    op.drop_index("ix_plan_versions_plan_id", table_name="plan_versions")
    op.drop_table("plan_versions")
    op.drop_column("plans", "promo_expires_at")
    op.drop_column("plans", "promo_label")
    op.drop_column("plans", "promo_price")
