/**
 * Typed BFF Client for VERIDEX Approvals Workbench (Phase 9.4).
 *
 * All operations communicate strictly via same-origin Next.js BFF routes:
 * - GET  /api/bff/governance/approvals
 * - GET  /api/bff/governance/approvals/{id}
 * - POST /api/bff/governance/approvals/{id}/decide
 *
 * Never calls FastAPI directly. Session and CSRF credentials managed server-side.
 */

import type {
  ApprovalDecisionRequest,
  ApprovalListQueryParams,
  ApprovalRequestListResponse,
  ApprovalRequestResponse,
  EntityMetadata,
  RiskAssessmentSummary,
} from "@/types/approvals";

export class ApprovalApiError extends Error {
  status: number;
  detail: string;

  constructor(message: string, status: number, detail?: string) {
    super(message);
    this.name = "ApprovalApiError";
    this.status = status;
    this.detail = detail || message;
  }
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (res.status === 401) {
    throw new ApprovalApiError("Session expired or unauthorized.", 401);
  }

  if (res.status === 403) {
    const errorBody = await res.json().catch(() => ({}));
    const detail = errorBody.detail || "You do not have permission to perform this action.";
    throw new ApprovalApiError(detail, 403, detail);
  }

  if (res.status === 404) {
    const errorBody = await res.json().catch(() => ({}));
    const detail = errorBody.detail || "Approval request not found.";
    throw new ApprovalApiError(detail, 404, detail);
  }

  if (res.status === 409) {
    const errorBody = await res.json().catch(() => ({}));
    const detail = errorBody.detail || "Approval decision conflict: Request was already decided or integrity failed.";
    throw new ApprovalApiError(detail, 409, detail);
  }

  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}));
    const message =
      errorBody.detail || errorBody.error || `Request failed with status ${res.status}`;
    throw new ApprovalApiError(message, res.status, typeof errorBody.detail === "string" ? errorBody.detail : message);
  }

  return res.json() as Promise<T>;
}

/** Fetches paginated approvals list with optional status filter */
export async function fetchApprovals(
  params?: ApprovalListQueryParams,
  signal?: AbortSignal
): Promise<ApprovalRequestListResponse> {
  const q = new URLSearchParams();
  if (params?.status) {
    q.set("status", params.status);
  }
  if (params?.limit !== undefined) {
    const safeLimit = Math.min(100, Math.max(1, params.limit));
    q.set("limit", String(safeLimit));
  }
  if (params?.offset !== undefined) {
    const safeOffset = Math.max(0, params.offset);
    q.set("offset", String(safeOffset));
  }

  const query = q.toString() ? `?${q.toString()}` : "";
  const res = await fetch(`/api/bff/governance/approvals${query}`, {
    headers: { Accept: "application/json" },
    signal,
    cache: "no-store",
  });

  return handleResponse<ApprovalRequestListResponse>(res);
}

/** Fetches full detail for a specific approval request */
export async function fetchApprovalDetail(
  approvalId: string,
  signal?: AbortSignal
): Promise<ApprovalRequestResponse> {
  const res = await fetch(`/api/bff/governance/approvals/${encodeURIComponent(approvalId)}`, {
    headers: { Accept: "application/json" },
    signal,
    cache: "no-store",
  });

  return handleResponse<ApprovalRequestResponse>(res);
}

/** Submits an approval or rejection decision with mandatory rationale */
export async function submitApprovalDecision(
  approvalId: string,
  payload: ApprovalDecisionRequest,
  signal?: AbortSignal
): Promise<ApprovalRequestResponse> {
  const res = await fetch(
    `/api/bff/governance/approvals/${encodeURIComponent(approvalId)}/decide`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "X-Veridex-Request": "1",
      },
      body: JSON.stringify({
        decision: payload.decision,
        reason: payload.reason,
      }),
      signal,
    }
  );

  return handleResponse<ApprovalRequestResponse>(res);
}

// In-memory lookup caches to avoid duplicate network roundtrips
const agentCache = new Map<string, EntityMetadata>();
const toolCache = new Map<string, EntityMetadata>();
const riskCache = new Map<string, RiskAssessmentSummary>();

/** Resolves agent metadata from BFF /api/bff/agents/{id} */
export async function resolveAgentMetadata(
  agentId: string,
  signal?: AbortSignal
): Promise<EntityMetadata | null> {
  if (agentCache.has(agentId)) {
    return agentCache.get(agentId) || null;
  }
  try {
    const res = await fetch(`/api/bff/agents/${encodeURIComponent(agentId)}`, {
      headers: { Accept: "application/json" },
      signal,
    });
    if (!res.ok) return null;
    const data = await res.json();
    const meta: EntityMetadata = {
      id: data.id,
      name: data.name || "Agent",
      slug: data.slug,
      risk_tier: data.risk_tier,
      description: data.description,
    };
    agentCache.set(agentId, meta);
    return meta;
  } catch {
    return null;
  }
}

/** Resolves tool metadata from BFF /api/bff/tools/{id} */
export async function resolveToolMetadata(
  toolId: string,
  signal?: AbortSignal
): Promise<EntityMetadata | null> {
  if (toolCache.has(toolId)) {
    return toolCache.get(toolId) || null;
  }
  try {
    const res = await fetch(`/api/bff/tools/${encodeURIComponent(toolId)}`, {
      headers: { Accept: "application/json" },
      signal,
    });
    if (!res.ok) return null;
    const data = await res.json();
    const meta: EntityMetadata = {
      id: data.id,
      name: data.name || "Tool",
      slug: data.slug,
      description: data.description,
    };
    toolCache.set(toolId, meta);
    return meta;
  } catch {
    return null;
  }
}

/** Resolves risk assessment details if risk_assessment_id is provided */
export async function resolveRiskAssessment(
  assessmentId: string,
  signal?: AbortSignal
): Promise<RiskAssessmentSummary | null> {
  if (riskCache.has(assessmentId)) {
    return riskCache.get(assessmentId) || null;
  }
  try {
    const res = await fetch(`/api/bff/risk/assessments/${encodeURIComponent(assessmentId)}`, {
      headers: { Accept: "application/json" },
      signal,
    });
    if (!res.ok) return null;
    const data = await res.json();
    const summary: RiskAssessmentSummary = {
      id: data.id,
      risk_score: data.risk_score,
      risk_level: data.risk_level,
      subscore_tool: data.subscore_tool,
      subscore_data: data.subscore_data,
      subscore_agent: data.subscore_agent,
      subscore_context: data.subscore_context,
      factor_breakdown: data.factor_breakdown,
      explanation: data.explanation,
    };
    riskCache.set(assessmentId, summary);
    return summary;
  } catch {
    return null;
  }
}

