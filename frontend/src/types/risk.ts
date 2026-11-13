/**
 * Authoritative TypeScript Type Definitions for Risk Engine (Phase 9.5).
 *
 * Mapped directly to FastAPI v0.8.0 Pydantic models in `backend/app/risk/schemas.py`.
 */

export type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export type AgentHistoryStatus = "VALID" | "INSUFFICIENT_DATA";

/** Structured record of a matched argument heuristic rule */
export interface HeuristicMatch {
  rule_id: string;
  path: string;
  severity: string;
  score_contribution: number;
}

/** 4-Vector subscores breakdown before composite weighting */
export interface SubscoresBreakdown {
  tool: number;
  data: number;
  agent: number;
  context: number;
}

/** Request payload for dry-run risk evaluation simulation */
export interface RiskEvaluateRequest {
  agent_id: string;
  tool_id: string;
  tool_version_id: string;
  arguments?: Record<string, unknown>;
  environment?: string;
}

/** Response payload for dry-run risk evaluation simulation */
export interface RiskEvaluateResponse {
  risk_score: number;
  risk_level: RiskLevel;
  subscores: SubscoresBreakdown;
  factor_breakdown: Record<string, unknown>;
  heuristics_matched: HeuristicMatch[];
  config_snapshot: Record<string, unknown>;
  explanation: string;
  scoring_algorithm_version: string;
  assessed_at: string;
  config_version_id: string | null;
}

/** Representation of an immutable historical risk assessment record */
export interface RiskAssessmentResponse {
  id: string;
  organization_id: string;
  tool_request_id: string | null;
  agent_id: string;
  tool_id: string;
  tool_version_id: string;
  config_version_id: string | null;
  scoring_algorithm_version: string;
  risk_score: number;
  risk_level: RiskLevel;
  subscore_tool: number;
  subscore_data: number;
  subscore_agent: number;
  subscore_context: number;
  factor_breakdown: Record<string, unknown>;
  heuristics_matched: HeuristicMatch[];
  config_snapshot: Record<string, unknown>;
  explanation: string | null;
  assessed_at: string;
  created_at: string;
}

/** Paginated list of historical risk assessments */
export interface RiskAssessmentListResponse {
  items: RiskAssessmentResponse[];
  total: number;
}

/** Query parameters for listing assessments */
export interface RiskAssessmentQueryParams {
  agent_id?: string;
  tool_id?: string;
  risk_level?: RiskLevel;
  start_date?: string;
  end_date?: string;
  limit?: number;
  offset?: number;
}

/** Empirical sliding-window risk metrics and calculated trust score for an agent */
export interface AgentRiskProfileResponse {
  agent_id: string;
  organization_id: string;
  risk_tier: string;
  history_status: AgentHistoryStatus;
  total_eligible_invocations: number;
  total_violations: number;
  violation_rate: number;
  calculated_trust_score: number;
  observation_window_days: number;
  last_assessed_at: string | null;
}

/** Payload to create and publish a new immutable risk configuration version */
export interface RiskConfigurationVersionCreate {
  weight_tool?: number;
  weight_data?: number;
  weight_agent?: number;
  weight_context?: number;
  threshold_medium?: number;
  threshold_high?: number;
  threshold_critical?: number;
  approval_threshold?: number;
  deny_threshold?: number;
  heuristic_rules?: Record<string, unknown>[];
  changelog?: string | null;
}

/** Immutable snapshot of risk scoring weights, thresholds, and heuristic rules */
export interface RiskConfigurationVersionResponse {
  id: string;
  risk_configuration_id: string;
  version_number: number;
  weight_tool: number;
  weight_data: number;
  weight_agent: number;
  weight_context: number;
  threshold_medium: number;
  threshold_high: number;
  threshold_critical: number;
  approval_threshold: number;
  deny_threshold: number;
  heuristic_rules: Record<string, unknown>[];
  scoring_algorithm_version: string;
  changelog: string | null;
  created_by_user_id: string | null;
  created_at: string;
}

/** Organization risk configuration container with active version details */
export interface RiskConfigurationResponse {
  id: string;
  organization_id: string;
  is_active: boolean;
  current_version_id: string | null;
  current_version: RiskConfigurationVersionResponse | null;
  created_at: string;
  updated_at: string;
}

