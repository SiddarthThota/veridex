"""add_governance_models

Revision ID: b47f9c2d1e08
Revises: 6ae3ffd4b290
Create Date: 2026-11-08 11:41:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "b47f9c2d1e08"
down_revision: str | None = "6ae3ffd4b290"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # 1. Create agent_runs table
    op.create_table(
        "agent_runs",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("organization_id", sa.UUID(), nullable=False),
        sa.Column("agent_id", sa.UUID(), nullable=False),
        sa.Column("agent_version_id", sa.UUID(), nullable=True),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column(
            "status",
            sa.Enum("PENDING", "RUNNING", "COMPLETED", "FAILED", "CANCELLED", name="runstatus"),
            nullable=False,
        ),
        sa.Column("environment", sa.String(length=50), nullable=False),
        sa.Column("trace_id", sa.String(length=255), nullable=True),
        sa.Column("input_prompt", sa.Text(), nullable=True),
        sa.Column("output_summary", sa.Text(), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["agent_id"], ["agents.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["agent_version_id"], ["agent_versions.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_agent_runs_agent_id"), "agent_runs", ["agent_id"], unique=False)
    op.create_index(op.f("ix_agent_runs_agent_version_id"), "agent_runs", ["agent_version_id"], unique=False)
    op.create_index(op.f("ix_agent_runs_organization_id"), "agent_runs", ["organization_id"], unique=False)
    op.create_index(op.f("ix_agent_runs_status"), "agent_runs", ["status"], unique=False)
    op.create_index(op.f("ix_agent_runs_trace_id"), "agent_runs", ["trace_id"], unique=False)
    op.create_index(op.f("ix_agent_runs_user_id"), "agent_runs", ["user_id"], unique=False)

    # 2. Create tool_requests table
    op.create_table(
        "tool_requests",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("run_id", sa.UUID(), nullable=True),
        sa.Column("organization_id", sa.UUID(), nullable=False),
        sa.Column("agent_id", sa.UUID(), nullable=False),
        sa.Column("tool_id", sa.UUID(), nullable=False),
        sa.Column("tool_version_id", sa.UUID(), nullable=False),
        sa.Column(
            "decision",
            sa.Enum("ALLOW", "DENY", "REQUIRE_APPROVAL", name="governancedecision"),
            nullable=False,
        ),
        sa.Column("arguments", sa.JSON(), nullable=False),
        sa.Column("arguments_hash", sa.String(length=64), nullable=False),
        sa.Column("violation_codes", sa.JSON(), nullable=False),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column("environment", sa.String(length=50), nullable=False),
        sa.Column("evaluated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("idempotency_key", sa.String(length=255), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["agent_id"], ["agents.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["run_id"], ["agent_runs.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["tool_id"], ["tools.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["tool_version_id"], ["tool_versions.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_tool_requests_agent_id"), "tool_requests", ["agent_id"], unique=False)
    op.create_index(op.f("ix_tool_requests_arguments_hash"), "tool_requests", ["arguments_hash"], unique=False)
    op.create_index(op.f("ix_tool_requests_decision"), "tool_requests", ["decision"], unique=False)
    op.create_index(op.f("ix_tool_requests_idempotency_key"), "tool_requests", ["idempotency_key"], unique=False)
    op.create_index(op.f("ix_tool_requests_organization_id"), "tool_requests", ["organization_id"], unique=False)
    op.create_index(op.f("ix_tool_requests_run_id"), "tool_requests", ["run_id"], unique=False)
    op.create_index(op.f("ix_tool_requests_tool_id"), "tool_requests", ["tool_id"], unique=False)
    op.create_index(op.f("ix_tool_requests_tool_version_id"), "tool_requests", ["tool_version_id"], unique=False)

    # 3. Create tool_executions table
    op.create_table(
        "tool_executions",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("tool_request_id", sa.UUID(), nullable=False),
        sa.Column(
            "status",
            sa.Enum("PENDING", "RUNNING", "SUCCESS", "FAILED", "TIMED_OUT", name="executionstatus"),
            nullable=False,
        ),
        sa.Column("result", sa.JSON(), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("duration_ms", sa.Integer(), nullable=True),
        sa.Column("executed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["tool_request_id"], ["tool_requests.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_tool_executions_status"), "tool_executions", ["status"], unique=False)
    op.create_index(op.f("ix_tool_executions_tool_request_id"), "tool_executions", ["tool_request_id"], unique=True)

    # 4. Create approval_requests table
    op.create_table(
        "approval_requests",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("tool_request_id", sa.UUID(), nullable=False),
        sa.Column("organization_id", sa.UUID(), nullable=False),
        sa.Column(
            "status",
            sa.Enum("PENDING", "APPROVED", "REJECTED", "EXPIRED", name="approvalstatus"),
            nullable=False,
        ),
        sa.Column("integrity_hash", sa.String(length=64), nullable=False),
        sa.Column("requested_by_user_id", sa.UUID(), nullable=True),
        sa.Column("reviewed_by_user_id", sa.UUID(), nullable=True),
        sa.Column("review_decision_reason", sa.Text(), nullable=True),
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["requested_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["reviewed_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["tool_request_id"], ["tool_requests.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("tool_request_id", name="uq_approval_tool_request"),
    )
    op.create_index(
        op.f("ix_approval_requests_organization_id"), "approval_requests", ["organization_id"], unique=False
    )
    op.create_index(op.f("ix_approval_requests_status"), "approval_requests", ["status"], unique=False)
    op.create_index(op.f("ix_approval_requests_tool_request_id"), "approval_requests", ["tool_request_id"], unique=True)


def downgrade() -> None:
    op.drop_index(op.f("ix_approval_requests_tool_request_id"), table_name="approval_requests")
    op.drop_index(op.f("ix_approval_requests_status"), table_name="approval_requests")
    op.drop_index(op.f("ix_approval_requests_organization_id"), table_name="approval_requests")
    op.drop_table("approval_requests")

    op.drop_index(op.f("ix_tool_executions_tool_request_id"), table_name="tool_executions")
    op.drop_index(op.f("ix_tool_executions_status"), table_name="tool_executions")
    op.drop_table("tool_executions")

    op.drop_index(op.f("ix_tool_requests_tool_version_id"), table_name="tool_requests")
    op.drop_index(op.f("ix_tool_requests_tool_id"), table_name="tool_requests")
    op.drop_index(op.f("ix_tool_requests_run_id"), table_name="tool_requests")
    op.drop_index(op.f("ix_tool_requests_organization_id"), table_name="tool_requests")
    op.drop_index(op.f("ix_tool_requests_idempotency_key"), table_name="tool_requests")
    op.drop_index(op.f("ix_tool_requests_decision"), table_name="tool_requests")
    op.drop_index(op.f("ix_tool_requests_arguments_hash"), table_name="tool_requests")
    op.drop_index(op.f("ix_tool_requests_agent_id"), table_name="tool_requests")
    op.drop_table("tool_requests")

    op.drop_index(op.f("ix_agent_runs_user_id"), table_name="agent_runs")
    op.drop_index(op.f("ix_agent_runs_trace_id"), table_name="agent_runs")
    op.drop_index(op.f("ix_agent_runs_status"), table_name="agent_runs")
    op.drop_index(op.f("ix_agent_runs_organization_id"), table_name="agent_runs")
    op.drop_index(op.f("ix_agent_runs_agent_version_id"), table_name="agent_runs")
    op.drop_index(op.f("ix_agent_runs_agent_id"), table_name="agent_runs")
    op.drop_table("agent_runs")

    # Drop enums
    sa.Enum(name="approvalstatus").drop(op.get_bind(), checkfirst=True)
    sa.Enum(name="executionstatus").drop(op.get_bind(), checkfirst=True)
    sa.Enum(name="governancedecision").drop(op.get_bind(), checkfirst=True)
    sa.Enum(name="runstatus").drop(op.get_bind(), checkfirst=True)
