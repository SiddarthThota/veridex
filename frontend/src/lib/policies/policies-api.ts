/**
 * Typed BFF Client for VERIDEX Policy Engine (Phase 9.5).
 *
 * All operations communicate strictly via same-origin Next.js BFF routes:
 * - /api/bff/policies/*
 *
 * Never calls FastAPI directly. Session and CSRF credentials managed server-side.
 */

import type {
  PolicyCreate,
  PolicyListQueryParams,
  PolicyListResponse,
  PolicyResponse,
  PolicyRuleCreate,
  PolicyRuleResponse,
  PolicyRuleUpdate,
  PolicySimulateRequest,
  PolicySimulateResponse,
  PolicyStatus,
  PolicyUpdate,
  PolicyVersionResponse,
} from "@/types/policies";

export class PolicyApiError extends Error {
  status: number;
  detail: string;

  constructor(message: string, status: number, detail?: string) {
    super(message);
    this.name = "PolicyApiError";
    this.status = status;
    this.detail = detail || message;
  }
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (res.status === 401) {
    throw new PolicyApiError("Session expired or unauthorized.", 401);
  }

  if (res.status === 403) {
    const errorBody = await res.json().catch(() => ({}));
    const detail = errorBody.detail || errorBody.error || "You do not have permission to perform this action.";
    throw new PolicyApiError(detail, 403, detail);
  }

  if (res.status === 404) {
    const errorBody = await res.json().catch(() => ({}));
    const detail = errorBody.detail || errorBody.error || "Resource not found.";
    throw new PolicyApiError(detail, 404, detail);
  }

  if (res.status === 409) {
    const errorBody = await res.json().catch(() => ({}));
    const detail =
      errorBody.detail || errorBody.error || "Version conflict: Published policy versions are immutable.";
    throw new PolicyApiError(detail, 409, detail);
  }

  if (res.status === 422) {
    const errorBody = await res.json().catch(() => ({}));
    const detail =
      typeof errorBody.detail === "string"
        ? errorBody.detail
        : Array.isArray(errorBody.detail)
        ? errorBody.detail.map((e: { msg?: string; loc?: string[] }) => e.msg || JSON.stringify(e)).join("; ")
        : "Unprocessable validation error in policy payload or AST condition tree.";
    throw new PolicyApiError(detail, 422, detail);
  }

  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}));
    const message = errorBody.detail || errorBody.error || `Request failed with status ${res.status}`;
    throw new PolicyApiError(message, res.status, typeof errorBody.detail === "string" ? errorBody.detail : message);
  }

  if (res.status === 204) {
    return undefined as unknown as T;
  }

  return res.json() as Promise<T>;
}

/** Fetches paginated policies list with type and status filters */
export async function fetchPolicies(
  params?: PolicyListQueryParams,
  signal?: AbortSignal
): Promise<PolicyListResponse> {
  const q = new URLSearchParams();
  if (params?.policy_type) {
    q.set("type", params.policy_type);
  }
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
  const res = await fetch(`/api/bff/policies${query}`, {
    headers: { Accept: "application/json" },
    signal,
    cache: "no-store",
  });

  return handleResponse<PolicyListResponse>(res);
}

/** Fetches full detail of a specific policy */
export async function fetchPolicy(
  policyId: string,
  signal?: AbortSignal
): Promise<PolicyResponse> {
  const res = await fetch(`/api/bff/policies/${encodeURIComponent(policyId)}`, {
    headers: { Accept: "application/json" },
    signal,
    cache: "no-store",
  });

  return handleResponse<PolicyResponse>(res);
}

/** Creates a new Policy container with initial v1 DRAFT version */
export async function createPolicy(payload: PolicyCreate): Promise<PolicyResponse> {
  const res = await fetch("/api/bff/policies", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(payload),
  });

  return handleResponse<PolicyResponse>(res);
}

