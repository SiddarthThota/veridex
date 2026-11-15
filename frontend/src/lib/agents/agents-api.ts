/**
 * Typed BFF Client for VERIDEX Agent Fleet Registry (Phase 9.6).
 *
 * All operations communicate strictly via same-origin Next.js BFF routes:
 * - /api/bff/agents/*
 *
 * Never calls FastAPI directly. Session and CSRF credentials managed server-side.
 */

import type {
  AgentCreate,
  AgentListResponse,
  AgentResponse,
  AgentToolPermission,
  AgentUpdate,
  AgentVersionCreate,
  AgentVersionResponse,
} from "@/types/agents";

export class AgentApiError extends Error {
  status: number;
  detail: string;

  constructor(message: string, status: number, detail?: string) {
    super(message);
    this.name = "AgentApiError";
    this.status = status;
    this.detail = detail || message;
  }
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (res.status === 401) {
    throw new AgentApiError("Session expired or unauthorized.", 401);
  }

  if (res.status === 403) {
    const errorBody = await res.json().catch(() => ({}));
    const detail = errorBody.detail || errorBody.error || "You do not have permission to perform this action.";
    throw new AgentApiError(detail, 403, detail);
  }

  if (res.status === 404) {
    const errorBody = await res.json().catch(() => ({}));
    const detail = errorBody.detail || errorBody.error || "Agent resource not found.";
    throw new AgentApiError(detail, 404, detail);
  }

  if (res.status === 409) {
    const errorBody = await res.json().catch(() => ({}));
    const detail = errorBody.detail || errorBody.error || "Conflict: Resource state or identifier conflict.";
    throw new AgentApiError(detail, 409, detail);
  }

  if (res.status === 422) {
    const errorBody = await res.json().catch(() => ({}));
    const detail =
      Array.isArray(errorBody.detail)
        ? errorBody.detail.map((d: { msg: string }) => d.msg).join(", ")
        : errorBody.detail || "Validation error.";
    throw new AgentApiError(detail, 422, detail);
  }

  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}));
    const detail = errorBody.detail || errorBody.error || `HTTP error ${res.status}`;
    throw new AgentApiError(detail, res.status, detail);
  }

  if (res.status === 204) {
    return null as unknown as T;
  }

  return res.json() as Promise<T>;
}

export async function fetchAgents(skip = 0, limit = 100): Promise<AgentListResponse> {
  const params = new URLSearchParams({
    skip: String(Math.max(0, skip)),
    limit: String(Math.min(1000, Math.max(1, limit))),
  });

  const res = await fetch(`/api/bff/agents?${params.toString()}`, {
    method: "GET",
    headers: { Accept: "application/json" },
  });

  return handleResponse<AgentListResponse>(res);
}

export async function fetchAgent(id: string): Promise<AgentResponse> {
  const res = await fetch(`/api/bff/agents/${encodeURIComponent(id)}`, {
    method: "GET",
    headers: { Accept: "application/json" },
  });

  return handleResponse<AgentResponse>(res);
}

export async function createAgent(payload: AgentCreate): Promise<AgentResponse> {
  const res = await fetch("/api/bff/agents", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(payload),
  });

  return handleResponse<AgentResponse>(res);
}

export async function updateAgent(id: string, payload: AgentUpdate): Promise<AgentResponse> {
  const res = await fetch(`/api/bff/agents/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(payload),
  });

  return handleResponse<AgentResponse>(res);
}

export async function activateAgent(id: string): Promise<AgentResponse> {
  const res = await fetch(`/api/bff/agents/${encodeURIComponent(id)}/activate`, {
    method: "POST",
    headers: { Accept: "application/json" },
  });

  return handleResponse<AgentResponse>(res);
}

export async function suspendAgent(id: string): Promise<AgentResponse> {
  const res = await fetch(`/api/bff/agents/${encodeURIComponent(id)}/suspend`, {
    method: "POST",
    headers: { Accept: "application/json" },
  });

  return handleResponse<AgentResponse>(res);
}

export async function deactivateAgent(id: string): Promise<AgentResponse> {
  const res = await fetch(`/api/bff/agents/${encodeURIComponent(id)}/deactivate`, {
    method: "POST",
    headers: { Accept: "application/json" },
  });

  return handleResponse<AgentResponse>(res);
}

export async function fetchAgentVersions(id: string): Promise<AgentVersionResponse[]> {
  const res = await fetch(`/api/bff/agents/${encodeURIComponent(id)}/versions`, {
    method: "GET",
    headers: { Accept: "application/json" },
  });

  return handleResponse<AgentVersionResponse[]>(res);
}

export async function createAgentVersion(
  id: string,
  versionString: string,
  payload: AgentVersionCreate
): Promise<AgentVersionResponse> {
  const params = new URLSearchParams({
    version_string: versionString,
  });

  const res = await fetch(`/api/bff/agents/${encodeURIComponent(id)}/versions?${params.toString()}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(payload),
  });

  return handleResponse<AgentVersionResponse>(res);
}

export async function fetchAgentTools(id: string): Promise<AgentToolPermission[]> {
  const res = await fetch(`/api/bff/agents/${encodeURIComponent(id)}/tools`, {
    method: "GET",
    headers: { Accept: "application/json" },
  });

  return handleResponse<AgentToolPermission[]>(res);
}

export async function grantAgentTool(id: string, toolId: string): Promise<{ agent_id: string; tool_id: string; allowed: boolean }> {
  const res = await fetch(`/api/bff/agents/${encodeURIComponent(id)}/tools/${encodeURIComponent(toolId)}`, {
    method: "POST",
    headers: { Accept: "application/json" },
  });

  return handleResponse<{ agent_id: string; tool_id: string; allowed: boolean }>(res);
}

export async function revokeAgentTool(id: string, toolId: string): Promise<void> {
  const res = await fetch(`/api/bff/agents/${encodeURIComponent(id)}/tools/${encodeURIComponent(toolId)}`, {
    method: "DELETE",
    headers: { Accept: "application/json" },
  });

  await handleResponse<void>(res);
}
