/**
 * Typed Analytics API Client for VERIDEX SecOps Dashboard (Phase 9.3).
 *
 * Interfaces strictly with same-origin Next.js BFF routes (/api/bff/analytics/*).
 * All requests inherit session authentication and server-side Bearer token injection.
 * Tenant scope is strictly derived from the authenticated session (no organization_id query parameter).
 */

import type {
  OverviewAnalytics,
  TrendsAnalytics,
  RiskDistributionAnalytics,
  AgentAnalyticsResponse,
  ToolUtilizationResponse,
  AnomalyReport,
  Granularity,
} from "@/types/analytics";

export class AnalyticsApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "AnalyticsApiError";
    this.status = status;
  }
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (res.status === 401) {
    throw new AnalyticsApiError("Session expired or unauthorized.", 401);
  }

  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}));
    const message =
      errorBody.detail || errorBody.error || `Analytics request failed with status ${res.status}`;
    throw new AnalyticsApiError(message, res.status);
  }

  return res.json() as Promise<T>;
}

/** Fetches high-level volumetric counts, decision rates, and approval statistics */
export async function fetchOverview(
  startTime?: string,
  endTime?: string,
  signal?: AbortSignal
): Promise<OverviewAnalytics> {
  const params = new URLSearchParams();
  if (startTime) params.set("start_time", startTime);
  if (endTime) params.set("end_time", endTime);

  const query = params.toString() ? `?${params.toString()}` : "";
  const res = await fetch(`/api/bff/analytics/overview${query}`, {
    headers: { Accept: "application/json" },
    signal,
    cache: "no-store",
  });

  return handleResponse<OverviewAnalytics>(res);
}

/** Fetches time-series trend aggregations for throughput, decisions, and risk */
export async function fetchTrends(
  startTime?: string,
  endTime?: string,
  granularity: Granularity = "day",
  signal?: AbortSignal
): Promise<TrendsAnalytics> {
  const params = new URLSearchParams();
  if (startTime) params.set("start_time", startTime);
  if (endTime) params.set("end_time", endTime);
  params.set("granularity", granularity);

  const query = `?${params.toString()}`;
  const res = await fetch(`/api/bff/analytics/trends${query}`, {
    headers: { Accept: "application/json" },
    signal,
    cache: "no-store",
  });

  return handleResponse<TrendsAnalytics>(res);
}

/** Fetches aggregate risk score statistics and 10-bucket risk histogram */
export async function fetchRiskDistribution(
  startTime?: string,
  endTime?: string,
  signal?: AbortSignal
): Promise<RiskDistributionAnalytics> {
  const params = new URLSearchParams();
  if (startTime) params.set("start_time", startTime);
  if (endTime) params.set("end_time", endTime);

  const query = params.toString() ? `?${params.toString()}` : "";
  const res = await fetch(`/api/bff/analytics/risk-distribution${query}`, {
    headers: { Accept: "application/json" },
    signal,
    cache: "no-store",
  });

  return handleResponse<RiskDistributionAnalytics>(res);
}

/** Fetches paginated agent activity, historical denial rates, and average durations */
export async function fetchAgentAnalytics(
  startTime?: string,
  endTime?: string,
  page = 1,
  pageSize = 10,
  signal?: AbortSignal
): Promise<AgentAnalyticsResponse> {
  const params = new URLSearchParams();
  if (startTime) params.set("start_time", startTime);
  if (endTime) params.set("end_time", endTime);
  params.set("page", String(Math.max(1, page)));
  params.set("page_size", String(Math.min(100, Math.max(1, pageSize))));

  const query = `?${params.toString()}`;
  const res = await fetch(`/api/bff/analytics/agents${query}`, {
    headers: { Accept: "application/json" },
    signal,
    cache: "no-store",
  });

  return handleResponse<AgentAnalyticsResponse>(res);
}

/** Fetches paginated tool utilization, execution successes/failures, and latencies */
export async function fetchToolAnalytics(
  startTime?: string,
  endTime?: string,
  page = 1,
  pageSize = 10,
  signal?: AbortSignal
): Promise<ToolUtilizationResponse> {
  const params = new URLSearchParams();
  if (startTime) params.set("start_time", startTime);
  if (endTime) params.set("end_time", endTime);
  params.set("page", String(Math.max(1, page)));
  params.set("page_size", String(Math.min(100, Math.max(1, pageSize))));

  const query = `?${params.toString()}`;
  const res = await fetch(`/api/bff/analytics/tools${query}`, {
    headers: { Accept: "application/json" },
    signal,
    cache: "no-store",
  });

  return handleResponse<ToolUtilizationResponse>(res);
}

/** Fetches read-only sliding window anomaly detection findings */
export async function fetchAnomalies(
  evaluationTime?: string,
  signal?: AbortSignal
): Promise<AnomalyReport> {
  const params = new URLSearchParams();
  if (evaluationTime) params.set("evaluation_time", evaluationTime);

  const query = params.toString() ? `?${params.toString()}` : "";
  const res = await fetch(`/api/bff/analytics/anomalies${query}`, {
    headers: { Accept: "application/json" },
    signal,
    cache: "no-store",
  });

  return handleResponse<AnomalyReport>(res);
}
