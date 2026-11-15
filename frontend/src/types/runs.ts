/**
 * Execution Forensics & Telemetry Types for VERIDEX (Phase 9.6).
 *
 * Aligned strictly with FastAPI v0.8.0 schemas in backend/app/governance/schemas.py.
 */

export type RunStatus = "PENDING" | "RUNNING" | "COMPLETED" | "FAILED" | "CANCELLED";

export type GovernanceDecision = "ALLOW" | "DENY" | "REQUIRE_APPROVAL";

export type ExecutionStatus = "PENDING" | "RUNNING" | "SUCCESS" | "FAILED" | "TIMED_OUT";

export type ApprovalStatus = "PENDING" | "APPROVED" | "REJECTED" | "EXPIRED";

export interface AgentRunCreate {
  agent_id: string; // UUID
  agent_version_id?: string | null; // UUID
  environment?: string; // defaults to "production"
  trace_id?: string | null;
  input_prompt?: string | null;
}

export interface AgentRunStatusUpdate {
  status: RunStatus;
  output_summary?: string | null;
  error_message?: string | null;
}

export interface AgentRunResponse {
  id: string; // UUID
  organization_id: string; // UUID
  agent_id: string; // UUID
  agent_version_id?: string | null; // UUID
  user_id: string; // UUID
  status: RunStatus;
  environment: string;
  trace_id?: string | null;
  input_prompt?: string | null;
  output_summary?: string | null;
  error_message?: string | null;
  started_at: string; // ISO datetime
  completed_at?: string | null; // ISO datetime
  created_at: string; // ISO datetime
  updated_at: string; // ISO datetime
}

export interface AgentRunListResponse {
  items: AgentRunResponse[];
  total: number;
}

export interface ToolExecutionResponse {
  id: string; // UUID
  tool_request_id: string; // UUID
  status: ExecutionStatus;
  result?: unknown | null;
  error_message?: string | null;
  duration_ms?: number | null;
  executed_at?: string | null; // ISO datetime
}

export interface ApprovalRequestSummaryResponse {
  id: string; // UUID
  status: ApprovalStatus;
  approver_user_id?: string | null; // UUID
  decision_reason?: string | null;
  decided_at?: string | null; // ISO datetime
}

export interface ToolRequestResponse {
  id: string; // UUID
  run_id: string; // UUID
  organization_id: string; // UUID
  agent_id: string; // UUID
  tool_id: string; // UUID
  tool_version_id: string; // UUID
  decision: GovernanceDecision;
  violation_codes: string[];
  arguments_hash: string;
  arguments: Record<string, unknown>;
  idempotency_key?: string | null;
  policy_evaluations?: Record<string, unknown> | null;
  risk_assessment_id?: string | null; // UUID
  evaluation_duration_ms?: number | null;
  created_at: string; // ISO datetime
  execution?: ToolExecutionResponse | null;
  approval_request?: ApprovalRequestSummaryResponse | null;
}

export interface ToolRequestListResponse {
  items: ToolRequestResponse[];
  total: number;
}

export interface ToolInvocationRequest {
  agent_id: string; // UUID
  tool_id: string; // UUID
  tool_version_id: string; // UUID
  arguments?: Record<string, unknown>;
  idempotency_key?: string | null;
}

export interface ToolInvocationResponse {
  run_id: string; // UUID
  tool_request_id: string; // UUID
  decision: GovernanceDecision;
  violation_codes: string[];
  reason?: string | null;
  arguments_hash: string;
  execution_status?: ExecutionStatus | null;
  result?: unknown | null;
  error_message?: string | null;
  approval_request_id?: string | null; // UUID
  idempotency_key?: string | null;
  evaluation_duration_ms?: number | null;
}
