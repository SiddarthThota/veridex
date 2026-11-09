"""Pydantic schemas and DTOs for Policy Engine (Phase 6)."""

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from app.policies.models import (
    PolicyAction,
    PolicyStatus,
    PolicyType,
    PolicyVersionStatus,
)


class TargetScopeSchema(BaseModel):
    """Scoping criteria defining when a rule applies."""

    agent_ids: list[str] = Field(default_factory=list)
    agent_environments: list[str] = Field(default_factory=list)
    agent_risk_tiers: list[str] = Field(default_factory=list)
    tool_ids: list[str] = Field(default_factory=list)
    tool_risk_levels: list[str] = Field(default_factory=list)
    tool_access_types: list[str] = Field(default_factory=list)
    tool_data_classifications: list[str] = Field(default_factory=list)


class PolicyRuleCreate(BaseModel):
    """Payload to create a new rule inside a DRAFT PolicyVersion."""

    rule_name: str = Field(min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=1000)
    rule_order: int = Field(default=1, ge=1)
    action: PolicyAction = Field(default=PolicyAction.DENY)
    violation_code: str = Field(default="POLICY_VIOLATION", max_length=100)
    remediation_message: str | None = Field(default=None, max_length=1000)
    target_scope: TargetScopeSchema = Field(default_factory=TargetScopeSchema)
    condition_tree: dict[str, Any] = Field(default_factory=dict)
    is_enabled: bool = True


class PolicyRuleUpdate(BaseModel):
    """Payload to update an existing rule in a DRAFT PolicyVersion."""

    rule_name: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=1000)
    rule_order: int | None = Field(default=None, ge=1)
    action: PolicyAction | None = None
    violation_code: str | None = Field(default=None, max_length=100)
    remediation_message: str | None = Field(default=None, max_length=1000)
    target_scope: TargetScopeSchema | None = None
    condition_tree: dict[str, Any] | None = None
    is_enabled: bool | None = None


class PolicyRuleResponse(BaseModel):
    """Full detail of a PolicyRule."""

    id: uuid.UUID
    policy_version_id: uuid.UUID
    rule_name: str
    description: str | None = None
    rule_order: int
    action: PolicyAction
    violation_code: str
    remediation_message: str | None = None
    target_scope: dict[str, Any]
    condition_tree: dict[str, Any]
    is_enabled: bool
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class PolicyVersionCreate(BaseModel):
    """Payload to branch a new DRAFT version from an existing policy."""

    changelog: str | None = Field(default=None, max_length=1000)


class PolicyVersionResponse(BaseModel):
    """Full detail of a PolicyVersion snapshot and its immutable rules."""

    id: uuid.UUID
    policy_id: uuid.UUID
    version_number: int
    status: PolicyVersionStatus
    changelog: str | None = None
    published_by_user_id: uuid.UUID | None = None
    published_at: datetime | None = None
    created_at: datetime
    rules: list[PolicyRuleResponse] = Field(default_factory=list)

    model_config = ConfigDict(from_attributes=True)


class PolicyCreate(BaseModel):
    """Payload to create a new Policy container with initial DRAFT v1 version."""

    name: str = Field(min_length=1, max_length=255)
    slug: str | None = Field(default=None, max_length=255)
    description: str | None = Field(default=None, max_length=1000)
    policy_type: PolicyType = Field(default=PolicyType.SECURITY)
    priority: int = Field(default=100, ge=1, le=10000)
    default_action: PolicyAction = Field(default=PolicyAction.DENY)
    initial_rules: list[PolicyRuleCreate] = Field(default_factory=list)


class PolicyUpdate(BaseModel):
    """Payload to update metadata and priority of a Policy container."""

    name: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=1000)
    policy_type: PolicyType | None = None
    priority: int | None = Field(default=None, ge=1, le=10000)
    default_action: PolicyAction | None = None


class PolicyStatusUpdate(BaseModel):
    """Payload to transition lifecycle status of a Policy container."""

    status: PolicyStatus


class PolicyResponse(BaseModel):
    """Full representation of a Policy container."""

    id: uuid.UUID
    organization_id: uuid.UUID
    name: str
    slug: str
    description: str | None = None
    policy_type: PolicyType
    status: PolicyStatus
    priority: int
    default_action: PolicyAction
    current_version_id: uuid.UUID | None = None
    created_at: datetime
    updated_at: datetime
    current_version: PolicyVersionResponse | None = None

    model_config = ConfigDict(from_attributes=True)


class PolicyListResponse(BaseModel):
    """Paginated list of Policy records."""

    items: list[PolicyResponse]
    total: int


class MatchedRuleTrace(BaseModel):
    """Telemetry trace for a matched rule during evaluation or simulation."""

    rule_id: uuid.UUID
    rule_name: str
    action: PolicyAction
    violation_code: str
    remediation_message: str | None = None


class MatchedPolicyTrace(BaseModel):
    """Telemetry trace for a matched policy during evaluation or simulation."""

    policy_id: uuid.UUID
    policy_slug: str
    policy_version_id: uuid.UUID
    version_number: int
    matched_rules: list[MatchedRuleTrace] = Field(default_factory=list)


class PolicySimulateRequest(BaseModel):
    """Payload to dry-run evaluate policies against a hypothetical tool invocation."""

    agent_id: uuid.UUID
    tool_id: uuid.UUID
    tool_version_id: uuid.UUID
    arguments: dict[str, Any] = Field(default_factory=dict)
    environment: str = Field(default="DEVELOPMENT", max_length=50)


class PolicySimulateResponse(BaseModel):
    """Outcome of a policy simulation."""

    decision: PolicyAction
    violation_codes: list[str] = Field(default_factory=list)
    remediation_messages: list[str] = Field(default_factory=list)
    matched_policies: list[MatchedPolicyTrace] = Field(default_factory=list)
    simulated_at: datetime
