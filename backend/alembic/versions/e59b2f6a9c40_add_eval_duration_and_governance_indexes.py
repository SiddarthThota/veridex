"""Add evaluation_duration_ms and governance composite indexes.

Revision ID: e59b2f6a9c40
Revises: d48a1e5f8b30
Create Date: 2026-11-12 21:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "e59b2f6a9c40"
down_revision: str | None = "d48a1e5f8b30"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # 1. Add nullable evaluation_duration_ms column to tool_requests
    op.add_column(
        "tool_requests",
        sa.Column("evaluation_duration_ms", sa.Float(), nullable=True),
    )

    # 2. Add composite indexes on tool_requests supporting analytics and tenant isolation
    op.create_index(
        "ix_tool_requests_org_evaluated",
        "tool_requests",
        ["organization_id", "evaluated_at"],
        unique=False,
    )
    op.create_index(
        "ix_tool_requests_org_decision_evaluated",
        "tool_requests",
        ["organization_id", "decision", "evaluated_at"],
        unique=False,
    )
    op.create_index(
        "ix_tool_requests_org_agent_evaluated",
        "tool_requests",
        ["organization_id", "agent_id", "evaluated_at"],
        unique=False,
    )
    op.create_index(
        "ix_tool_requests_org_tool_evaluated",
        "tool_requests",
        ["organization_id", "tool_id", "evaluated_at"],
        unique=False,
    )

    # 3. Add composite index on risk_assessments for tenant-scoped risk history
    op.create_index(
        "ix_risk_assessments_org_assessed",
        "risk_assessments",
        ["organization_id", "assessed_at"],
        unique=False,
    )

    # 4. Add composite index on approval_requests for pending approval workflows
    op.create_index(
        "ix_approval_requests_org_created",
        "approval_requests",
        ["organization_id", "created_at"],
        unique=False,
    )


def downgrade() -> None:
    # 1. Drop composite indexes
    op.drop_index("ix_approval_requests_org_created", table_name="approval_requests")
    op.drop_index("ix_risk_assessments_org_assessed", table_name="risk_assessments")
    op.drop_index("ix_tool_requests_org_tool_evaluated", table_name="tool_requests")
    op.drop_index("ix_tool_requests_org_agent_evaluated", table_name="tool_requests")
    op.drop_index("ix_tool_requests_org_decision_evaluated", table_name="tool_requests")
    op.drop_index("ix_tool_requests_org_evaluated", table_name="tool_requests")

    # 2. Drop evaluation_duration_ms column from tool_requests
    op.drop_column("tool_requests", "evaluation_duration_ms")
