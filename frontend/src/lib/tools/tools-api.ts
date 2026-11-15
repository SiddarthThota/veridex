/**
 * Typed BFF Client for VERIDEX Governed Tool Catalog (Phase 9.6).
 *
 * All operations communicate strictly via same-origin Next.js BFF routes:
 * - /api/bff/tools/*
 *
 * Never calls FastAPI directly. Session and CSRF credentials managed server-side.
 */

import type {
  ToolCreate,
  ToolListResponse,
  ToolResponse,
  ToolUpdate,
  ToolVersionCreate,
  ToolVersionResponse,
} from "@/types/tools";

export class ToolApiError extends Error {
  status: number;
  detail: string;

  constructor(message: string, status: number, detail?: string) {
    super(message);
    this.name = "ToolApiError";
    this.status = status;
    this.detail = detail || message;
  }
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (res.status === 401) {
    throw new ToolApiError("Session expired or unauthorized.", 401);
  }

  if (res.status === 403) {
    const errorBody = await res.json().catch(() => ({}));
    const detail = errorBody.detail || errorBody.error || "You do not have permission to perform this action.";
    throw new ToolApiError(detail, 403, detail);
  }

  if (res.status === 404) {
    const errorBody = await res.json().catch(() => ({}));
    const detail = errorBody.detail || errorBody.error || "Tool resource not found.";
    throw new ToolApiError(detail, 404, detail);
  }

  if (res.status === 409) {
    const errorBody = await res.json().catch(() => ({}));
    const detail = errorBody.detail || errorBody.error || "Conflict: Resource state or version conflict.";
    throw new ToolApiError(detail, 409, detail);
  }

  if (res.status === 422) {
    const errorBody = await res.json().catch(() => ({}));
    const detail =
      Array.isArray(errorBody.detail)
        ? errorBody.detail.map((d: { msg: string }) => d.msg).join(", ")
        : errorBody.detail || "Validation error.";
    throw new ToolApiError(detail, 422, detail);
  }

  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}));
    const detail = errorBody.detail || errorBody.error || `HTTP error ${res.status}`;
    throw new ToolApiError(detail, res.status, detail);
  }

  return res.json() as Promise<T>;
}

export async function fetchTools(skip = 0, limit = 100): Promise<ToolListResponse> {
  const params = new URLSearchParams({
    skip: String(Math.max(0, skip)),
    limit: String(Math.min(1000, Math.max(1, limit))),
  });

  const res = await fetch(`/api/bff/tools?${params.toString()}`, {
    method: "GET",
    headers: { Accept: "application/json" },
  });

  return handleResponse<ToolListResponse>(res);
}

export async function fetchTool(id: string): Promise<ToolResponse> {
  const res = await fetch(`/api/bff/tools/${encodeURIComponent(id)}`, {
    method: "GET",
    headers: { Accept: "application/json" },
  });

  return handleResponse<ToolResponse>(res);
}

export async function createTool(payload: ToolCreate): Promise<ToolResponse> {
  const res = await fetch("/api/bff/tools", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(payload),
  });

  return handleResponse<ToolResponse>(res);
}

export async function updateTool(id: string, payload: ToolUpdate): Promise<ToolResponse> {
  const res = await fetch(`/api/bff/tools/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(payload),
  });

  return handleResponse<ToolResponse>(res);
}

export async function activateTool(id: string): Promise<ToolResponse> {
  const res = await fetch(`/api/bff/tools/${encodeURIComponent(id)}/activate`, {
    method: "POST",
    headers: { Accept: "application/json" },
  });

  return handleResponse<ToolResponse>(res);
}

export async function suspendTool(id: string): Promise<ToolResponse> {
  const res = await fetch(`/api/bff/tools/${encodeURIComponent(id)}/suspend`, {
    method: "POST",
    headers: { Accept: "application/json" },
  });

  return handleResponse<ToolResponse>(res);
}

export async function deactivateTool(id: string): Promise<ToolResponse> {
  const res = await fetch(`/api/bff/tools/${encodeURIComponent(id)}/deactivate`, {
    method: "POST",
    headers: { Accept: "application/json" },
  });

  return handleResponse<ToolResponse>(res);
}

export async function fetchToolVersions(id: string): Promise<ToolVersionResponse[]> {
  const res = await fetch(`/api/bff/tools/${encodeURIComponent(id)}/versions`, {
    method: "GET",
    headers: { Accept: "application/json" },
  });

  return handleResponse<ToolVersionResponse[]>(res);
}

export async function fetchToolVersion(toolId: string, versionId: string): Promise<ToolVersionResponse> {
  const res = await fetch(`/api/bff/tools/${encodeURIComponent(toolId)}/versions/${encodeURIComponent(versionId)}`, {
    method: "GET",
    headers: { Accept: "application/json" },
  });

  return handleResponse<ToolVersionResponse>(res);
}

export async function createToolVersion(toolId: string, payload: ToolVersionCreate): Promise<ToolVersionResponse> {
  const res = await fetch(`/api/bff/tools/${encodeURIComponent(toolId)}/versions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(payload),
  });

  return handleResponse<ToolVersionResponse>(res);
}

export async function publishToolVersion(toolId: string, versionId: string): Promise<ToolVersionResponse> {
  const res = await fetch(
    `/api/bff/tools/${encodeURIComponent(toolId)}/versions/${encodeURIComponent(versionId)}/publish`,
    {
      method: "POST",
      headers: { Accept: "application/json" },
    }
  );

  return handleResponse<ToolVersionResponse>(res);
}
