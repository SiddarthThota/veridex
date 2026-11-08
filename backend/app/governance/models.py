"""Governance models for Veridex Governance Gateway (Phase 5).

Implements AgentRun, ToolRequest, ToolExecution, and ApprovalRequest models
with strict foreign keys, organizational isolation, version binding, and integrity tracking.
"""

import enum
import hashlib
import json
import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import (
    JSON,
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


class RunStatus(enum.StrEnum):
    PENDING = "PENDING"
    RUNNING = "RUNNING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"
    CANCELLED = "CANCELLED"


class GovernanceDecision(enum.StrEnum):
    ALLOW = "ALLOW"
    DENY = "DENY"
    REQUIRE_APPROVAL = "REQUIRE_APPROVAL"


class GovernanceViolationCode(enum.StrEnum):
    UNKNOWN_AGENT = "UNKNOWN_AGENT"
    INACTIVE_AGENT = "INACTIVE_AGENT"
    UNKNOWN_TOOL = "UNKNOWN_TOOL"
    INACTIVE_TOOL = "INACTIVE_TOOL"
    UNPUBLISHED_TOOL_VERSION = "UNPUBLISHED_TOOL_VERSION"
    ORGANIZATION_MISMATCH = "ORGANIZATION_MISMATCH"
    PERMISSION_DENIED = "PERMISSION_DENIED"
    INVALID_ARGUMENTS = "INVALID_ARGUMENTS"
    APPROVAL_REQUIRED = "APPROVAL_REQUIRED"
    HIGH_RISK_RESTRICTION = "HIGH_RISK_RESTRICTION"
    IRREVERSIBLE_WRITE_RESTRICTION = "IRREVERSIBLE_WRITE_RESTRICTION"
    RESTRICTED_DATA_ACCESS = "RESTRICTED_DATA_ACCESS"
    RATE_LIMIT_EXCEEDED = "RATE_LIMIT_EXCEEDED"
    ARGUMENTS_HASH_MISMATCH = "ARGUMENTS_HASH_MISMATCH"
    DUPLICATE_APPROVAL_PROCESSING = "DUPLICATE_APPROVAL_PROCESSING"


class ExecutionStatus(enum.StrEnum):
    PENDING = "PENDING"
    RUNNING = "RUNNING"
    SUCCESS = "SUCCESS"
    FAILED = "FAILED"
    TIMED_OUT = "TIMED_OUT"


class ApprovalStatus(enum.StrEnum):
    PENDING = "PENDING"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"
    EXPIRED = "EXPIRED"


def compute_arguments_hash(tool_version_id: uuid.UUID, arguments: dict[str, Any]) -> str:
    """Compute deterministic SHA-256 integrity hash of tool_version_id and canonical arguments.

    Enforces Tool Version Integrity and Approval Integrity.
    """
    payload = {
        "tool_version_id": str(tool_version_id),
        "arguments": arguments,
    }
    canonical_json = json.dumps(payload, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical_json.encode("utf-8")).hexdigest()


class AgentRun(Base, UUIDMixin, TimestampMixin):
    """An execution session or task run performed by an agent."""

    __tablename__ = "agent_runs"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("organizations.id", ondelete="CASCADE"), index=True, nullable=False
    )
    agent_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("agents.id", ondelete="CASCADE"), index=True, nullable=False)
    agent_version_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("agent_versions.id", ondelete="SET NULL"), index=True, nullable=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), index=True, nullable=False)
    status: Mapped[RunStatus] = mapped_column(Enum(RunStatus), default=RunStatus.PENDING, nullable=False, index=True)
    environment: Mapped[str] = mapped_column(String(50), default="DEVELOPMENT", nullable=False)
    trace_id: Mapped[str | None] = mapped_column(String(255), nullable=True, index=True)
    input_prompt: Mapped[str | None] = mapped_column(Text, nullable=True)
    output_summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    organization = relationship("Organization")
    agent = relationship("Agent")
    agent_version = relationship("AgentVersion")
    user = relationship("User")
    tool_requests: Mapped[list["ToolRequest"]] = relationship(
        "ToolRequest", back_populates="run", cascade="all, delete-orphan"
    )


