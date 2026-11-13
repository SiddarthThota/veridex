"use client";

/**
 * Custom React 19 State & Fetching Hook for VERIDEX Analytics (Phase 9.3).
 *
 * Implements:
 * - Native React state & effect lifecycle (Zero external data-fetching dependencies).
 * - Automatic abort signal cancellation on filter changes and unmount.
 * - Rolling UTC intervals [start_time, end_time) aligned with backend half-open convention.
 * - Configurable, explicit auto-refresh interval with independent manual refresh.
 * - Granular loading, error, and pagination states per component area.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import type {
  OverviewAnalytics,
  TrendsAnalytics,
  RiskDistributionAnalytics,
  AgentAnalyticsResponse,
  ToolUtilizationResponse,
  AnomalyReport,
  Granularity,
} from "@/types/analytics";
import {
  fetchOverview,
  fetchTrends,
  fetchRiskDistribution,
  fetchAgentAnalytics,
  fetchToolAnalytics,
  fetchAnomalies,
} from "./analytics-api";

export type DatePreset = "24h" | "7d" | "30d" | "custom";

export interface DateRangeState {
  preset: DatePreset;
  startTime: string; // ISO 8601 UTC
  endTime: string; // ISO 8601 UTC
  granularity: Granularity;
}

export function computePresetRange(preset: "24h" | "7d" | "30d"): {
  startTime: string;
  endTime: string;
  granularity: Granularity;
} {
  const now = new Date();
  const end = new Date(now.getTime());
  let start: Date;
  let granularity: Granularity = "day";

  if (preset === "24h") {
    start = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    granularity = "hour";
  } else if (preset === "30d") {
    start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    granularity = "day";
  } else {
    // 7d default
    start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    granularity = "day";
  }

  return {
    startTime: start.toISOString(),
    endTime: end.toISOString(),
    granularity,
  };
}

export function useAnalyticsDashboard() {
  // 1. Filter state (Default: Rolling 7 days UTC, Day granularity)
  const initialRange = computePresetRange("7d");
  const [range, setRange] = useState<DateRangeState>({
    preset: "7d",
    startTime: initialRange.startTime,
    endTime: initialRange.endTime,
    granularity: initialRange.granularity,
  });

  // 2. Pagination state
  const [agentPage, setAgentPage] = useState(1);
  const [toolPage, setToolPage] = useState(1);

  // 3. Auto-refresh state (seconds; 0 = manual only)
  const [autoRefreshInterval, setAutoRefreshInterval] = useState<number>(0);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // 4. Data states
  const [overview, setOverview] = useState<{
    data: OverviewAnalytics | null;
    loading: boolean;
    error: string | null;
  }>({ data: null, loading: true, error: null });

  const [trends, setTrends] = useState<{
    data: TrendsAnalytics | null;
    loading: boolean;
    error: string | null;
  }>({ data: null, loading: true, error: null });

  const [risk, setRisk] = useState<{
    data: RiskDistributionAnalytics | null;
    loading: boolean;
    error: string | null;
  }>({ data: null, loading: true, error: null });

  const [agents, setAgents] = useState<{
    data: AgentAnalyticsResponse | null;
    loading: boolean;
    error: string | null;
  }>({ data: null, loading: true, error: null });

  const [tools, setTools] = useState<{
    data: ToolUtilizationResponse | null;
    loading: boolean;
    error: string | null;
  }>({ data: null, loading: true, error: null });

  const [anomalies, setAnomalies] = useState<{
    data: AnomalyReport | null;
    loading: boolean;
    error: string | null;
  }>({ data: null, loading: true, error: null });

  // Reference to abort controller for current in-flight batch
  const abortControllerRef = useRef<AbortController | null>(null);

  // Effect-driven data fetching (React 19 compliant async IIFE)
  useEffect(() => {
    let isMounted = true;
    const controller = new AbortController();
    abortControllerRef.current = controller;

    (async () => {
      try {
        const [oRes, tRes, rRes, aRes, tlRes, anRes] = await Promise.allSettled([
          fetchOverview(range.startTime, range.endTime, controller.signal),
          fetchTrends(range.startTime, range.endTime, range.granularity, controller.signal),
          fetchRiskDistribution(range.startTime, range.endTime, controller.signal),
          fetchAgentAnalytics(range.startTime, range.endTime, agentPage, 10, controller.signal),
          fetchToolAnalytics(range.startTime, range.endTime, toolPage, 10, controller.signal),
          fetchAnomalies(undefined, controller.signal),
        ]);

        if (!isMounted || controller.signal.aborted) return;

        if (oRes.status === "fulfilled") {
          setOverview({ data: oRes.value, loading: false, error: null });
        } else {
          setOverview({
            data: null,
            loading: false,
            error: oRes.reason instanceof Error ? oRes.reason.message : "Failed to load overview",
          });
        }

        if (tRes.status === "fulfilled") {
          setTrends({ data: tRes.value, loading: false, error: null });
        } else {
          setTrends({
            data: null,
            loading: false,
            error: tRes.reason instanceof Error ? tRes.reason.message : "Failed to load trends",
          });
        }

        if (rRes.status === "fulfilled") {
          setRisk({ data: rRes.value, loading: false, error: null });
        } else {
          setRisk({
            data: null,
            loading: false,
            error: rRes.reason instanceof Error ? rRes.reason.message : "Failed to load risk",
          });
        }

        if (aRes.status === "fulfilled") {
          setAgents({ data: aRes.value, loading: false, error: null });
        } else {
          setAgents({
            data: null,
            loading: false,
            error: aRes.reason instanceof Error ? aRes.reason.message : "Failed to load agents",
          });
        }

        if (tlRes.status === "fulfilled") {
          setTools({ data: tlRes.value, loading: false, error: null });
        } else {
          setTools({
            data: null,
            loading: false,
            error: tlRes.reason instanceof Error ? tlRes.reason.message : "Failed to load tools",
          });
        }

        if (anRes.status === "fulfilled") {
          setAnomalies({ data: anRes.value, loading: false, error: null });
        } else {
          setAnomalies({
            data: null,
            loading: false,
            error: anRes.reason instanceof Error ? anRes.reason.message : "Failed to load anomalies",
          });
        }

        setLastUpdated(new Date());
      } catch {
        // Ignored on abort
      }
    })();

    return () => {
      isMounted = false;
      controller.abort();
    };
  }, [range.startTime, range.endTime, range.granularity, agentPage, toolPage]);

  // Periodic auto-refresh timer (conservative, explicit UI control)
  useEffect(() => {
    if (autoRefreshInterval <= 0) return;

    const timer = setInterval(() => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      const controller = new AbortController();
      abortControllerRef.current = controller;
      setIsRefreshing(true);

      void Promise.allSettled([
        fetchOverview(range.startTime, range.endTime, controller.signal).then((data) =>
          setOverview({ data, loading: false, error: null })
        ),
        fetchTrends(range.startTime, range.endTime, range.granularity, controller.signal).then(
          (data) => setTrends({ data, loading: false, error: null })
        ),
        fetchRiskDistribution(range.startTime, range.endTime, controller.signal).then((data) =>
          setRisk({ data, loading: false, error: null })
        ),
        fetchAgentAnalytics(range.startTime, range.endTime, agentPage, 10, controller.signal).then(
          (data) => setAgents({ data, loading: false, error: null })
        ),
        fetchToolAnalytics(range.startTime, range.endTime, toolPage, 10, controller.signal).then(
          (data) => setTools({ data, loading: false, error: null })
        ),
        fetchAnomalies(undefined, controller.signal).then((data) =>
          setAnomalies({ data, loading: false, error: null })
        ),
      ]).then(() => {
        if (!controller.signal.aborted) {
          setLastUpdated(new Date());
          setIsRefreshing(false);
        }
      });
    }, autoRefreshInterval * 1000);

    return () => clearInterval(timer);
  }, [autoRefreshInterval, range, agentPage, toolPage]);

  // Manual refresh handler
  const refreshAll = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;
    setIsRefreshing(true);

    void Promise.allSettled([
      fetchOverview(range.startTime, range.endTime, controller.signal).then((data) =>
        setOverview({ data, loading: false, error: null })
      ),
      fetchTrends(range.startTime, range.endTime, range.granularity, controller.signal).then(
        (data) => setTrends({ data, loading: false, error: null })
      ),
      fetchRiskDistribution(range.startTime, range.endTime, controller.signal).then((data) =>
        setRisk({ data, loading: false, error: null })
      ),
      fetchAgentAnalytics(range.startTime, range.endTime, agentPage, 10, controller.signal).then(
        (data) => setAgents({ data, loading: false, error: null })
      ),
      fetchToolAnalytics(range.startTime, range.endTime, toolPage, 10, controller.signal).then(
        (data) => setTools({ data, loading: false, error: null })
      ),
      fetchAnomalies(undefined, controller.signal).then((data) =>
        setAnomalies({ data, loading: false, error: null })
      ),
    ]).then(() => {
      if (!controller.signal.aborted) {
        setLastUpdated(new Date());
        setIsRefreshing(false);
      }
    });
  }, [range, agentPage, toolPage]);

  // Handlers for filter updates with explicit loading state setting in event handlers
  const setPreset = useCallback((preset: "24h" | "7d" | "30d") => {
    const computed = computePresetRange(preset);
    setOverview((p) => ({ ...p, loading: true, error: null }));
    setTrends((p) => ({ ...p, loading: true, error: null }));
    setRisk((p) => ({ ...p, loading: true, error: null }));
    setAgents((p) => ({ ...p, loading: true, error: null }));
    setTools((p) => ({ ...p, loading: true, error: null }));
    setAnomalies((p) => ({ ...p, loading: true, error: null }));
    setRange({
      preset,
      startTime: computed.startTime,
      endTime: computed.endTime,
      granularity: computed.granularity,
    });
    setAgentPage(1);
    setToolPage(1);
  }, []);

  const setCustomInterval = useCallback((startIso: string, endIso: string) => {
    const start = new Date(startIso).getTime();
    const end = new Date(endIso).getTime();
    const diffDays = (end - start) / (1000 * 60 * 60 * 24);
    const granularity: Granularity = diffDays > 7 ? "day" : "hour";

    setOverview((p) => ({ ...p, loading: true, error: null }));
    setTrends((p) => ({ ...p, loading: true, error: null }));
    setRisk((p) => ({ ...p, loading: true, error: null }));
    setAgents((p) => ({ ...p, loading: true, error: null }));
    setTools((p) => ({ ...p, loading: true, error: null }));
    setAnomalies((p) => ({ ...p, loading: true, error: null }));
    setRange({
      preset: "custom",
      startTime: startIso,
      endTime: endIso,
      granularity,
    });
    setAgentPage(1);
    setToolPage(1);
  }, []);

  const setGranularity = useCallback((granularity: Granularity) => {
    setTrends((p) => ({ ...p, loading: true, error: null }));
    setRange((prev) => ({ ...prev, granularity }));
  }, []);

  const handleSetAgentPage = useCallback((p: number) => {
    setAgents((prev) => ({ ...prev, loading: true, error: null }));
    setAgentPage(p);
  }, []);

  const handleSetToolPage = useCallback((p: number) => {
    setTools((prev) => ({ ...prev, loading: true, error: null }));
    setToolPage(p);
  }, []);

  return {
    range,
    setPreset,
    setCustomInterval,
    setGranularity,
    agentPage,
    setAgentPage: handleSetAgentPage,
    toolPage,
    setToolPage: handleSetToolPage,
    autoRefreshInterval,
    setAutoRefreshInterval,
    lastUpdated,
    isRefreshing,
    refreshAll,
    overview,
    trends,
    risk,
    agents,
    tools,
    anomalies,
  };
}
