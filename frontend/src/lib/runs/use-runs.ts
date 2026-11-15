/**
 * Custom React Hook for Managing VERIDEX Execution Forensics (Phase 9.6).
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  AgentRunCreate,
  AgentRunResponse,
  AgentRunStatusUpdate,
  RunStatus,
  ToolInvocationRequest,
  ToolInvocationResponse,
  ToolRequestResponse,
} from "@/types/runs";
import {
  createRun as apiCreateRun,
  fetchRun,
  fetchRunInvocations as apiFetchRunInvocations,
  fetchRuns,
  invokeTool as apiInvokeTool,
  updateRunStatus as apiUpdateRunStatus,
  RunApiError,
} from "./runs-api";

export type FilterRunStatus = "ALL" | RunStatus;

export interface UseRunsOptions {
  initialAgentId?: string;
  initialStatus?: FilterRunStatus;
  initialLimit?: number;
}

export function useRuns(options: UseRunsOptions = {}) {
  const {
    initialAgentId = "",
    initialStatus = "ALL",
    initialLimit = 50,
  } = options;

  // Filters & Pagination
  const [agentIdFilter, setAgentIdFilter] = useState<string>(initialAgentId);
  const [statusFilter, setStatusFilter] = useState<FilterRunStatus>(initialStatus);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(initialLimit);

  // Runs Directory State
  const [runs, setRuns] = useState<AgentRunResponse[]>([]);
  const [totalRuns, setTotalRuns] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Selected Run & Invocations Forensics State
  const [selectedRun, setSelectedRun] = useState<AgentRunResponse | null>(null);
  const [isRunDetailLoading, setIsRunDetailLoading] = useState(false);
  const [runDetailError, setRunDetailError] = useState<string | null>(null);

  const [invocations, setInvocations] = useState<ToolRequestResponse[]>([]);
  const [totalInvocations, setTotalInvocations] = useState(0);
  const [isInvocationsLoading, setIsInvocationsLoading] = useState(false);

  const isMounted = useRef(true);
  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  // Fetch paginated runs
  const loadRuns = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const offset = page * pageSize;
      const res = await fetchRuns({
        agent_id: agentIdFilter.trim() || undefined,
        status: statusFilter === "ALL" ? undefined : statusFilter,
        limit: pageSize,
        offset,
      });

      if (isMounted.current) {
        setRuns(res.items);
        setTotalRuns(res.total);
      }
    } catch (err) {
      if (isMounted.current) {
        const msg = err instanceof RunApiError ? err.detail : "Failed to load execution runs";
        setError(msg);
      }
    } finally {
      if (isMounted.current) {
        setIsLoading(false);
      }
    }
  }, [agentIdFilter, statusFilter, page, pageSize]);

  useEffect(() => {
    let ignore = false;
    async function execute() {
      try {
        const offset = page * pageSize;
        const res = await fetchRuns({
          agent_id: agentIdFilter.trim() || undefined,
          status: statusFilter === "ALL" ? undefined : statusFilter,
          limit: pageSize,
          offset,
        });

        if (!ignore) {
          setRuns(res.items);
          setTotalRuns(res.total);
          setError(null);
        }
      } catch (err) {
        if (!ignore) {
          const msg = err instanceof RunApiError ? err.detail : "Failed to load execution runs";
          setError(msg);
        }
      } finally {
        if (!ignore) {
          setIsLoading(false);
        }
      }
    }

    execute();
    return () => {
      ignore = true;
    };
  }, [agentIdFilter, statusFilter, page, pageSize]);

  // Load single run and its invocations timeline
  const selectRun = useCallback(async (runOrId: AgentRunResponse | string | null) => {
    if (!runOrId) {
      setSelectedRun(null);
      setInvocations([]);
      setTotalInvocations(0);
      return;
    }

    const runId = typeof runOrId === "string" ? runOrId : runOrId.id;
    setIsRunDetailLoading(true);
    setIsInvocationsLoading(true);
    setRunDetailError(null);

    if (typeof runOrId !== "string") {
      setSelectedRun(runOrId);
    }

    try {
      const [runRes, invocationsRes] = await Promise.all([
        typeof runOrId === "string" ? fetchRun(runId) : Promise.resolve(runOrId),
        apiFetchRunInvocations(runId, 100, 0).catch(() => ({ items: [], total: 0 })),
      ]);

      if (isMounted.current) {
        setSelectedRun(runRes);
        setInvocations(invocationsRes.items);
        setTotalInvocations(invocationsRes.total);
      }
    } catch (err) {
      if (isMounted.current) {
        const msg = err instanceof RunApiError ? err.detail : "Failed to load run forensics";
        setRunDetailError(msg);
      }
    } finally {
      if (isMounted.current) {
        setIsRunDetailLoading(false);
        setIsInvocationsLoading(false);
      }
    }
  }, []);

  // Reload invocations for selected run
  const reloadInvocations = useCallback(async () => {
    if (!selectedRun) return;
    setIsInvocationsLoading(true);
    try {
      const res = await apiFetchRunInvocations(selectedRun.id, 100, 0);
      if (isMounted.current) {
        setInvocations(res.items);
        setTotalInvocations(res.total);
      }
    } catch (err) {
      console.error("Failed to reload invocations:", err);
    } finally {
      if (isMounted.current) {
        setIsInvocationsLoading(false);
      }
    }
  }, [selectedRun]);

  // Run Mutations
  const createRun = useCallback(
    async (payload: AgentRunCreate) => {
      const newRun = await apiCreateRun(payload);
      await loadRuns();
      return newRun;
    },
    [loadRuns]
  );

  const updateRun = useCallback(
    async (id: string, payload: AgentRunStatusUpdate) => {
      const updated = await apiUpdateRunStatus(id, payload);
      if (selectedRun && selectedRun.id === id) {
        setSelectedRun(updated);
      }
      await loadRuns();
      return updated;
    },
    [loadRuns, selectedRun]
  );

  const invokeToolInRun = useCallback(
    async (runId: string, payload: ToolInvocationRequest): Promise<ToolInvocationResponse> => {
      const res = await apiInvokeTool(runId, payload);
      await reloadInvocations();
      return res;
    },
    [reloadInvocations]
  );

  return {
    runs,
    totalRuns,
    isLoading,
    error,
    refresh: loadRuns,

    // Filters
    agentIdFilter,
    setAgentIdFilter,
    statusFilter,
    setStatusFilter,
    page,
    setPage,
    pageSize,
    setPageSize,

    // Selected Run & Invocations
    selectedRun,
    selectRun,
    isRunDetailLoading,
    runDetailError,
    invocations,
    totalInvocations,
    isInvocationsLoading,
    reloadInvocations,

    // Operations
    createRun,
    updateRun,
    invokeToolInRun,
  };
}
