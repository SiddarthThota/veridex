"""Risk domain models for Veridex Risk Engine (Phase 7).

Implements RiskConfiguration, RiskConfigurationVersion, AgentRiskProfile,
and RiskAssessment models with immutable configuration snapshotting,
granular subscore vectors, and multi-tenant isolation.
"""

import enum
import uuid
from datetime import datetime
from typing import TYPE_CHECKING, Any

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base, TimestampMixin, UUIDMixin

if TYPE_CHECKING:
    from app.agents.models import Agent
    from app.governance.models import ToolRequest
    from app.tools.models import Tool, ToolVersion
    from app.users.models import Organization, User


class RiskLevel(enum.StrEnum):
    """Normalized four-tier risk classification."""

    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    CRITICAL = "CRITICAL"


class AgentHistoryStatus(enum.StrEnum):
    """Classification of agent sliding-window historical data sufficiency."""

    VALID = "VALID"
    INSUFFICIENT_DATA = "INSUFFICIENT_DATA"


class RiskConfiguration(Base, UUIDMixin, TimestampMixin):
    """Parent risk configuration container per organization."""

    __tablename__ = "risk_configurations"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("organizations.id", ondelete="CASCADE"), index=True, nullable=False
    )
    current_version_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey(
            "risk_configuration_versions.id",
            ondelete="SET NULL",
            use_alter=True,
            name="fk_risk_config_current_version_id",
        ),
        nullable=True,
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    organization: Mapped["Organization"] = relationship("Organization")
    current_version: Mapped["RiskConfigurationVersion | None"] = relationship(
        "RiskConfigurationVersion",
        foreign_keys=[current_version_id],
        post_update=True,
    )
    versions: Mapped[list["RiskConfigurationVersion"]] = relationship(
        "RiskConfigurationVersion",
        back_populates="configuration",
        foreign_keys="RiskConfigurationVersion.risk_configuration_id",
        cascade="all, delete-orphan",
    )

    __table_args__ = (UniqueConstraint("organization_id", name="uq_risk_config_org"),)


class RiskConfigurationVersion(Base, UUIDMixin, TimestampMixin):
    """Immutable snapshot of risk scoring weights, thresholds, and heuristic rules."""

    __tablename__ = "risk_configuration_versions"

    risk_configuration_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("risk_configurations.id", ondelete="CASCADE"), index=True, nullable=False
    )
    version_number: Mapped[int] = mapped_column(Integer, nullable=False, default=1)

    # 4-Vector Weights (must sum to 1.0)
    weight_tool: Mapped[float] = mapped_column(Float, nullable=False, default=0.35)
    weight_data: Mapped[float] = mapped_column(Float, nullable=False, default=0.25)
    weight_agent: Mapped[float] = mapped_column(Float, nullable=False, default=0.20)
    weight_context: Mapped[float] = mapped_column(Float, nullable=False, default=0.20)

    # Classification Threshold Boundaries (0-100)
    threshold_medium: Mapped[int] = mapped_column(Integer, nullable=False, default=30)
    threshold_high: Mapped[int] = mapped_column(Integer, nullable=False, default=60)
    threshold_critical: Mapped[int] = mapped_column(Integer, nullable=False, default=85)

    # Action Triggers
    approval_threshold: Mapped[int] = mapped_column(Integer, nullable=False, default=60)
    deny_threshold: Mapped[int] = mapped_column(Integer, nullable=False, default=90)

    # Path-scoped argument heuristic rule definitions
    heuristic_rules: Mapped[list[dict[str, Any]]] = mapped_column(JSON, nullable=False, default=list)

    scoring_algorithm_version: Mapped[str] = mapped_column(String(50), nullable=False, default="1.0.0")
    changelog: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    configuration: Mapped["RiskConfiguration"] = relationship(
        "RiskConfiguration",
        back_populates="versions",
        foreign_keys=[risk_configuration_id],
    )
    created_by: Mapped["User | None"] = relationship("User")

    __table_args__ = (
        UniqueConstraint("risk_configuration_id", "version_number", name="uq_risk_config_version_number"),
    )


class AgentRiskProfile(Base, UUIDMixin, TimestampMixin):
    """Empirical sliding-window risk metrics and calculated trust score for an agent."""

    __tablename__ = "agent_risk_profiles"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("organizations.id", ondelete="CASCADE"), index=True, nullable=False
    )
    agent_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("agents.id", ondelete="CASCADE"), unique=True, index=True, nullable=False
    )
    calculated_trust_score: Mapped[float] = mapped_column(Float, nullable=False, default=100.0)
    total_eligible_invocations: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    total_violations: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    violation_rate: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    history_status: Mapped[AgentHistoryStatus] = mapped_column(
        Enum(AgentHistoryStatus), nullable=False, default=AgentHistoryStatus.INSUFFICIENT_DATA
    )
    observation_window_days: Mapped[int] = mapped_column(Integer, nullable=False, default=7)
    last_assessed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    organization: Mapped["Organization"] = relationship("Organization")
    agent: Mapped["Agent"] = relationship("Agent")


class RiskAssessment(Base, UUIDMixin, TimestampMixin):
    """Immutable record of a quantitative risk evaluation for audit and governance."""

    __tablename__ = "risk_assessments"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("organizations.id", ondelete="CASCADE"), index=True, nullable=False
    )
    tool_request_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("tool_requests.id", ondelete="CASCADE"), index=True, nullable=True
    )
    agent_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("agents.id", ondelete="CASCADE"), index=True, nullable=False)
    tool_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("tools.id", ondelete="CASCADE"), index=True, nullable=False)
    tool_version_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("tool_versions.id", ondelete="RESTRICT"), index=True, nullable=False
    )
    config_version_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("risk_configuration_versions.id", ondelete="SET NULL"), index=True, nullable=True
    )

    scoring_algorithm_version: Mapped[str] = mapped_column(String(50), nullable=False, default="1.0.0")

    # Composite Score (0-100) and Level
    risk_score: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    risk_level: Mapped[RiskLevel] = mapped_column(Enum(RiskLevel), nullable=False, index=True)

    # Subscore breakdown
    subscore_tool: Mapped[float] = mapped_column(Float, nullable=False)
    subscore_data: Mapped[float] = mapped_column(Float, nullable=False)
    subscore_agent: Mapped[float] = mapped_column(Float, nullable=False)
    subscore_context: Mapped[float] = mapped_column(Float, nullable=False)

    # Structured audit details
    factor_breakdown: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    heuristics_matched: Mapped[list[dict[str, Any]]] = mapped_column(JSON, nullable=False, default=list)
    config_snapshot: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    explanation: Mapped[str | None] = mapped_column(Text, nullable=True)

    assessed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    organization: Mapped["Organization"] = relationship("Organization")
    agent: Mapped["Agent"] = relationship("Agent")
    tool: Mapped["Tool"] = relationship("Tool")
    tool_version: Mapped["ToolVersion"] = relationship("ToolVersion")
    config_version: Mapped["RiskConfigurationVersion | None"] = relationship("RiskConfigurationVersion")
    tool_request: Mapped["ToolRequest | None"] = relationship(
        "ToolRequest",
        foreign_keys=[tool_request_id],
    )
