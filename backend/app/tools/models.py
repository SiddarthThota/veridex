"""Tool models for the Tool Registry."""

import enum
import uuid
from typing import Any

from sqlalchemy import JSON, Enum, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base, TimestampMixin, UUIDMixin


class ToolStatus(enum.StrEnum):
    DRAFT = "DRAFT"
    ACTIVE = "ACTIVE"
    SUSPENDED = "SUSPENDED"
    DEACTIVATED = "DEACTIVATED"


class ToolAccessType(enum.StrEnum):
    READ = "READ"
    WRITE = "WRITE"


class ToolReversibility(enum.StrEnum):
    REVERSIBLE = "REVERSIBLE"
    IRREVERSIBLE = "IRREVERSIBLE"


class ToolRiskLevel(enum.StrEnum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    CRITICAL = "CRITICAL"


class ToolDataClassification(enum.StrEnum):
    PUBLIC = "PUBLIC"
    INTERNAL = "INTERNAL"
    CONFIDENTIAL = "CONFIDENTIAL"
    RESTRICTED = "RESTRICTED"


class ToolApprovalRequirement(enum.StrEnum):
    NOT_REQUIRED = "NOT_REQUIRED"
    OPTIONAL = "OPTIONAL"
    REQUIRED = "REQUIRED"


class ToolVersionStatus(enum.StrEnum):
    DRAFT = "DRAFT"
    PUBLISHED = "PUBLISHED"
    RETIRED = "RETIRED"


class Tool(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "tools"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("organizations.id", ondelete="CASCADE"), index=True, nullable=False
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    owner_user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"), index=True, nullable=False
    )

    status: Mapped[ToolStatus] = mapped_column(
        Enum(ToolStatus), default=ToolStatus.DRAFT, nullable=False
    )
    risk_level: Mapped[ToolRiskLevel] = mapped_column(
        Enum(ToolRiskLevel), default=ToolRiskLevel.LOW, nullable=False
    )
    access_type: Mapped[ToolAccessType] = mapped_column(
        Enum(ToolAccessType), default=ToolAccessType.READ, nullable=False
    )
    reversibility: Mapped[ToolReversibility] = mapped_column(
        Enum(ToolReversibility), default=ToolReversibility.REVERSIBLE, nullable=False
    )
    data_classification: Mapped[ToolDataClassification] = mapped_column(
        Enum(ToolDataClassification), default=ToolDataClassification.INTERNAL, nullable=False
    )
    approval_requirement: Mapped[ToolApprovalRequirement] = mapped_column(
        Enum(ToolApprovalRequirement), default=ToolApprovalRequirement.NOT_REQUIRED, nullable=False
    )

    timeout_seconds: Mapped[int | None] = mapped_column(Integer, nullable=True)
    rate_limit: Mapped[int | None] = mapped_column(Integer, nullable=True)

    organization = relationship("Organization")
    owner = relationship("User")
    versions: Mapped[list["ToolVersion"]] = relationship(
        "ToolVersion", back_populates="tool", cascade="all, delete-orphan"
    )

    __table_args__ = (UniqueConstraint("organization_id", "slug", name="uq_tool_org_slug"),)


class ToolVersion(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "tool_versions"

    tool_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("tools.id", ondelete="CASCADE"), index=True, nullable=False
    )
    version: Mapped[str] = mapped_column(String(50), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    input_schema: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    output_schema: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    configuration_metadata: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)

    created_by: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    status: Mapped[ToolVersionStatus] = mapped_column(
        Enum(ToolVersionStatus), default=ToolVersionStatus.DRAFT, nullable=False
    )

    tool: Mapped["Tool"] = relationship("Tool", back_populates="versions")

    __table_args__ = (UniqueConstraint("tool_id", "version", name="uq_tool_version"),)


class AgentToolPermission(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "agent_tool_permissions"

    agent_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("agents.id", ondelete="CASCADE"), index=True, nullable=False
    )
    tool_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("tools.id", ondelete="CASCADE"), index=True, nullable=False
    )
    allowed: Mapped[bool] = mapped_column(default=True, nullable=False)

    created_by: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )

    agent = relationship("Agent")
    tool = relationship("Tool")

    __table_args__ = (UniqueConstraint("agent_id", "tool_id", name="uq_agent_tool"),)
