"""Add risk engine models.

Revision ID: d48a1e5f8b30
Revises: c58a1d4e7f20
Create Date: 2026-11-09 16:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "d48a1e5f8b30"
down_revision: str | None = "c58a1d4e7f20"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # 1. Create risk_configurations table (without current_version_id FK initially to avoid circular dependency)
    op.create_table(
        "risk_configurations",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("organization_id", sa.UUID(), nullable=False),
        sa.Column("current_version_id", sa.UUID(), nullable=True),
        sa.Column("is_active", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("organization_id", name="uq_risk_config_org"),
    )
    op.create_index(
        op.f("ix_risk_configurations_organization_id"), "risk_configurations", ["organization_id"], unique=False
    )

    # 2. Create risk_configuration_versions table
    op.create_table(
        "risk_configuration_versions",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("risk_configuration_id", sa.UUID(), nullable=False),
        sa.Column("version_number", sa.Integer(), server_default="1", nullable=False),
        sa.Column("weight_tool", sa.Float(), server_default="0.35", nullable=False),
        sa.Column("weight_data", sa.Float(), server_default="0.25", nullable=False),
        sa.Column("weight_agent", sa.Float(), server_default="0.20", nullable=False),
        sa.Column("weight_context", sa.Float(), server_default="0.20", nullable=False),
        sa.Column("threshold_medium", sa.Integer(), server_default="30", nullable=False),
        sa.Column("threshold_high", sa.Integer(), server_default="60", nullable=False),
        sa.Column("threshold_critical", sa.Integer(), server_default="85", nullable=False),
        sa.Column("approval_threshold", sa.Integer(), server_default="60", nullable=False),
        sa.Column("deny_threshold", sa.Integer(), server_default="90", nullable=False),
        sa.Column("heuristic_rules", sa.JSON(), server_default=sa.text("'[]'"), nullable=False),
        sa.Column("scoring_algorithm_version", sa.String(length=50), server_default="1.0.0", nullable=False),
        sa.Column("changelog", sa.Text(), nullable=True),
        sa.Column("created_by_user_id", sa.UUID(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["risk_configuration_id"], ["risk_configurations.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("risk_configuration_id", "version_number", name="uq_risk_config_version_number"),
    )
    op.create_index(
        op.f("ix_risk_configuration_versions_risk_configuration_id"),
        "risk_configuration_versions",
        ["risk_configuration_id"],
        unique=False,
    )

    # 3. Add circular foreign key to risk_configurations
    op.create_foreign_key(
        "fk_risk_config_current_version_id",
        "risk_configurations",
        "risk_configuration_versions",
        ["current_version_id"],
        ["id"],
        ondelete="SET NULL",
    )

    # 4. Create agent_risk_profiles table
    op.create_table(
        "agent_risk_profiles",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("organization_id", sa.UUID(), nullable=False),
        sa.Column("agent_id", sa.UUID(), nullable=False),
        sa.Column("calculated_trust_score", sa.Float(), server_default="100.0", nullable=False),
        sa.Column("total_eligible_invocations", sa.Integer(), server_default="0", nullable=False),
        sa.Column("total_violations", sa.Integer(), server_default="0", nullable=False),
        sa.Column("violation_rate", sa.Float(), server_default="0.0", nullable=False),
        sa.Column(
            "history_status",
            sa.Enum("VALID", "INSUFFICIENT_DATA", name="agenthistorystatus"),
            server_default="INSUFFICIENT_DATA",
            nullable=False,
        ),
        sa.Column("observation_window_days", sa.Integer(), server_default="7", nullable=False),
        sa.Column("last_assessed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["agent_id"], ["agents.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("agent_id", name="uq_agent_risk_profiles_agent_id"),
    )
    op.create_index(
        op.f("ix_agent_risk_profiles_organization_id"), "agent_risk_profiles", ["organization_id"], unique=False
    )
    op.create_index(op.f("ix_agent_risk_profiles_agent_id"), "agent_risk_profiles", ["agent_id"], unique=False)

    # 5. Create risk_assessments table
    op.create_table(
        "risk_assessments",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("organization_id", sa.UUID(), nullable=False),
        sa.Column("tool_request_id", sa.UUID(), nullable=True),
        sa.Column("agent_id", sa.UUID(), nullable=False),
        sa.Column("tool_id", sa.UUID(), nullable=False),
        sa.Column("tool_version_id", sa.UUID(), nullable=False),
        sa.Column("config_version_id", sa.UUID(), nullable=True),
        sa.Column("scoring_algorithm_version", sa.String(length=50), server_default="1.0.0", nullable=False),
        sa.Column("risk_score", sa.Integer(), nullable=False),
        sa.Column(
            "risk_level",
            sa.Enum("LOW", "MEDIUM", "HIGH", "CRITICAL", name="risklevel"),
            nullable=False,
        ),
        sa.Column("subscore_tool", sa.Float(), nullable=False),
        sa.Column("subscore_data", sa.Float(), nullable=False),
        sa.Column("subscore_agent", sa.Float(), nullable=False),
        sa.Column("subscore_context", sa.Float(), nullable=False),
        sa.Column("factor_breakdown", sa.JSON(), server_default=sa.text("'{}'"), nullable=False),
        sa.Column("heuristics_matched", sa.JSON(), server_default=sa.text("'[]'"), nullable=False),
        sa.Column("config_snapshot", sa.JSON(), server_default=sa.text("'{}'"), nullable=False),
        sa.Column("explanation", sa.Text(), nullable=True),
        sa.Column("assessed_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["agent_id"], ["agents.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["config_version_id"], ["risk_configuration_versions.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["tool_id"], ["tools.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["tool_request_id"], ["tool_requests.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["tool_version_id"], ["tool_versions.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_risk_assessments_organization_id"), "risk_assessments", ["organization_id"], unique=False)
    op.create_index(op.f("ix_risk_assessments_tool_request_id"), "risk_assessments", ["tool_request_id"], unique=False)
    op.create_index(op.f("ix_risk_assessments_agent_id"), "risk_assessments", ["agent_id"], unique=False)
    op.create_index(op.f("ix_risk_assessments_tool_id"), "risk_assessments", ["tool_id"], unique=False)
    op.create_index(op.f("ix_risk_assessments_tool_version_id"), "risk_assessments", ["tool_version_id"], unique=False)
    op.create_index(
        op.f("ix_risk_assessments_config_version_id"), "risk_assessments", ["config_version_id"], unique=False
    )
    op.create_index(op.f("ix_risk_assessments_risk_score"), "risk_assessments", ["risk_score"], unique=False)
    op.create_index(op.f("ix_risk_assessments_risk_level"), "risk_assessments", ["risk_level"], unique=False)

    # 6. Add risk_assessment_id column and foreign key to tool_requests
    op.add_column("tool_requests", sa.Column("risk_assessment_id", sa.UUID(), nullable=True))
    op.create_index(op.f("ix_tool_requests_risk_assessment_id"), "tool_requests", ["risk_assessment_id"], unique=False)
    op.create_foreign_key(
        "fk_tool_requests_risk_assessment_id",
        "tool_requests",
        "risk_assessments",
        ["risk_assessment_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    # 1. Drop foreign key and column from tool_requests
    op.drop_constraint("fk_tool_requests_risk_assessment_id", "tool_requests", type_="foreignkey")
    op.drop_index(op.f("ix_tool_requests_risk_assessment_id"), table_name="tool_requests")
    op.drop_column("tool_requests", "risk_assessment_id")

    # 2. Drop risk_assessments table
    op.drop_index(op.f("ix_risk_assessments_risk_level"), table_name="risk_assessments")
    op.drop_index(op.f("ix_risk_assessments_risk_score"), table_name="risk_assessments")
    op.drop_index(op.f("ix_risk_assessments_config_version_id"), table_name="risk_assessments")
    op.drop_index(op.f("ix_risk_assessments_tool_version_id"), table_name="risk_assessments")
    op.drop_index(op.f("ix_risk_assessments_tool_id"), table_name="risk_assessments")
    op.drop_index(op.f("ix_risk_assessments_agent_id"), table_name="risk_assessments")
    op.drop_index(op.f("ix_risk_assessments_tool_request_id"), table_name="risk_assessments")
    op.drop_index(op.f("ix_risk_assessments_organization_id"), table_name="risk_assessments")
    op.drop_table("risk_assessments")

    # 3. Drop agent_risk_profiles table
    op.drop_index(op.f("ix_agent_risk_profiles_agent_id"), table_name="agent_risk_profiles")
    op.drop_index(op.f("ix_agent_risk_profiles_organization_id"), table_name="agent_risk_profiles")
    op.drop_table("agent_risk_profiles")

    # 4. Drop circular FK from risk_configurations
    op.drop_constraint("fk_risk_config_current_version_id", "risk_configurations", type_="foreignkey")

    # 5. Drop risk_configuration_versions table
    op.drop_index(
        op.f("ix_risk_configuration_versions_risk_configuration_id"), table_name="risk_configuration_versions"
    )
    op.drop_table("risk_configuration_versions")

    # 6. Drop risk_configurations table
    op.drop_index(op.f("ix_risk_configurations_organization_id"), table_name="risk_configurations")
    op.drop_table("risk_configurations")

    # 7. Drop enums
    sa.Enum(name="agenthistorystatus").drop(op.get_bind(), checkfirst=True)
    sa.Enum(name="risklevel").drop(op.get_bind(), checkfirst=True)
