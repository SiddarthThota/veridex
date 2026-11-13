/**
 * TypeScript Type Definitions for VERIDEX Approvals & Governance Gateway (Phase 9.4).
 *
 * Strictly matched against FastAPI backend contracts (v0.8.0):
 * - backend/app/governance/models.py
 * - backend/app/governance/schemas.py
 */

export type ApprovalStatus = "PENDING" | "APPROVED" | "REJECTED" | "EXPIRED";

export type GovernanceDecision = "ALLOW" | "DENY" | "REQUIRE_APPROVAL";

export type ExecutionStatus = "PENDING" | "RUNNING" | "SUCCESS" | "FAILED" | "TIMED_OUT";

/** Telemetry and outcome record for an executed tool invocation */
export interface ToolExecutionResponse {
  id: string;
  tool_request_id: string;
  status: ExecutionStatus;
  result: unknown | null;
  error_message: string | null;
  duration_ms: number | null;
  executed_at: string | null;
}

/** ToolRequest representation embedded in an ApprovalRequest record */
export interface ToolRequestInApprovalResponse {
  id: string;
  run_id: string;
  organization_id: string;
  agent_id: string;
  tool_id: string;
  tool_version_id: string;
  decision: GovernanceDecision;
  violation_codes: string[];
  arguments_hash: string;
  arguments: Record<string, unknown>;
  idempotency_key: string | null;
  policy_evaluations: Record<string, unknown> | null;
  risk_assessment_id: string | null;
  evaluation_duration_ms: number | null;
  created_at: string;
  execution: ToolExecutionResponse | null;
}

/** Full detail of an ApprovalRequest record */
export interface ApprovalRequestResponse {
  id: string;
  organization_id: string;
  tool_request_id: string;
  status: ApprovalStatus;
  approver_user_id: string | null;
  integrity_hash: string;
  decision_reason: string | null;
  decided_at: string | null;
  created_at: string;
  updated_at: string;
  tool_request: ToolRequestInApprovalResponse | null;
}

/** Paginated list of approval requests from GET /api/v1/governance/approvals */
export interface ApprovalRequestListResponse {
  items: ApprovalRequestResponse[];
  total: number;
}

/** Payload submitted when deciding an approval request */
export interface ApprovalDecisionRequest {
  decision: "APPROVED" | "REJECTED";
  reason: string | null;
}

/** Supported query parameters for listing approvals */
export interface ApprovalListQueryParams {
  status?: ApprovalStatus;
  limit?: number;
  offset?: number;
}

/** Resolved entity metadata for human-friendly displays */
export interface EntityMetadata {
  id: string;
  name: string;
  slug?: string;
  risk_tier?: string;
  description?: string;
}

/** Immutable risk assessment summary when risk_assessment_id is present */
export interface RiskAssessmentSummary {
  id: string;
  risk_score: number;
  risk_level: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  subscore_tool?: number;
  subscore_data?: number;
  subscore_agent?: number;
  subscore_context?: number;
  factor_breakdown?: Record<string, unknown>;
  explanation?: string | null;
}
