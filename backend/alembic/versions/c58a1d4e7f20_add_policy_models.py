"""Add policy models.

Revision ID: c58a1d4e7f20
Revises: b47f9c2d1e08
Create Date: 2026-11-08 15:15:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "c58a1d4e7f20"
down_revision: str | None = "b47f9c2d1e08"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # 1. Create policies table (without current_version_id FK initially to avoid circular dependency)
    op.create_table(
        "policies",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("organization_id", sa.UUID(), nullable=False),
        sa.Column("created_by_user_id", sa.UUID(), nullable=False),
        sa.Column("current_version_id", sa.UUID(), nullable=True),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("slug", sa.String(length=255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column(
            "policy_type",
            sa.Enum("SECURITY", "OPERATIONAL", "COMPLIANCE", "FINANCIAL", name="policytype"),
            nullable=False,
        ),
        sa.Column(
            "status",
            sa.Enum("DRAFT", "ACTIVE", "INACTIVE", "ARCHIVED", name="policystatus"),
            nullable=False,
        ),
        sa.Column("priority", sa.Integer(), server_default="100", nullable=False),
        sa.Column(
            "default_action",
            sa.Enum("ALLOW", "DENY", "REQUIRE_APPROVAL", name="policyaction"),
            nullable=False,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("organization_id", "slug", name="uq_policy_org_slug"),
    )
    op.create_index(op.f("ix_policies_organization_id"), "policies", ["organization_id"], unique=False)
    op.create_index(op.f("ix_policies_created_by_user_id"), "policies", ["created_by_user_id"], unique=False)
    op.create_index(op.f("ix_policies_policy_type"), "policies", ["policy_type"], unique=False)
    op.create_index(op.f("ix_policies_status"), "policies", ["status"], unique=False)
    op.create_index(op.f("ix_policies_priority"), "policies", ["priority"], unique=False)

    # 2. Create policy_versions table
    op.create_table(
        "policy_versions",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("policy_id", sa.UUID(), nullable=False),
        sa.Column("version_number", sa.Integer(), server_default="1", nullable=False),
        sa.Column(
            "status",
            sa.Enum("DRAFT", "PUBLISHED", "RETIRED", name="policyversionstatus"),
            nullable=False,
        ),
        sa.Column("changelog", sa.Text(), nullable=True),
        sa.Column("published_by_user_id", sa.UUID(), nullable=True),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["policy_id"], ["policies.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["published_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("policy_id", "version_number", name="uq_policy_version_number"),
    )
    op.create_index(op.f("ix_policy_versions_policy_id"), "policy_versions", ["policy_id"], unique=False)
    op.create_index(op.f("ix_policy_versions_status"), "policy_versions", ["status"], unique=False)

    # 3. Add circular foreign key for current_version_id
    op.create_foreign_key(
        "fk_policies_current_version_id",
        "policies",
        "policy_versions",
        ["current_version_id"],
        ["id"],
        ondelete="SET NULL",
        use_alter=True,
    )

    # 4. Create policy_rules table
    op.create_table(
        "policy_rules",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("policy_version_id", sa.UUID(), nullable=False),
        sa.Column("rule_name", sa.String(length=255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("rule_order", sa.Integer(), server_default="1", nullable=False),
        sa.Column(
            "action",
            sa.Enum("ALLOW", "DENY", "REQUIRE_APPROVAL", name="policyaction", create_type=False),
            nullable=False,
        ),
        sa.Column("violation_code", sa.String(length=100), server_default="POLICY_VIOLATION", nullable=False),
        sa.Column("remediation_message", sa.Text(), nullable=True),
        sa.Column("target_scope", sa.JSON(), nullable=False),
        sa.Column("condition_tree", sa.JSON(), nullable=False),
        sa.Column("is_enabled", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["policy_version_id"], ["policy_versions.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_policy_rules_policy_version_id"), "policy_rules", ["policy_version_id"], unique=False)
    op.create_index(op.f("ix_policy_rules_action"), "policy_rules", ["action"], unique=False)

    # 5. Add policy_evaluations column to tool_requests for immutable audit tracking
    op.add_column("tool_requests", sa.Column("policy_evaluations", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("tool_requests", "policy_evaluations")

    op.drop_index(op.f("ix_policy_rules_action"), table_name="policy_rules")
    op.drop_index(op.f("ix_policy_rules_policy_version_id"), table_name="policy_rules")
    op.drop_table("policy_rules")

    op.drop_constraint("fk_policies_current_version_id", "policies", type_="foreignkey")

    op.drop_index(op.f("ix_policy_versions_status"), table_name="policy_versions")
    op.drop_index(op.f("ix_policy_versions_policy_id"), table_name="policy_versions")
    op.drop_table("policy_versions")

    op.drop_index(op.f("ix_policies_priority"), table_name="policies")
    op.drop_index(op.f("ix_policies_status"), table_name="policies")
    op.drop_index(op.f("ix_policies_policy_type"), table_name="policies")
    op.drop_index(op.f("ix_policies_created_by_user_id"), table_name="policies")
    op.drop_index(op.f("ix_policies_organization_id"), table_name="policies")
    op.drop_table("policies")

    op.execute("DROP TYPE IF EXISTS policyversionstatus")
    op.execute("DROP TYPE IF EXISTS policystatus")
    op.execute("DROP TYPE IF EXISTS policytype")
    op.execute("DROP TYPE IF EXISTS policyaction")
