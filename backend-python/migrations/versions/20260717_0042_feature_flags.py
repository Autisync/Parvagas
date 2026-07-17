"""Create feature_flags table, seeded with every settings.X_ENABLED flag
that currently requires a redeploy to change.

Seeded `value` mirrors each flag's current env-var default (see
app/core/config.py) — this migration doesn't change any live behavior by
itself; app/services/feature_flags.get_flag() only overrides a call site
once an admin actually edits the row via /Portal/Admin/settings.

Revision ID: 20260717_0042
Revises: 20260717_0041
Create Date: 2026-07-17 00:00:00
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260717_0042"
down_revision: Union[str, None] = "20260717_0041"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_SEED_FLAGS = [
    ("CANDIDATE_PREMIUM_ENABLED", False, "Enforce CV Builder plan quotas and gate premium AI tools (interview prep, cover letter, company snapshot) behind an active paid subscription."),
    ("OLLAMA_FREE_TIER_ENABLED", True, "Use the self-hosted Ollama model for free-tier resume rewrite suggestions."),
    ("RESUME_AI_ENABLED", False, "Enable cloud AI (OpenAI-compatible) resume scoring/rewrite — a paid API, separate from the free Ollama tier."),
    ("CV_PARSER_AI_ENABLED", False, "Enable cloud AI (OpenAI-compatible) CV upload parsing — a paid API."),
    ("AUTO_APPLY_LLM_SCORING_ENABLED", False, "Let the auto-apply matching pipeline refine its heuristic score with an LLM pass."),
    ("CV_EXPORT_LLM_INJECTION_ENABLED", False, "Let CV export use an LLM to inject job-matched skills/summary phrasing."),
    ("HIBP_PASSWORD_CHECK_ENABLED", False, "Check new passwords against Have I Been Pwned's breach corpus at signup/reset."),
    ("OTP_LOGIN_ENABLED", False, "Enable phone/OTP login and account creation (backend is complete; UI ships gated off by default)."),
]


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if "feature_flags" not in inspector.get_table_names():
        op.create_table(
            "feature_flags",
            sa.Column("key", sa.String(length=80), primary_key=True),
            sa.Column("value", sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column("description", sa.Text(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
        )

    table = sa.table(
        "feature_flags",
        sa.column("key", sa.String),
        sa.column("value", sa.Boolean),
        sa.column("description", sa.Text),
        sa.column("created_at", sa.DateTime),
        sa.column("updated_at", sa.DateTime),
    )
    from datetime import datetime
    now = datetime.utcnow()
    op.bulk_insert(table, [
        {"key": key, "value": value, "description": description, "created_at": now, "updated_at": now}
        for key, value, description in _SEED_FLAGS
    ])


def downgrade() -> None:
    op.drop_table("feature_flags")
