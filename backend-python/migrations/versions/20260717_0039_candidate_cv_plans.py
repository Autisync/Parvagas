"""Create candidate_cv_plans table.

Moves the CV Builder plan catalogue (free/pro/premium — price, features,
quota limits) out of the hardcoded CV_BUILDER_PLANS constant in
candidate_billing_service.py and into admin-editable DB rows, mirroring how
the employer-side `plans` table already works. Seeds the three tiers with
the exact values the constant used to hold, so behavior is unchanged until
an admin edits them.

Revision ID: 20260717_0039
Revises: 20260717_0038
Create Date: 2026-07-17 00:00:00
"""
import json
from datetime import datetime
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260717_0039"
down_revision: Union[str, None] = "20260717_0038"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_SEED_TIERS = [
    {
        "tier": "free", "name": "CV Grátis", "price": 0, "interval": "month",
        "features": ["1 CV", "Modelos básicos", "Download PDF"],
        "max_resumes": 1, "ai_score": False, "ai_rewrite": False,
        "cover_letters": False, "auto_apply": False,
    },
    {
        "tier": "pro", "name": "CV Pro", "price": 15000, "interval": "month",
        "features": ["3 CVs", "Todos os modelos", "Pontuação ATS por IA",
                     "Export PDF e DOCX", "Carta de apresentação"],
        "max_resumes": 3, "ai_score": True, "ai_rewrite": False,
        "cover_letters": True, "auto_apply": False,
    },
    {
        "tier": "premium", "name": "CV Premium", "price": 30000, "interval": "month",
        "features": ["CVs ilimitados", "IA rewrite completo", "Fila auto-candidatura",
                     "Suporte prioritário", "Todas as funcionalidades Pro"],
        "max_resumes": -1, "ai_score": True, "ai_rewrite": True,
        "cover_letters": True, "auto_apply": True,
    },
]


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if "candidate_cv_plans" in inspector.get_table_names():
        return

    op.create_table(
        "candidate_cv_plans",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("tier", sa.String(length=20), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("price", sa.Float(), nullable=False, server_default="0"),
        sa.Column("currency", sa.String(length=8), nullable=False, server_default="AOA"),
        sa.Column("interval", sa.String(length=20), nullable=False, server_default="month"),
        sa.Column("features", sa.Text(), nullable=True),
        sa.Column("max_resumes", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("ai_score", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("ai_rewrite", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("cover_letters", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("auto_apply", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint("tier", name="uq_candidate_cv_plans_tier"),
    )

    table = sa.table(
        "candidate_cv_plans",
        sa.column("id", sa.String),
        sa.column("tier", sa.String),
        sa.column("name", sa.String),
        sa.column("price", sa.Float),
        sa.column("currency", sa.String),
        sa.column("interval", sa.String),
        sa.column("features", sa.Text),
        sa.column("max_resumes", sa.Integer),
        sa.column("ai_score", sa.Boolean),
        sa.column("ai_rewrite", sa.Boolean),
        sa.column("cover_letters", sa.Boolean),
        sa.column("auto_apply", sa.Boolean),
        sa.column("active", sa.Boolean),
        sa.column("created_at", sa.DateTime),
        sa.column("updated_at", sa.DateTime),
    )
    now = datetime.utcnow()
    op.bulk_insert(table, [
        {
            "id": f"seed-cv-plan-{seed['tier']}",
            "tier": seed["tier"],
            "name": seed["name"],
            "price": seed["price"],
            "currency": "AOA",
            "interval": seed["interval"],
            "features": json.dumps(seed["features"], ensure_ascii=True),
            "max_resumes": seed["max_resumes"],
            "ai_score": seed["ai_score"],
            "ai_rewrite": seed["ai_rewrite"],
            "cover_letters": seed["cover_letters"],
            "auto_apply": seed["auto_apply"],
            "active": True,
            "created_at": now,
            "updated_at": now,
        }
        for seed in _SEED_TIERS
    ])


def downgrade() -> None:
    op.drop_table("candidate_cv_plans")
