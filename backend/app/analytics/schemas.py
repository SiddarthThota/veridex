"""Pydantic v2 schemas for the Veridex Governance Analytics Engine (Phase 8.3)."""

import enum
import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class Granularity(enum.StrEnum):
    """Supported time-series aggregation granularities."""

    HOUR = "hour"
    DAY = "day"


class AnomalyType(enum.StrEnum):
    """Classification of governance anomaly detectors."""

    DENIAL_RATE_SPIKE = "DENIAL_RATE_SPIKE"
    CRITICAL_RISK_SURGE = "CRITICAL_RISK_SURGE"
    LATENCY_SLA_DEGRADATION = "LATENCY_SLA_DEGRADATION"


class AnomalySeverity(enum.StrEnum):
    """Severity classification of detected anomalies."""

    INFO = "INFO"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    CRITICAL = "CRITICAL"


class AnomalyStatus(enum.StrEnum):
    """Evaluation status of an anomaly detector rule."""

    TRIGGERED = "TRIGGERED"
    NORMAL = "NORMAL"
    INSUFFICIENT_DATA = "INSUFFICIENT_DATA"


class PaginationMeta(BaseModel):
    """Pagination metadata for paginated analytics responses."""

    model_config = ConfigDict(frozen=True)

    page: int = Field(ge=1, description="Current 1-based page number")
    page_size: int = Field(ge=1, le=100, description="Items per page")
    total_items: int = Field(ge=0, description="Total matching items across all pages")
    total_pages: int = Field(ge=0, description="Total available pages")


class OverviewAnalytics(BaseModel):
    """High-level volumetric and rate analytics across governance invocations."""

    model_config = ConfigDict(frozen=True)

    total_invocations: int = Field(ge=0)
    allow_count: int = Field(ge=0)
    deny_count: int = Field(ge=0)
    require_approval_count: int = Field(ge=0)

    allow_percentage: float = Field(ge=0.0, le=100.0)
    deny_percentage: float = Field(ge=0.0, le=100.0)
    require_approval_percentage: float = Field(ge=0.0, le=100.0)

    total_tool_executions: int = Field(ge=0)

    total_approvals: int = Field(ge=0)
    approved_approvals: int = Field(ge=0)
    rejected_approvals: int = Field(ge=0)
    pending_approvals: int = Field(ge=0)
    expired_approvals: int = Field(ge=0)
    approval_resolution_rate: float | None = Field(
        default=None,
        ge=0.0,
        le=1.0,
        description="approved / (approved + rejected); null when denominator is zero",
    )

    start_time: datetime
    end_time: datetime


class TrendBucket(BaseModel):
    """Discrete time-series bucket containing aggregated governance metrics."""

    model_config = ConfigDict(frozen=True)

    timestamp: datetime = Field(description="UTC timestamp representing the start of this interval")
    total_invocations: int = Field(ge=0)
    allow_count: int = Field(ge=0)
    deny_count: int = Field(ge=0)
    require_approval_count: int = Field(ge=0)
    tool_executions_count: int = Field(ge=0)
    risk_assessments_count: int = Field(ge=0)


class TrendsAnalytics(BaseModel):
    """Time-series trend aggregation for governance throughput and outcomes."""

    model_config = ConfigDict(frozen=True)

    granularity: Granularity
    buckets: list[TrendBucket]
    start_time: datetime
    end_time: datetime


class RiskHistogramBucket(BaseModel):
    """Discrete bucket within the risk score distribution histogram."""

    model_config = ConfigDict(frozen=True)

    range_label: str = Field(description="Bucket label e.g. [0,10) or [90,100]")
    min_score: int = Field(ge=0, le=100)
    max_score: int = Field(ge=0, le=100)
    count: int = Field(ge=0)


class RiskDistributionAnalytics(BaseModel):
    """Aggregate risk score statistics and bucketed distribution."""

    model_config = ConfigDict(frozen=True)

    total_assessments: int = Field(ge=0)
    low_count: int = Field(ge=0)
    medium_count: int = Field(ge=0)
    high_count: int = Field(ge=0)
    critical_count: int = Field(ge=0)

    average_risk_score: float | None = Field(default=None, ge=0.0, le=100.0)
    min_risk_score: int | None = Field(default=None, ge=0, le=100)
    max_risk_score: int | None = Field(default=None, ge=0, le=100)

    histogram: list[RiskHistogramBucket]
    start_time: datetime
    end_time: datetime


