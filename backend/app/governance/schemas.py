"""Pydantic schemas for Phase 5 Governance Gateway."""

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from app.governance.models import (
    ApprovalStatus,
    ExecutionStatus,
    GovernanceDecision,
    GovernanceViolationCode,
    RunStatus,
)

# --- Agent Run Schemas ---


class AgentRunCreate(BaseModel):
    """Payload to initiate an agent run."""

    agent_id: uuid.UUID
    agent_version_id: uuid.UUID | None = None
    environment: str = Field(default="production", min_length=1, max_length=50)
    trace_id: str | None = None
    input_prompt: str | None = None


class AgentRunStatusUpdate(BaseModel):
    """Payload to update an agent run status."""

    status: RunStatus
    output_summary: str | None = None
    error_message: str | None = None


class AgentRunResponse(BaseModel):
    """Response representation of an AgentRun."""

    id: uuid.UUID
    organization_id: uuid.UUID
    agent_id: uuid.UUID
    agent_version_id: uuid.UUID | None
    user_id: uuid.UUID
    status: RunStatus
    environment: str
    trace_id: str | None
    input_prompt: str | None
    output_summary: str | None
    error_message: str | None
    started_at: datetime
    completed_at: datetime | None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class AgentRunListResponse(BaseModel):
    """Paginated list of AgentRuns."""

    items: list[AgentRunResponse]
    total: int


# --- Governance Evaluation Schemas (Dry-run Safety) ---


class GovernanceEvaluateRequest(BaseModel):
    """Dry-run governance evaluation request without execution."""

    agent_id: uuid.UUID
    tool_id: uuid.UUID
    tool_version_id: uuid.UUID
    arguments: dict[str, Any] = Field(default_factory=dict)


class GovernanceEvaluateResponse(BaseModel):
    """Evaluation result for dry-run governance verification."""

    decision: GovernanceDecision
    violation_codes: list[GovernanceViolationCode] = Field(default_factory=list)
    reason: str
    evaluated_at: datetime
    integrity_hash: str
    approval_required: bool
    tool_id: uuid.UUID
    tool_version_id: uuid.UUID


# --- Tool Invocation & Execution Schemas ---


class ToolInvocationRequest(BaseModel):
    """Request to invoke a tool within an active AgentRun."""

    agent_id: uuid.UUID
    tool_id: uuid.UUID
    tool_version_id: uuid.UUID
    arguments: dict[str, Any] = Field(default_factory=dict)
    idempotency_key: str | None = Field(default=None, max_length=255)


class ToolExecutionResponse(BaseModel):
    """Execution telemetry and result response."""

    id: uuid.UUID
    tool_request_id: uuid.UUID
    status: ExecutionStatus
    result: Any | None = None
    error_message: str | None = None
    duration_ms: int | None = None
    executed_at: datetime | None = None

    model_config = ConfigDict(from_attributes=True)


class ApprovalRequestSummaryResponse(BaseModel):
    """Compact summary of an approval request."""

    id: uuid.UUID
    status: ApprovalStatus
    approver_user_id: uuid.UUID | None = None
    decision_reason: str | None = None
    decided_at: datetime | None = None

    model_config = ConfigDict(from_attributes=True)


class ToolRequestResponse(BaseModel):
    """Full representation of a ToolRequest record."""

    id: uuid.UUID
    run_id: uuid.UUID
    organization_id: uuid.UUID
    agent_id: uuid.UUID
    tool_id: uuid.UUID
    tool_version_id: uuid.UUID
    decision: GovernanceDecision
    violation_codes: list[str] = Field(default_factory=list)
    arguments_hash: str
    arguments: dict[str, Any]
    idempotency_key: str | None = None
    created_at: datetime
    execution: ToolExecutionResponse | None = None
    approval_request: ApprovalRequestSummaryResponse | None = None

    model_config = ConfigDict(from_attributes=True)


class ToolRequestListResponse(BaseModel):
    """List of ToolRequest records."""

    items: list[ToolRequestResponse]
    total: int


class ToolInvocationResponse(BaseModel):
    """Response returned upon invoking a tool."""

    run_id: uuid.UUID
    tool_request_id: uuid.UUID
    decision: GovernanceDecision
    violation_codes: list[str] = Field(default_factory=list)
    reason: str | None = None
    arguments_hash: str
    execution_status: ExecutionStatus | None = None
    result: Any | None = None
    error_message: str | None = None
    approval_request_id: uuid.UUID | None = None
    idempotency_key: str | None = None


# --- Approval Schemas ---


class ApprovalDecisionRequest(BaseModel):
    """Decision payload submitted by an authorized approver."""

    decision: ApprovalStatus = Field(description="Must be APPROVED or REJECTED")
    reason: str | None = Field(default=None, max_length=1000)


class ToolRequestInApprovalResponse(BaseModel):
    """ToolRequest representation inside an ApprovalRequest response without circular back-reference."""

    id: uuid.UUID
    run_id: uuid.UUID
    organization_id: uuid.UUID
    agent_id: uuid.UUID
    tool_id: uuid.UUID
    tool_version_id: uuid.UUID
    decision: GovernanceDecision
    violation_codes: list[str] = Field(default_factory=list)
    arguments_hash: str
    arguments: dict[str, Any]
    idempotency_key: str | None = None
    created_at: datetime
    execution: ToolExecutionResponse | None = None

    model_config = ConfigDict(from_attributes=True)


class ApprovalRequestResponse(BaseModel):
    """Full detail of an ApprovalRequest record."""

    id: uuid.UUID
    organization_id: uuid.UUID
    tool_request_id: uuid.UUID
    status: ApprovalStatus
    approver_user_id: uuid.UUID | None = None
    integrity_hash: str
    decision_reason: str | None = None
    decided_at: datetime | None = None
    created_at: datetime
    updated_at: datetime
    tool_request: ToolRequestInApprovalResponse | None = None

    model_config = ConfigDict(from_attributes=True)


class ApprovalRequestListResponse(BaseModel):
    """List of pending or decided approval requests."""

    items: list[ApprovalRequestResponse]
    total: int