class ToolRequest(Base, UUIDMixin, TimestampMixin):
    """A tool invocation request evaluated by the Governance Gateway.

    Binds to an exact ToolVersion, enforces default-deny governance,
    and stores an integrity hash of the evaluated arguments.
    """

    __tablename__ = "tool_requests"

    run_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("agent_runs.id", ondelete="CASCADE"), index=True, nullable=True
    )
    organization_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("organizations.id", ondelete="CASCADE"), index=True, nullable=False
    )
    agent_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("agents.id", ondelete="CASCADE"), index=True, nullable=False)
    tool_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("tools.id", ondelete="CASCADE"), index=True, nullable=False)
    tool_version_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("tool_versions.id", ondelete="RESTRICT"), index=True, nullable=False
    )
    decision: Mapped[GovernanceDecision] = mapped_column(Enum(GovernanceDecision), nullable=False, index=True)
    arguments: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    arguments_hash: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    violation_codes: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    environment: Mapped[str] = mapped_column(String(50), default="DEVELOPMENT", nullable=False)
    evaluated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    idempotency_key: Mapped[str | None] = mapped_column(String(255), nullable=True, index=True)

    run: Mapped[AgentRun | None] = relationship("AgentRun", back_populates="tool_requests")
    organization = relationship("Organization")
    agent = relationship("Agent")
    tool = relationship("Tool")
    tool_version = relationship("ToolVersion")
    execution: Mapped["ToolExecution | None"] = relationship(
        "ToolExecution", back_populates="tool_request", uselist=False, cascade="all, delete-orphan"
    )
    approval_request: Mapped["ApprovalRequest | None"] = relationship(
        "ApprovalRequest", back_populates="tool_request", uselist=False, cascade="all, delete-orphan"
    )


class ToolExecution(Base, UUIDMixin, TimestampMixin):
    """Record of tool execution following an ALLOW decision or approval."""

    __tablename__ = "tool_executions"

    tool_request_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("tool_requests.id", ondelete="CASCADE"), unique=True, index=True, nullable=False
    )
    status: Mapped[ExecutionStatus] = mapped_column(
        Enum(ExecutionStatus), default=ExecutionStatus.PENDING, nullable=False, index=True
    )
    result: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    duration_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    executed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    tool_request: Mapped["ToolRequest"] = relationship("ToolRequest", back_populates="execution")


class ApprovalRequest(Base, UUIDMixin, TimestampMixin):
    """Human approval request triggered by a REQUIRE_APPROVAL governance outcome.

    Enforces approval integrity, arguments hash verification, and prevents replay.
    """

    __tablename__ = "approval_requests"

    tool_request_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("tool_requests.id", ondelete="CASCADE"), unique=True, index=True, nullable=False
    )
    organization_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("organizations.id", ondelete="CASCADE"), index=True, nullable=False
    )
    status: Mapped[ApprovalStatus] = mapped_column(
        Enum(ApprovalStatus), default=ApprovalStatus.PENDING, nullable=False, index=True
    )
    integrity_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    requested_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    reviewed_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    review_decision_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    @property
    def approver_user_id(self) -> uuid.UUID | None:
        return self.reviewed_by_user_id

    @approver_user_id.setter
    def approver_user_id(self, val: uuid.UUID | None) -> None:
        self.reviewed_by_user_id = val

    @property
    def decision_reason(self) -> str | None:
        return self.review_decision_reason

    @decision_reason.setter
    def decision_reason(self, val: str | None) -> None:
        self.review_decision_reason = val

    @property
    def decided_at(self) -> datetime | None:
        return self.reviewed_at

    @decided_at.setter
    def decided_at(self, val: datetime | None) -> None:
        self.reviewed_at = val

    tool_request: Mapped["ToolRequest"] = relationship("ToolRequest", back_populates="approval_request")
    organization = relationship("Organization")
    requested_by = relationship("User", foreign_keys=[requested_by_user_id])
    reviewed_by = relationship("User", foreign_keys=[reviewed_by_user_id])

    __table_args__ = (UniqueConstraint("tool_request_id", name="uq_approval_tool_request"),)