class AgentAnalyticsItem(BaseModel):
    """Per-agent invocation volume, denial rate, and latency metrics."""

    model_config = ConfigDict(frozen=True)

    agent_id: uuid.UUID
    agent_name: str
    agent_environment: str

    total_invocations: int = Field(ge=0)
    allow_count: int = Field(ge=0)
    deny_count: int = Field(ge=0)
    require_approval_count: int = Field(ge=0)

    historical_denial_rate: float | None = Field(
        default=None,
        ge=0.0,
        le=1.0,
        description="DENY decisions / total invocations in interval; null if total_invocations is 0",
    )
    risk_distribution: dict[str, int] = Field(description="Count of assessments by RiskLevel")
    total_tool_executions: int = Field(ge=0)
    avg_evaluation_duration_ms: float | None = Field(default=None, ge=0.0)

    calculated_trust_score: float | None = Field(default=None, ge=0.0, le=100.0)
    profile_violation_rate: float | None = Field(
        default=None,
        ge=0.0,
        le=1.0,
        description="Empirical violation rate from AgentRiskProfile (distinct from historical denial rate)",
    )
    history_status: str | None = None


class AgentAnalyticsResponse(BaseModel):
    """Paginated agent governance analytics response."""

    model_config = ConfigDict(frozen=True)

    items: list[AgentAnalyticsItem]
    pagination: PaginationMeta
    start_time: datetime
    end_time: datetime


class ToolUtilizationItem(BaseModel):
    """Per-tool invocation, execution success, and latency statistics."""

    model_config = ConfigDict(frozen=True)

    tool_id: uuid.UUID
    tool_name: str
    tool_slug: str

    invocation_count: int = Field(ge=0)
    allow_count: int = Field(ge=0)
    deny_count: int = Field(ge=0)
    require_approval_count: int = Field(ge=0)

    execution_count: int = Field(ge=0)
    execution_success_count: int = Field(ge=0)
    execution_failed_count: int = Field(ge=0)
    execution_timeout_count: int = Field(ge=0)

    avg_evaluation_duration_ms: float | None = Field(default=None, ge=0.0)
    avg_execution_duration_ms: float | None = Field(default=None, ge=0.0)
    risk_distribution: dict[str, int] = Field(description="Count of assessments by RiskLevel")


class ToolUtilizationResponse(BaseModel):
    """Paginated tool utilization analytics response."""

    model_config = ConfigDict(frozen=True)

    items: list[ToolUtilizationItem]
    pagination: PaginationMeta
    start_time: datetime
    end_time: datetime


class LatencyMetricStats(BaseModel):
    """Statistical summary for latency measurements."""

    model_config = ConfigDict(frozen=True)

    count: int = Field(ge=0)
    avg: float | None = Field(default=None, ge=0.0)
    min: float | None = Field(default=None, ge=0.0)
    max: float | None = Field(default=None, ge=0.0)
    p50: float | None = Field(default=None, ge=0.0)
    p95: float | None = Field(default=None, ge=0.0)
    p99: float | None = Field(default=None, ge=0.0)


class LatencyAnalyticsResponse(BaseModel):
    """Evaluation latency (governance overhead) and tool execution latency statistics."""

    model_config = ConfigDict(frozen=True)

    evaluation_latency: LatencyMetricStats
    execution_latency: LatencyMetricStats
    start_time: datetime
    end_time: datetime


class HeuristicFrequencyItem(BaseModel):
    """Aggregate frequency count and average contribution for a matched heuristic rule."""

    model_config = ConfigDict(frozen=True)

    rule_id: str
    count: int = Field(ge=0)
    severity: str
    avg_score_contribution: float | None = Field(default=None, ge=0.0)


class HeuristicFrequencyResponse(BaseModel):
    """Historical frequency of matched risk heuristics."""

    model_config = ConfigDict(frozen=True)

    items: list[HeuristicFrequencyItem]
    total_matches: int = Field(ge=0)
    start_time: datetime
    end_time: datetime


class AnomalyFinding(BaseModel):
    """Structured informational finding from an anomaly detection rule."""

    model_config = ConfigDict(frozen=True)

    anomaly_type: AnomalyType
    severity: AnomalySeverity
    status: AnomalyStatus
    current_value: float | None = None
    baseline_value: float | None = None
    threshold: float | None = None
    current_samples: int = Field(ge=0)
    baseline_samples: int | None = Field(default=None, ge=0)
    explanation: str
    evaluated_at: datetime


class AnomalyReport(BaseModel):
    """Consolidated read-only anomaly evaluation report for an organization."""

    model_config = ConfigDict(frozen=True)

    organization_id: uuid.UUID
    evaluated_at: datetime
    findings: list[AnomalyFinding]
