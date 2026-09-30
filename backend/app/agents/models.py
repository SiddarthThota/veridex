"""Agent and AgentVersion models."""

import enum
import uuid
from typing import Any

from sqlalchemy import JSON, Enum, ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base, TimestampMixin, UUIDMixin


class AgentStatus(enum.StrEnum):
    DRAFT = "DRAFT"
    ACTIVE = "ACTIVE"
    SUSPENDED = "SUSPENDED"
    DEACTIVATED = "DEACTIVATED"


class AgentEnvironment(enum.StrEnum):
    DEVELOPMENT = "DEVELOPMENT"
    STAGING = "STAGING"
    PRODUCTION = "PRODUCTION"


class AgentRiskTier(enum.StrEnum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    CRITICAL = "CRITICAL"


class AgentVersionStatus(enum.StrEnum):
    DRAFT = "DRAFT"
    PUBLISHED = "PUBLISHED"
    RETIRED = "RETIRED"


class Agent(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "agents"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("organizations.id", ondelete="CASCADE"), index=True, nullable=False
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    owner_user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"), index=True, nullable=False
    )
    status: Mapped[AgentStatus] = mapped_column(
        Enum(AgentStatus), default=AgentStatus.DRAFT, nullable=False
    )
    environment: Mapped[AgentEnvironment] = mapped_column(
        Enum(AgentEnvironment), default=AgentEnvironment.DEVELOPMENT, nullable=False
    )
    risk_tier: Mapped[AgentRiskTier] = mapped_column(
        Enum(AgentRiskTier), default=AgentRiskTier.LOW, nullable=False
    )

    model_provider: Mapped[str] = mapped_column(String(255), nullable=False)
    model_name: Mapped[str] = mapped_column(String(255), nullable=False)

    organization = relationship("Organization")
    owner = relationship("User")
    versions: Mapped[list["AgentVersion"]] = relationship(
        "AgentVersion", back_populates="agent", cascade="all, delete-orphan"
    )

    __table_args__ = (
        UniqueConstraint("organization_id", "slug", name="uq_agent_org_slug"),
    )


class AgentVersion(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "agent_versions"

    agent_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("agents.id", ondelete="CASCADE"), index=True, nullable=False
    )
    version: Mapped[str] = mapped_column(String(50), nullable=False)

    system_configuration: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    model_provider: Mapped[str] = mapped_column(String(255), nullable=False)
    model_name: Mapped[str] = mapped_column(String(255), nullable=False)
    configuration_metadata: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)

    created_by: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    status: Mapped[AgentVersionStatus] = mapped_column(
        Enum(AgentVersionStatus), default=AgentVersionStatus.DRAFT, nullable=False
    )

    agent: Mapped["Agent"] = relationship("Agent", back_populates="versions")

    __table_args__ = (
        UniqueConstraint("agent_id", "version", name="uq_agent_version"),
    )
