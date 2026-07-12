"""Merge three divergent migration heads.

20260602_0005 (resume/cover-letter/ATS tables) branched off 20260519_0004 and
was never merged forward. 20260707_0025 (candidate_cv_subscriptions) and
20260708_0025 (candidate_subscriptions) both branched off 20260707_0024 —
two people independently adding candidate-billing tables. All three sets of
tables are legitimate and still referenced in models/__init__.py; this is a
pure Alembic merge (no-op upgrade/downgrade), not a data change.

Revision ID: 20260712_0026
Revises: 20260602_0005, 20260707_0025, 20260708_0025
Create Date: 2026-07-12 00:00:00
"""
from typing import Sequence, Union


revision: str = "20260712_0026"
down_revision: Union[str, tuple[str, ...], None] = (
    "20260602_0005",
    "20260707_0025",
    "20260708_0025",
)
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
