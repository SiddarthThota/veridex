"""Pydantic schemas and DTOs for Veridex Risk Engine (Phase 7)."""

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from app.risk.models import AgentHistoryStatus, RiskLevel


class HeuristicMatch(BaseModel):
    """Structured record of a matched argument heuristic rule."""

    rule_id: str
    path: str
    severity: str
    score_contribution: float


class SubscoresBreakdown(BaseModel):
    """4-Vector subscores breakdown before composite weighting."""

    tool: float = Field(ge=0.0, le=100.0)
    data: float = Field(ge=0.0, le=100.0)
    agent: float = Field(ge=0.0, le=100.0)
    context: float = Field(ge=0.0, le=100.0)


class RiskEvaluationResult(BaseModel):
    """Complete, self-contained output of a quantitative risk evaluation."""

    model_config = ConfigDict(arbitrary_types_allowed=True)

    risk_score: int = Field(ge=0, le=100)
    risk_level: RiskLevel
    subscores: SubscoresBreakdown
    factor_breakdown: dict[str, Any]
    heuristics_matched: list[HeuristicMatch] = Field(default_factory=list)
    config_snapshot: dict[str, Any] = Field(default_factory=dict)
    explanation: str
    scoring_algorithm_version: str = "1.0.0"
    assessed_at: datetime
    config_version_id: uuid.UUID | None = None


# --- Phase 7.4 REST API Request & Response Schemas ---


class RiskSimulateRequest(BaseModel):
    """Request payload for dry-run risk evaluation simulation."""

    agent_id: uuid.UUID
    tool_id: uuid.UUID
    tool_version_id: uuid.UUID
    arguments: dict[str, Any] = Field(default_factory=dict)
    environment: str = Field(default="DEVELOPMENT", max_length=50)


class RiskSimulateResponse(BaseModel):
    """Response payload for dry-run risk evaluation simulation."""

    risk_score: int = Field(ge=0, le=100)
    risk_level: RiskLevel
    subscores: SubscoresBreakdown
    factor_breakdown: dict[str, Any]
    heuristics_matched: list[HeuristicMatch] = Field(default_factory=list)
    config_snapshot: dict[str, Any] = Field(default_factory=dict)
    explanation: str
    scoring_algorithm_version: str = "1.0.0"
    assessed_at: datetime
    config_version_id: uuid.UUID | None = None


class RiskAssessmentResponse(BaseModel):
    """Representation of an immutable historical risk assessment record."""

    id: uuid.UUID
    organization_id: uuid.UUID
    tool_request_id: uuid.UUID | None = None
    agent_id: uuid.UUID
    tool_id: uuid.UUID
    tool_version_id: uuid.UUID
    config_version_id: uuid.UUID | None = None
    scoring_algorithm_version: str
    risk_score: int
    risk_level: RiskLevel
    subscore_tool: float
    subscore_data: float
    subscore_agent: float
    subscore_context: float
    factor_breakdown: dict[str, Any]
    heuristics_matched: list[dict[str, Any]] = Field(default_factory=list)
    config_snapshot: dict[str, Any] = Field(default_factory=dict)
    explanation: str | None = None
    assessed_at: datetime
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class RiskAssessmentListResponse(BaseModel):
    """Paginated list of historical risk assessments."""

    items: list[RiskAssessmentResponse]
    total: int


class AgentRiskProfileResponse(BaseModel):
    """Empirical sliding-window risk metrics and calculated trust score for an agent."""

    agent_id: uuid.UUID
    organization_id: uuid.UUID
    risk_tier: str
    history_status: AgentHistoryStatus
    total_eligible_invocations: int
    total_violations: int
    violation_rate: float
    calculated_trust_score: float
    observation_window_days: int
    last_assessed_at: datetime | None = None

    model_config = ConfigDict(from_attributes=True)


class RiskConfigurationVersionCreate(BaseModel):
    """Payload to create and publish a new immutable risk configuration version."""

    weight_tool: float = Field(default=0.35, ge=0.0, le=1.0)
    weight_data: float = Field(default=0.25, ge=0.0, le=1.0)
    weight_agent: float = Field(default=0.20, ge=0.0, le=1.0)
    weight_context: float = Field(default=0.20, ge=0.0, le=1.0)
    threshold_medium: int = Field(default=30, ge=0, le=100)
    threshold_high: int = Field(default=60, ge=0, le=100)
    threshold_critical: int = Field(default=85, ge=0, le=100)
    approval_threshold: int = Field(default=60, ge=0, le=100)
    deny_threshold: int = Field(default=90, ge=0, le=100)
    heuristic_rules: list[dict[str, Any]] = Field(default_factory=list)
    changelog: str | None = Field(default=None, max_length=1000)


class RiskConfigurationVersionResponse(BaseModel):
    """Immutable snapshot of risk scoring weights, thresholds, and heuristic rules."""

    id: uuid.UUID
    risk_configuration_id: uuid.UUID
    version_number: int
    weight_tool: float
    weight_data: float
    weight_agent: float
    weight_context: float
    threshold_medium: int
    threshold_high: int
    threshold_critical: int
    approval_threshold: int
    deny_threshold: int
    heuristic_rules: list[dict[str, Any]] = Field(default_factory=list)
    scoring_algorithm_version: str
    changelog: str | None = None
    created_by_user_id: uuid.UUID | None = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class RiskConfigurationResponse(BaseModel):
    """Organization risk configuration container with active version details."""

    id: uuid.UUID
    organization_id: uuid.UUID
    is_active: bool
    current_version_id: uuid.UUID | None = None
    current_version: RiskConfigurationVersionResponse | None = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
