"""Policy domain models for Veridex Policy Engine (Phase 6).

Implements declarative, versioned policy management with immutable published versions,
fine-grained rule scopes, safe AST conditions, and multi-tenant isolation.
"""

import enum
import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base, TimestampMixin, UUIDMixin


class PolicyType(enum.StrEnum):
    """Classification of governance policies."""

    SECURITY = "SECURITY"
    OPERATIONAL = "OPERATIONAL"
    COMPLIANCE = "COMPLIANCE"
    FINANCIAL = "FINANCIAL"


class PolicyStatus(enum.StrEnum):
    """Lifecycle status of a Policy container."""

    DRAFT = "DRAFT"
    ACTIVE = "ACTIVE"
    INACTIVE = "INACTIVE"
    ARCHIVED = "ARCHIVED"


class PolicyVersionStatus(enum.StrEnum):
    """Lifecycle status of an individual PolicyVersion.

    Once PUBLISHED, a version and all its linked rules become permanently immutable.
    """

    DRAFT = "DRAFT"
    PUBLISHED = "PUBLISHED"
    RETIRED = "RETIRED"


class PolicyAction(enum.StrEnum):
    """Outcome action evaluated by a policy rule."""

    ALLOW = "ALLOW"
    DENY = "DENY"
    REQUIRE_APPROVAL = "REQUIRE_APPROVAL"


class PolicyOperator(enum.StrEnum):
    """Supported safe comparison operators for condition expressions."""

    EQUALS = "EQUALS"
    NOT_EQUALS = "NOT_EQUALS"
    GREATER_THAN = "GREATER_THAN"
    GREATER_THAN_OR_EQUAL = "GREATER_THAN_OR_EQUAL"
    LESS_THAN = "LESS_THAN"
    LESS_THAN_OR_EQUAL = "LESS_THAN_OR_EQUAL"
    IN = "IN"
    NOT_IN = "NOT_IN"
    CONTAINS = "CONTAINS"
    STARTS_WITH = "STARTS_WITH"
    ENDS_WITH = "ENDS_WITH"
    MATCHES_REGEX = "MATCHES_REGEX"
    IS_NULL = "IS_NULL"
    IS_NOT_NULL = "IS_NOT_NULL"


class ConditionCombinator(enum.StrEnum):
    """Logical combinator for condition trees."""

    AND = "AND"
    OR = "OR"
    NOT = "NOT"


class Policy(Base, UUIDMixin, TimestampMixin):
    """A policy container defining governance intent, priority, and default stance."""

    __tablename__ = "policies"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("organizations.id", ondelete="CASCADE"), index=True, nullable=False
    )
    created_by_user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"), index=True, nullable=False
    )
    current_version_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("policy_versions.id", ondelete="SET NULL", use_alter=True, name="fk_policies_current_version_id"),
        nullable=True,
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    policy_type: Mapped[PolicyType] = mapped_column(
        Enum(PolicyType), default=PolicyType.SECURITY, nullable=False, index=True
    )
    status: Mapped[PolicyStatus] = mapped_column(
        Enum(PolicyStatus), default=PolicyStatus.DRAFT, nullable=False, index=True
    )
    priority: Mapped[int] = mapped_column(Integer, default=100, nullable=False, index=True)
    default_action: Mapped[PolicyAction] = mapped_column(Enum(PolicyAction), default=PolicyAction.DENY, nullable=False)

    organization = relationship("Organization")
    created_by = relationship("User", foreign_keys=[created_by_user_id])
    current_version = relationship(
        "PolicyVersion",
        foreign_keys=[current_version_id],
        post_update=True,
    )
    versions: Mapped[list["PolicyVersion"]] = relationship(
        "PolicyVersion",
        back_populates="policy",
        cascade="all, delete-orphan",
        foreign_keys="[PolicyVersion.policy_id]",
    )

    __table_args__ = (UniqueConstraint("organization_id", "slug", name="uq_policy_org_slug"),)


class PolicyVersion(Base, UUIDMixin, TimestampMixin):
    """An immutable versioned snapshot of policy rules.

    Published policy versions cannot be modified. Any changes require
    branching a new DRAFT version.
    """

    __tablename__ = "policy_versions"

    policy_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("policies.id", ondelete="CASCADE"), index=True, nullable=False
    )
    version_number: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    status: Mapped[PolicyVersionStatus] = mapped_column(
        Enum(PolicyVersionStatus), default=PolicyVersionStatus.DRAFT, nullable=False, index=True
    )
    changelog: Mapped[str | None] = mapped_column(Text, nullable=True)
    published_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    policy: Mapped["Policy"] = relationship("Policy", foreign_keys=[policy_id], back_populates="versions")
    published_by = relationship("User", foreign_keys=[published_by_user_id])
    rules: Mapped[list["PolicyRule"]] = relationship(
        "PolicyRule",
        back_populates="policy_version",
        cascade="all, delete-orphan",
        order_by="PolicyRule.rule_order",
    )

    __table_args__ = (UniqueConstraint("policy_id", "version_number", name="uq_policy_version_number"),)


class PolicyRule(Base, UUIDMixin, TimestampMixin):
    """An individual governance rule permanently bound to an immutable PolicyVersion."""

    __tablename__ = "policy_rules"

    policy_version_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("policy_versions.id", ondelete="CASCADE"), index=True, nullable=False
    )
    rule_name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    rule_order: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    action: Mapped[PolicyAction] = mapped_column(Enum(PolicyAction), default=PolicyAction.DENY, nullable=False)
    violation_code: Mapped[str] = mapped_column(String(100), default="POLICY_VIOLATION", nullable=False)
    remediation_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    target_scope: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict, nullable=False)
    condition_tree: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict, nullable=False)
    is_enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    policy_version: Mapped["PolicyVersion"] = relationship("PolicyVersion", back_populates="rules")