/** Updates policy container metadata and priority (supports PUT or PATCH) */
export async function updatePolicy(
  policyId: string,
  payload: PolicyUpdate,
  method: "PUT" | "PATCH" = "PATCH"
): Promise<PolicyResponse> {
  const res = await fetch(`/api/bff/policies/${encodeURIComponent(policyId)}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(payload),
  });

  return handleResponse<PolicyResponse>(res);
}

/** Transitions lifecycle status of a Policy container */
export async function updatePolicyStatus(
  policyId: string,
  newStatus: PolicyStatus
): Promise<PolicyResponse> {
  const res = await fetch(
    `/api/bff/policies/${encodeURIComponent(policyId)}/status?new_status=${encodeURIComponent(newStatus)}`,
    {
      method: "PATCH",
      headers: { Accept: "application/json" },
    }
  );

  return handleResponse<PolicyResponse>(res);
}

/** Soft-deletes a policy container (transitions status to ARCHIVED) */
export async function archivePolicy(policyId: string): Promise<void> {
  const res = await fetch(`/api/bff/policies/${encodeURIComponent(policyId)}`, {
    method: "DELETE",
    headers: { Accept: "application/json" },
  });

  return handleResponse<void>(res);
}

/** Branches a new DRAFT version from an existing policy, cloning current rules */
export async function branchPolicyVersion(
  policyId: string,
  changelog?: string
): Promise<PolicyVersionResponse> {
  const res = await fetch(`/api/bff/policies/${encodeURIComponent(policyId)}/versions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ changelog: changelog || null }),
  });

  return handleResponse<PolicyVersionResponse>(res);
}

/** Lists all historical versions of a policy */
export async function fetchPolicyVersions(
  policyId: string,
  signal?: AbortSignal
): Promise<PolicyVersionResponse[]> {
  const res = await fetch(`/api/bff/policies/${encodeURIComponent(policyId)}/versions`, {
    headers: { Accept: "application/json" },
    signal,
    cache: "no-store",
  });

  return handleResponse<PolicyVersionResponse[]>(res);
}

/** Retrieves detail of a specific policy version snapshot */
export async function fetchPolicyVersion(
  policyId: string,
  versionId: string,
  signal?: AbortSignal
): Promise<PolicyVersionResponse> {
  const res = await fetch(
    `/api/bff/policies/${encodeURIComponent(policyId)}/versions/${encodeURIComponent(versionId)}`,
    {
      headers: { Accept: "application/json" },
      signal,
      cache: "no-store",
    }
  );

  return handleResponse<PolicyVersionResponse>(res);
}

/** Publishes a DRAFT version: validates ASTs, freezes as PUBLISHED, and activates */
export async function publishPolicyVersion(
  policyId: string,
  versionId: string
): Promise<PolicyVersionResponse> {
  const res = await fetch(
    `/api/bff/policies/${encodeURIComponent(policyId)}/versions/${encodeURIComponent(versionId)}/publish`,
    {
      method: "POST",
      headers: { Accept: "application/json" },
    }
  );

  return handleResponse<PolicyVersionResponse>(res);
}

/** Adds a rule to a DRAFT policy version (returns 409 if version is published) */
export async function createPolicyRule(
  policyId: string,
  versionId: string,
  payload: PolicyRuleCreate
): Promise<PolicyRuleResponse> {
  const res = await fetch(
    `/api/bff/policies/${encodeURIComponent(policyId)}/versions/${encodeURIComponent(versionId)}/rules`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(payload),
    }
  );

  return handleResponse<PolicyRuleResponse>(res);
}

/** Updates a rule in a DRAFT policy version (returns 409 if version is published) */
export async function updatePolicyRule(
  policyId: string,
  versionId: string,
  ruleId: string,
  payload: PolicyRuleUpdate,
  method: "PUT" | "PATCH" = "PATCH"
): Promise<PolicyRuleResponse> {
  const res = await fetch(
    `/api/bff/policies/${encodeURIComponent(policyId)}/versions/${encodeURIComponent(versionId)}/rules/${encodeURIComponent(ruleId)}`,
    {
      method,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(payload),
    }
  );

  return handleResponse<PolicyRuleResponse>(res);
}

/** Deletes a rule from a DRAFT version (returns 409 if version is published) */
export async function deletePolicyRule(
  policyId: string,
  versionId: string,
  ruleId: string
): Promise<void> {
  const res = await fetch(
    `/api/bff/policies/${encodeURIComponent(policyId)}/versions/${encodeURIComponent(versionId)}/rules/${encodeURIComponent(ruleId)}`,
    {
      method: "DELETE",
      headers: { Accept: "application/json" },
    }
  );

  return handleResponse<void>(res);
}

/** Dry-run simulates policies against hypothetical tool invocation */
export async function simulatePolicies(
  payload: PolicySimulateRequest
): Promise<PolicySimulateResponse> {
  const res = await fetch("/api/bff/policies/simulate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(payload),
  });

  return handleResponse<PolicySimulateResponse>(res);
}

