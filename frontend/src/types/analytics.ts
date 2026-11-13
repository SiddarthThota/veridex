/**
 * TypeScript Type Definitions for VERIDEX Governance Analytics (Phase 9.3).
 *
 * Mapped 1:1 to audited FastAPI Pydantic v2 schemas in backend/app/analytics/schemas.py:
 * - OverviewAnalytics
 * - TrendsAnalytics
 * - RiskDistributionAnalytics
 * - AgentAnalyticsResponse
 * - ToolUtilizationResponse
 * - AnomalyReport
 */

export type Granularity = "hour" | "day";

export type AnomalyType =
  | "DENIAL_RATE_SPIKE"
  | "CRITICAL_RISK_SURGE"
  | "LATENCY_SLA_DEGRADATION";

export type AnomalySeverity = "INFO" | "MEDIUM" | "HIGH" | "CRITICAL";

export type AnomalyStatus = "TRIGGERED" | "NORMAL" | "INSUFFICIENT_DATA";

export interface PaginationMeta {
  page: number;
  page_size: number;
  total_items: number;
  total_pages: number;
}

/** High-level volumetric and rate analytics across governance invocations */
export interface OverviewAnalytics {
  total_invocations: number;
  allow_count: number;
  deny_count: number;
  require_approval_count: number;

  allow_percentage: number; // 0.0 to 100.0
  deny_percentage: number; // 0.0 to 100.0
  require_approval_percentage: number; // 0.0 to 100.0

  total_tool_executions: number;

  total_approvals: number;
  approved_approvals: number;
  rejected_approvals: number;
  pending_approvals: number;
  expired_approvals: number;
  approval_resolution_rate: number | null; // approved / (approved + rejected); null when denominator is zero

  start_time: string; // ISO 8601 UTC
  end_time: string; // ISO 8601 UTC
}

/** Discrete time-series bucket containing aggregated governance metrics */
export interface TrendBucket {
  timestamp: string; // ISO 8601 UTC
  total_invocations: number;
  allow_count: number;
  deny_count: number;
  require_approval_count: number;
  tool_executions_count: number;
  risk_assessments_count: number;
}

/** Time-series trend aggregation for governance throughput and outcomes */
export interface TrendsAnalytics {
  granularity: Granularity;
  buckets: TrendBucket[];
  start_time: string;
  end_time: string;
}

/** Discrete bucket within the risk score distribution histogram */
export interface RiskHistogramBucket {
  range_label: string; // e.g. "[0,10)" or "[90,100]"
  min_score: number;
  max_score: number;
  count: number;
}

/** Aggregate risk score statistics and bucketed distribution */
export interface RiskDistributionAnalytics {
  total_assessments: number;
  low_count: number;
  medium_count: number;
  high_count: number;
  critical_count: number;

  average_risk_score: number | null;
  min_risk_score: number | null;
  max_risk_score: number | null;

  histogram: RiskHistogramBucket[];
  start_time: string;
  end_time: string;
}

/** Per-agent invocation volume, denial rate, and duration metrics */
export interface AgentAnalyticsItem {
  agent_id: string; // UUID
  agent_name: string;
  agent_environment: string;

  total_invocations: number;
  allow_count: number;
  deny_count: number;
  require_approval_count: number;

  historical_denial_rate: number | null; // 0.0 to 1.0; null if total_invocations is 0
  risk_distribution: Record<string, number>;
  total_tool_executions: number;
  avg_evaluation_duration_ms: number | null;

  calculated_trust_score: number | null;
  profile_violation_rate: number | null;
  history_status: string | null;
}

/** Paginated agent governance analytics response */
export interface AgentAnalyticsResponse {
  items: AgentAnalyticsItem[];
  pagination: PaginationMeta;
  start_time: string;
  end_time: string;
}

/** Per-tool invocation, execution success, and latency statistics */
export interface ToolUtilizationItem {
  tool_id: string; // UUID
  tool_name: string;
  tool_slug: string;

  invocation_count: number;
  allow_count: number;
  deny_count: number;
  require_approval_count: number;

  execution_count: number;
  execution_success_count: number;
  execution_failed_count: number;
  execution_timeout_count: number;

  avg_evaluation_duration_ms: number | null;
  avg_execution_duration_ms: number | null;
  risk_distribution: Record<string, number>;
}

/** Paginated tool utilization analytics response */
export interface ToolUtilizationResponse {
  items: ToolUtilizationItem[];
  pagination: PaginationMeta;
  start_time: string;
  end_time: string;
}

/** Structured informational finding from an anomaly detection rule */
export interface AnomalyFinding {
  anomaly_type: AnomalyType;
  severity: AnomalySeverity;
  status: AnomalyStatus;
  current_value: number | null;
  baseline_value: number | null;
  threshold: number | null;
  current_samples: number;
  baseline_samples: number | null;
  explanation: string;
  evaluated_at: string;
}

/** Consolidated read-only anomaly evaluation report for an organization */
export interface AnomalyReport {
  organization_id: string; // UUID
  evaluated_at: string;
  findings: AnomalyFinding[]; // Strict schema name: findings
}

/** Query parameters for analytics API requests */
export interface AnalyticsTimeFilter {
  startTime: string; // ISO UTC
  endTime: string; // ISO UTC
  granularity?: Granularity;
}

