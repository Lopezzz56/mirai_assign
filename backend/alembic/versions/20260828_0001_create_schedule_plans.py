from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "20260828_0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "schedule_plans",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("version", sa.String(length=16), nullable=False),
        sa.Column("scenario", sa.String(length=80), nullable=False),
        sa.Column("payload", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_schedule_plans_version", "schedule_plans", ["version"])


def downgrade() -> None:
    op.drop_index("ix_schedule_plans_version", table_name="schedule_plans")
    op.drop_table("schedule_plans")
