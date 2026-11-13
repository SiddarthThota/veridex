/**
 * Typed BFF Client for VERIDEX Risk Engine (Phase 9.5).
 *
 * All operations communicate strictly via same-origin Next.js BFF routes:
 * - /api/bff/risk/*
 * - /api/bff/agents
 * - /api/bff/tools
 *
 * Never calls FastAPI directly. Session and CSRF credentials managed server-side.
 */

import type {
  AgentRiskProfileResponse,
  RiskAssessmentListResponse,
  RiskAssessmentQueryParams,
  RiskAssessmentResponse,
  RiskConfigurationResponse,
  RiskConfigurationVersionCreate,
  RiskConfigurationVersionResponse,
  RiskEvaluateRequest,
  RiskEvaluateResponse,
} from "@/types/risk";
import type { AgentListResponse, ToolListResponse, ToolVersionSummary } from "@/types/entities";

export class RiskApiError extends Error {
  status: number;
  detail: string;

  constructor(message: string, status: number, detail?: string) {
    super(message);
    this.name = "RiskApiError";
    this.status = status;
    this.detail = detail || message;
  }
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (res.status === 401) {
    throw new RiskApiError("Session expired or unauthorized.", 401);
  }

  if (res.status === 403) {
    const errorBody = await res.json().catch(() => ({}));
    const detail = errorBody.detail || errorBody.error || "You do not have permission to perform this action.";
    throw new RiskApiError(detail, 403, detail);
  }

  if (res.status === 404) {
    const errorBody = await res.json().catch(() => ({}));
    const detail = errorBody.detail || errorBody.error || "Resource not found.";
    throw new RiskApiError(detail, 404, detail);
  }

  if (res.status === 422) {
    const errorBody = await res.json().catch(() => ({}));
    const detail =
      typeof errorBody.detail === "string"
        ? errorBody.detail
        : Array.isArray(errorBody.detail)
        ? errorBody.detail.map((e: { msg?: string; loc?: string[] }) => e.msg || JSON.stringify(e)).join("; ")
        : "Unprocessable validation error in risk parameters or payload.";
    throw new RiskApiError(detail, 422, detail);
  }

  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}));
    const message = errorBody.detail || errorBody.error || `Request failed with status ${res.status}`;
    throw new RiskApiError(message, res.status, typeof errorBody.detail === "string" ? errorBody.detail : message);
  }

  return res.json() as Promise<T>;
}

/** Lists historical risk assessments with filtering and pagination */
export async function fetchRiskAssessments(
  params?: RiskAssessmentQueryParams,
  signal?: AbortSignal
): Promise<RiskAssessmentListResponse> {
  const q = new URLSearchParams();
  if (params?.agent_id) q.set("agent_id", params.agent_id);
  if (params?.tool_id) q.set("tool_id", params.tool_id);
  if (params?.risk_level) q.set("risk_level", params.risk_level);
  if (params?.start_date) q.set("start_date", params.start_date);
  if (params?.end_date) q.set("end_date", params.end_date);
  if (params?.limit !== undefined) {
    const safeLimit = Math.min(100, Math.max(1, params.limit));
    q.set("limit", String(safeLimit));
  }
  if (params?.offset !== undefined) {
    const safeOffset = Math.max(0, params.offset);
    q.set("offset", String(safeOffset));
  }

  const query = q.toString() ? `?${q.toString()}` : "";
  const res = await fetch(`/api/bff/risk/assessments${query}`, {
    headers: { Accept: "application/json" },
    signal,
    cache: "no-store",
  });

  return handleResponse<RiskAssessmentListResponse>(res);
}

/** Retrieves an immutable historical risk assessment record by ID */
export async function fetchRiskAssessment(
  assessmentId: string,
  signal?: AbortSignal
): Promise<RiskAssessmentResponse> {
  const res = await fetch(`/api/bff/risk/assessments/${encodeURIComponent(assessmentId)}`, {
    headers: { Accept: "application/json" },
    signal,
    cache: "no-store",
  });

  return handleResponse<RiskAssessmentResponse>(res);
}

/** Executes dry-run risk evaluation simulation without persisting records */
export async function evaluateRisk(
  payload: RiskEvaluateRequest
): Promise<RiskEvaluateResponse> {
  const res = await fetch("/api/bff/risk/evaluate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(payload),
  });

  return handleResponse<RiskEvaluateResponse>(res);
}

/** Retrieves the empirical risk profile and trust metrics for an agent */
export async function fetchAgentRiskProfile(
  agentId: string,
  signal?: AbortSignal
): Promise<AgentRiskProfileResponse> {
  const res = await fetch(`/api/bff/risk/profiles/agents/${encodeURIComponent(agentId)}`, {
    headers: { Accept: "application/json" },
    signal,
    cache: "no-store",
  });

  return handleResponse<AgentRiskProfileResponse>(res);
}

/** Retrieves the active risk configuration and version for the organization */
export async function fetchActiveRiskConfig(
  signal?: AbortSignal
): Promise<RiskConfigurationResponse> {
  const res = await fetch("/api/bff/risk/config", {
    headers: { Accept: "application/json" },
    signal,
    cache: "no-store",
  });

  return handleResponse<RiskConfigurationResponse>(res);
}

/** Publishes a new immutable risk configuration version for the organization */
export async function publishRiskConfigVersion(
  payload: RiskConfigurationVersionCreate
): Promise<RiskConfigurationVersionResponse> {
  const res = await fetch("/api/bff/risk/config/versions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(payload),
  });

  return handleResponse<RiskConfigurationVersionResponse>(res);
}

// --- Entity Helpers for Simulation Selectors & Agent Registry ---

/** Retrieves registered agents list for selectors and profile grid */
export async function fetchAgentsList(
  skip = 0,
  limit = 20,
  signal?: AbortSignal
): Promise<AgentListResponse> {
  const safeLimit = Math.min(100, Math.max(1, limit));
  const safeSkip = Math.max(0, skip);
  const res = await fetch(`/api/bff/agents?skip=${safeSkip}&limit=${safeLimit}`, {
    headers: { Accept: "application/json" },
    signal,
    cache: "no-store",
  });

  return handleResponse<AgentListResponse>(res);
}

/** Retrieves registered tools list for selectors */
export async function fetchToolsList(
  skip = 0,
  limit = 100,
  signal?: AbortSignal
): Promise<ToolListResponse> {
  const safeLimit = Math.min(100, Math.max(1, limit));
  const safeSkip = Math.max(0, skip);
  const res = await fetch(`/api/bff/tools?skip=${safeSkip}&limit=${safeLimit}`, {
    headers: { Accept: "application/json" },
    signal,
    cache: "no-store",
  });

  return handleResponse<ToolListResponse>(res);
}

/** Retrieves versions for a specific tool */
export async function fetchToolVersionsList(
  toolId: string,
  signal?: AbortSignal
): Promise<ToolVersionSummary[]> {
  const res = await fetch(`/api/bff/tools/${encodeURIComponent(toolId)}/versions`, {
    headers: { Accept: "application/json" },
    signal,
    cache: "no-store",
  });

  return handleResponse<ToolVersionSummary[]>(res);
}

