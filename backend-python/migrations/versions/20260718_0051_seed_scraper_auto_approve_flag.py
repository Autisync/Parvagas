"""Seed the SCRAPER_AUTO_APPROVE_ENABLED feature flag row, defaulted to
False. The admin Feature Flags page only lists/toggles rows that already
exist in feature_flags, so this global kill-switch needs a row to be
manageable there at all — without it, an admin would have no way to ever
turn trusted-source auto-approve on (or see that it exists). Ships off:
an admin must both flip this AND opt each source in individually via its
own trusted_auto_approve column before anything auto-publishes.

Revision ID: 20260718_0051
Revises: 20260718_0050
Create Date: 2026-07-18 00:00:00
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260718_0051"
down_revision: Union[str, None] = "20260718_0050"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_FLAG_KEY = "SCRAPER_AUTO_APPROVE_ENABLED"
_FLAG_DESCRIPTION = (
    "Publica automaticamente vagas de fontes marcadas como confiáveis, sem "
    "revisão humana, quando a qualidade for perfeita. Confirme os termos de "
    "republicação de cada fonte antes de ativar."
)


def upgrade() -> None:
    bind = op.get_bind()
    feature_flags = sa.table(
        "feature_flags",
        sa.column("key", sa.String),
        sa.column("value", sa.Boolean),
        sa.column("description", sa.Text),
    )
    existing = bind.execute(
        sa.text("SELECT 1 FROM feature_flags WHERE key = :key"), {"key": _FLAG_KEY}
    ).first()
    if not existing:
        bind.execute(
            feature_flags.insert().values(key=_FLAG_KEY, value=False, description=_FLAG_DESCRIPTION)
        )


def downgrade() -> None:
    bind = op.get_bind()
    bind.execute(sa.text("DELETE FROM feature_flags WHERE key = :key"), {"key": _FLAG_KEY})
