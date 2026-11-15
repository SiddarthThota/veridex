/**
 * Typed BFF Client for VERIDEX Execution Forensics (Phase 9.6).
 *
 * All operations communicate strictly via same-origin Next.js BFF routes:
 * - /api/bff/runs/*
 * - /api/bff/governance/approvals/*
 * - /api/bff/risk/assessments/*
 *
 * Never calls FastAPI directly. Session and CSRF credentials managed server-side.
 */

import type {
  AgentRunCreate,
  AgentRunListResponse,
  AgentRunResponse,
  AgentRunStatusUpdate,
  RunStatus,
  ToolInvocationRequest,
  ToolInvocationResponse,
  ToolRequestListResponse,
} from "@/types/runs";

export class RunApiError extends Error {
  status: number;
  detail: string;

  constructor(message: string, status: number, detail?: string) {
    super(message);
    this.name = "RunApiError";
    this.status = status;
    this.detail = detail || message;
  }
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (res.status === 401) {
    throw new RunApiError("Session expired or unauthorized.", 401);
  }

  if (res.status === 403) {
    const errorBody = await res.json().catch(() => ({}));
    const detail =
      errorBody.detail ||
      errorBody.error ||
      "Forbidden: You do not have permission to access execution runs or forensic telemetry.";
    throw new RunApiError(detail, 403, detail);
  }

  if (res.status === 404) {
    const errorBody = await res.json().catch(() => ({}));
    const detail = errorBody.detail || errorBody.error || "Run or invocation record not found.";
    throw new RunApiError(detail, 404, detail);
  }

  if (res.status === 409) {
    const errorBody = await res.json().catch(() => ({}));
    const detail = errorBody.detail || errorBody.error || "Conflict: Run or invocation state conflict.";
    throw new RunApiError(detail, 409, detail);
  }

  if (res.status === 422) {
    const errorBody = await res.json().catch(() => ({}));
    const detail =
      Array.isArray(errorBody.detail)
        ? errorBody.detail.map((d: { msg: string }) => d.msg).join(", ")
        : errorBody.detail || "Validation error.";
    throw new RunApiError(detail, 422, detail);
  }

  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}));
    const detail = errorBody.detail || errorBody.error || `HTTP error ${res.status}`;
    throw new RunApiError(detail, res.status, detail);
  }

  return res.json() as Promise<T>;
}

export interface ListRunsParams {
  agent_id?: string;
  status?: RunStatus;
  limit?: number;
  offset?: number;
}

export async function fetchRuns(params: ListRunsParams = {}): Promise<AgentRunListResponse> {
  const query = new URLSearchParams();
  if (params.agent_id) query.set("agent_id", params.agent_id);
  if (params.status) query.set("status", params.status);
  query.set("limit", String(Math.min(100, Math.max(1, params.limit ?? 50))));
  query.set("offset", String(Math.max(0, params.offset ?? 0)));

  const res = await fetch(`/api/bff/runs?${query.toString()}`, {
    method: "GET",
    headers: { Accept: "application/json" },
  });

  return handleResponse<AgentRunListResponse>(res);
}

export async function fetchRun(id: string): Promise<AgentRunResponse> {
  const res = await fetch(`/api/bff/runs/${encodeURIComponent(id)}`, {
    method: "GET",
    headers: { Accept: "application/json" },
  });

  return handleResponse<AgentRunResponse>(res);
}

export async function createRun(payload: AgentRunCreate): Promise<AgentRunResponse> {
  const res = await fetch("/api/bff/runs", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(payload),
  });

  return handleResponse<AgentRunResponse>(res);
}

export async function updateRunStatus(id: string, payload: AgentRunStatusUpdate): Promise<AgentRunResponse> {
  const res = await fetch(`/api/bff/runs/${encodeURIComponent(id)}/status`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(payload),
  });

  return handleResponse<AgentRunResponse>(res);
}

export async function fetchRunInvocations(
  runId: string,
  limit = 50,
  offset = 0
): Promise<ToolRequestListResponse> {
  const params = new URLSearchParams({
    limit: String(Math.min(100, Math.max(1, limit))),
    offset: String(Math.max(0, offset)),
  });

  const res = await fetch(`/api/bff/runs/${encodeURIComponent(runId)}/invocations?${params.toString()}`, {
    method: "GET",
    headers: { Accept: "application/json" },
  });

  return handleResponse<ToolRequestListResponse>(res);
}

export async function invokeTool(runId: string, payload: ToolInvocationRequest): Promise<ToolInvocationResponse> {
  const res = await fetch(`/api/bff/runs/${encodeURIComponent(runId)}/invocations`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(payload),
  });

  return handleResponse<ToolInvocationResponse>(res);
}

export async function fetchLinkedApproval(approvalId: string): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch(`/api/bff/governance/approvals/${encodeURIComponent(approvalId)}`, {
      method: "GET",
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return null;
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export async function fetchLinkedRiskAssessment(assessmentId: string): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch(`/api/bff/risk/assessments/${encodeURIComponent(assessmentId)}`, {
      method: "GET",
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return null;
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}
