/**
 * Custom React Hook for Managing VERIDEX Approvals Queue (Phase 9.4).
 *
 * Coordinates paginated fetching, status filtering, selection, auto-refresh,
 * and conflict-resilient decision submission without optimistic false positives.
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ApprovalDecisionRequest, ApprovalRequestResponse, ApprovalStatus } from "@/types/approvals";
import {
  ApprovalApiError,
  fetchApprovalDetail,
  fetchApprovals,
  submitApprovalDecision,
} from "./approvals-api";
import { sanitizeRationale } from "./approvals-formatters";

export type FilterStatus = "ALL" | ApprovalStatus;

export interface UseApprovalsOptions {
  initialStatus?: FilterStatus;
  initialPageSize?: number;
  initialAutoRefreshSeconds?: number;
}

export function useApprovals(options: UseApprovalsOptions = {}) {
  const {
    initialStatus = "PENDING",
    initialPageSize = 25,
    initialAutoRefreshSeconds = 0,
  } = options;

  const [statusFilter, setStatusFilterState] = useState<FilterStatus>(initialStatus);
  const [page, setPageState] = useState(1);
  const [pageSize, setPageSizeState] = useState(initialPageSize);
  const [autoRefreshInterval, setAutoRefreshInterval] = useState(initialAutoRefreshSeconds);

  const [items, setItems] = useState<ApprovalRequestResponse[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const [selectedApproval, setSelectedApproval] = useState<ApprovalRequestResponse | null>(null);
  const [selectedLoading, setSelectedLoading] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [decisionError, setDecisionError] = useState<string | null>(null);
  const [decisionSuccess, setDecisionSuccess] = useState<string | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const submittingRef = useRef(false);

  useEffect(() => {
    submittingRef.current = submitting;
  }, [submitting]);

  // Core list fetcher
  const loadApprovals = useCallback(
    async (showLoading = true) => {
      // Pause background polling while a decision is actively being submitted
      if (!showLoading && submittingRef.current) {
        return;
      }

      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      const controller = new AbortController();
      abortControllerRef.current = controller;

      if (showLoading) setLoading(true);
      setError(null);

      try {
        const offset = (page - 1) * pageSize;
        const queryStatus = statusFilter === "ALL" ? undefined : statusFilter;
        const data = await fetchApprovals(
          {
            status: queryStatus,
            limit: pageSize,
            offset,
          },
          controller.signal
        );

        // Guard: do not overwrite newer decision state if submission occurred concurrently
        if (!showLoading && submittingRef.current) {
          return;
        }

        setItems(data.items);
        setTotal(data.total);
        setLastUpdated(new Date());
      } catch (err: unknown) {
        if (err instanceof Error && err.name === "AbortError") return;
        const msg = err instanceof ApprovalApiError ? err.detail : "Failed to load approval requests.";
        setError(msg);
      } finally {
        if (showLoading) setLoading(false);
      }
    },
    [page, pageSize, statusFilter]
  );

  // Auto-refresh cadence manager
  useEffect(() => {
    let isMounted = true;

    (async () => {
      if (isMounted) {
        await loadApprovals(true);
      }
    })();

    if (autoRefreshInterval > 0) {
      timerRef.current = setInterval(() => {
        if (!submittingRef.current) {
          loadApprovals(false);
        }
      }, autoRefreshInterval * 1000);
    }

    return () => {
      isMounted = false;
      if (timerRef.current) clearInterval(timerRef.current);
      if (abortControllerRef.current) abortControllerRef.current.abort();
    };
  }, [loadApprovals, autoRefreshInterval]);

  // Status filter handler
  const setStatusFilter = useCallback((status: FilterStatus) => {
    setStatusFilterState(status);
    setPageState(1);
    setSelectedApproval(null);
  }, []);

  // Pagination handler
  const setPage = useCallback((newPage: number) => {
    setPageState(Math.max(1, newPage));
  }, []);

  const setPageSize = useCallback((newSize: number) => {
    setPageSizeState(Math.min(100, Math.max(1, newSize)));
    setPageState(1);
  }, []);

  // Selection handler (loads detail if needed)
  const selectApproval = useCallback(async (approval: ApprovalRequestResponse | string | null) => {
    setDecisionError(null);
    setDecisionSuccess(null);

    if (!approval) {
      setSelectedApproval(null);
      return;
    }

    if (typeof approval === "object") {
      setSelectedApproval(approval);
      return;
    }

    setSelectedLoading(true);
    try {
      const detail = await fetchApprovalDetail(approval);
      setSelectedApproval(detail);
    } catch (err: unknown) {
      const msg = err instanceof ApprovalApiError ? err.detail : "Failed to load approval details.";
      setDecisionError(msg);
    } finally {
      setSelectedLoading(false);
    }
  }, []);

  // Decision submission (Approve / Reject)
  const submitDecision = useCallback(
    async (decision: "APPROVED" | "REJECTED", rawReason: string): Promise<boolean> => {
      if (!selectedApproval) return false;

      const sanitizedReason = sanitizeRationale(rawReason);
      if (sanitizedReason.length < 5) {
        setDecisionError("An audit rationale of at least 5 characters is required.");
        return false;
      }
      if (sanitizedReason.length > 1000) {
        setDecisionError("Rationale exceeds maximum limit of 1000 characters.");
        return false;
      }

      setSubmitting(true);
      setDecisionError(null);
      setDecisionSuccess(null);

      const payload: ApprovalDecisionRequest = {
        decision,
        reason: sanitizedReason,
      };

      try {
        const updated = await submitApprovalDecision(selectedApproval.id, payload);

        // Update selected approval
        setSelectedApproval(updated);

        // Update item in current list view
        setItems((prev) =>
          prev.map((item) => (item.id === updated.id ? updated : item))
        );

        const outcomeText =
          decision === "APPROVED"
            ? updated.tool_request?.execution?.status
              ? `Request approved. Execution completed with status: ${updated.tool_request.execution.status}.`
              : "Request approved and execution initiated."
            : "Request rejected.";

        setDecisionSuccess(outcomeText);

        // Refresh list in background to sync counters
        loadApprovals(false);
        return true;
      } catch (err: unknown) {
        if (err instanceof ApprovalApiError) {
          if (err.status === 409) {
            setDecisionError(
              `Decision Conflict: ${err.detail} Refreshing latest state from server...`
            );
            // Immediately re-fetch to synchronize state
            try {
              const latest = await fetchApprovalDetail(selectedApproval.id);
              setSelectedApproval(latest);
              setItems((prev) =>
                prev.map((item) => (item.id === latest.id ? latest : item))
              );
            } catch {
              // ignore detail refresh error
            }
          } else {
            setDecisionError(err.detail);
          }
        } else {
          setDecisionError(
            err instanceof Error ? err.message : "Network communication error. Decision not confirmed."
          );
        }
        return false;
      } finally {
        setSubmitting(false);
      }
    },
    [selectedApproval, loadApprovals]
  );

  const clearDecisionState = useCallback(() => {
    setDecisionError(null);
    setDecisionSuccess(null);
  }, []);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return {
    items,
    total,
    totalPages,
    page,
    pageSize,
    statusFilter,
    loading,
    error,
    lastUpdated,
    selectedApproval,
    selectedLoading,
    submitting,
    decisionError,
    decisionSuccess,
    autoRefreshInterval,
    // Operations
    setStatusFilter,
    setPage,
    setPageSize,
    setAutoRefreshInterval,
    selectApproval,
    submitDecision,
    clearDecisionState,
    refresh: () => loadApprovals(true),
  };
}

