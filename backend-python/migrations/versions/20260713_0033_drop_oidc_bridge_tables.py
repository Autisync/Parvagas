"""Drop sso_handoff_codes + oauth_authorization_codes (A7 cleanup,
EXECUTION_PLAN_NATIVE_CV_BUILDER.md).

These backed the OIDC bridge that let Parvagas act as an identity provider
for the external, self-hosted Reactive Resume instance at cv.parvagas.pt.
That instance has been fully replaced by the native CV builder built
inside this portal — the bridge (POST /resume-sso/handoff, GET
/oauth/authorize, POST /oauth/token, GET /oauth/userinfo,
GET /.well-known/openid-configuration) had no live caller since Phase A
shipped and has now been removed from app/api/v1/resume_sso.py entirely.

guest_start (JWT-based, unrelated to this bridge) is unaffected — it never
touched these tables.

Revision ID: 20260713_0033
Revises: 20260713_0032
Create Date: 2026-07-13 03:00:00
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260713_0033"
down_revision: Union[str, None] = "20260713_0032"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_table("oauth_authorization_codes")
    op.drop_table("sso_handoff_codes")


def downgrade() -> None:
    op.create_table(
        "sso_handoff_codes",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("code", sa.String(length=64), nullable=False, unique=True),
        sa.Column("user_id", sa.String(length=36), sa.ForeignKey("users.id"), nullable=False, index=True),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("consumed_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_table(
        "oauth_authorization_codes",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("code", sa.String(length=64), nullable=False, unique=True),
        sa.Column("user_id", sa.String(length=36), sa.ForeignKey("users.id"), nullable=False, index=True),
        sa.Column("client_id", sa.String(length=100), nullable=False),
        sa.Column("redirect_uri", sa.String(length=500), nullable=False),
        sa.Column("scope", sa.String(length=255), nullable=True),
        sa.Column("nonce", sa.String(length=255), nullable=True),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("consumed_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
