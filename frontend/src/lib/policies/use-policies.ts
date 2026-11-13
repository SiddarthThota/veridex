/**
 * Custom React Hook for Managing VERIDEX Governance Policies (Phase 9.5).
 *
 * Coordinates policy registry listing, version branching and inspection,
 * draft rule authoring with immutability guards, and dry-run simulation.
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  PolicyCreate,
  PolicyResponse,
  PolicyRuleCreate,
  PolicyRuleUpdate,
  PolicySimulateRequest,
  PolicySimulateResponse,
  PolicyStatus,
  PolicyType,
  PolicyUpdate,
  PolicyVersionResponse,
} from "@/types/policies";
import {
  archivePolicy as apiArchivePolicy,
  branchPolicyVersion as apiBranchPolicyVersion,
  createPolicy as apiCreatePolicy,
  createPolicyRule as apiCreatePolicyRule,
  deletePolicyRule as apiDeletePolicyRule,
  fetchPolicies,
  fetchPolicy,
  fetchPolicyVersion,
  fetchPolicyVersions,
  publishPolicyVersion as apiPublishPolicyVersion,
  simulatePolicies as apiSimulatePolicies,
  updatePolicy as apiUpdatePolicy,
  updatePolicyRule as apiUpdatePolicyRule,
  updatePolicyStatus as apiUpdatePolicyStatus,
  PolicyApiError,
} from "./policies-api";

export type FilterPolicyType = "ALL" | PolicyType;
export type FilterPolicyStatus = "ALL" | PolicyStatus;

export interface UsePoliciesOptions {
  initialType?: FilterPolicyType;
  initialStatus?: FilterPolicyStatus;
  initialPageSize?: number;
}

export function usePolicies(options: UsePoliciesOptions = {}) {
  const {
    initialType = "ALL",
    initialStatus = "ALL",
    initialPageSize = 25,
  } = options;

  // Filters & Pagination
  const [typeFilter, setTypeFilterState] = useState<FilterPolicyType>(initialType);
  const [statusFilter, setStatusFilterState] = useState<FilterPolicyStatus>(initialStatus);
  const [searchQuery, setSearchQueryState] = useState("");
  const [page, setPageState] = useState(1);
  const [pageSize, setPageSizeState] = useState(initialPageSize);

  // Registry State
  const [items, setItems] = useState<PolicyResponse[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Selected Policy Detail & Version State
  const [selectedPolicyId, setSelectedPolicyId] = useState<string | null>(null);
  const [selectedPolicy, setSelectedPolicy] = useState<PolicyResponse | null>(null);
  const [selectedLoading, setSelectedLoading] = useState(false);
  const [versions, setVersions] = useState<PolicyVersionResponse[]>([]);
  const [selectedVersion, setSelectedVersion] = useState<PolicyVersionResponse | null>(null);
  const [compareVersion, setCompareVersion] = useState<PolicyVersionResponse | null>(null);

  // Mutation & Transaction State
  const [submitting, setSubmitting] = useState(false);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [mutationSuccess, setMutationSuccess] = useState<string | null>(null);

  // Simulation State
  const [simulating, setSimulating] = useState(false);
  const [simulationResult, setSimulationResult] = useState<PolicySimulateResponse | null>(null);
  const [simulationError, setSimulationError] = useState<string | null>(null);

  // Concurrency and race guards
  const abortControllerRef = useRef<AbortController | null>(null);
  const isMutatingRef = useRef(false);

  useEffect(() => {
    isMutatingRef.current = submitting;
  }, [submitting]);

  // Load Policies List
  const loadPolicies = useCallback(
    async (showLoading = true) => {
      if (isMutatingRef.current) return;

      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      const controller = new AbortController();
      abortControllerRef.current = controller;

      if (showLoading) setLoading(true);
      setError(null);

      try {
        const offset = (page - 1) * pageSize;
        const res = await fetchPolicies(
          {
            policy_type: typeFilter === "ALL" ? undefined : typeFilter,
            status: statusFilter === "ALL" ? undefined : statusFilter,
            limit: pageSize,
            offset,
          },
          controller.signal
        );

        setItems(res.items);
        setTotal(res.total);
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") return;
        const message = err instanceof PolicyApiError ? err.detail : "Failed to load policies.";
        setError(message);
      } finally {
        if (showLoading) setLoading(false);
      }
    },
    [page, pageSize, typeFilter, statusFilter]
  );

  useEffect(() => {
    let isMounted = true;
    (async () => {
      if (isMounted) {
        await loadPolicies();
      }
    })();
    return () => {
      isMounted = false;
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [loadPolicies]);

  // Select Policy and fetch its complete detail & version history
  const selectPolicy = useCallback(async (policyId: string | null) => {
    setSelectedPolicyId(policyId);
    if (!policyId) {
      setSelectedPolicy(null);
      setVersions([]);
      setSelectedVersion(null);
      setCompareVersion(null);
      return;
    }

    setSelectedLoading(true);
    setMutationError(null);
    try {
      const [policyRes, versionsRes] = await Promise.all([
        fetchPolicy(policyId),
        fetchPolicyVersions(policyId),
      ]);
      setSelectedPolicy(policyRes);
      setVersions(versionsRes);

      // Select active published version, or first version
      if (policyRes.current_version) {
        setSelectedVersion(policyRes.current_version);
      } else if (versionsRes.length > 0) {
        setSelectedVersion(versionsRes[0]);
      } else {
        setSelectedVersion(null);
      }
    } catch (err) {
      const msg = err instanceof PolicyApiError ? err.detail : "Failed to load policy details.";
      setMutationError(msg);
    } finally {
      setSelectedLoading(false);
    }
  }, []);

  // Select a specific historical version
  const selectVersion = useCallback(
    async (versionId: string) => {
      if (!selectedPolicyId) return;
      try {
        const versionRes = await fetchPolicyVersion(selectedPolicyId, versionId);
        setSelectedVersion(versionRes);
      } catch (err) {
        const msg = err instanceof PolicyApiError ? err.detail : "Failed to load version snapshot.";
        setMutationError(msg);
      }
    },
    [selectedPolicyId]
  );

  // --- Consequential Mutation Handlers with Strict Guards ---

  const createPolicy = useCallback(
    async (payload: PolicyCreate): Promise<PolicyResponse | null> => {
      if (isMutatingRef.current) return null;
      setSubmitting(true);
      setMutationError(null);
      setMutationSuccess(null);

      try {
        const created = await apiCreatePolicy(payload);
        setMutationSuccess(`Policy '${created.name}' created successfully.`);
        await loadPolicies(false);
        await selectPolicy(created.id);
        return created;
      } catch (err) {
        const msg = err instanceof PolicyApiError ? err.detail : "Failed to create policy.";
        setMutationError(msg);
        return null;
      } finally {
        setSubmitting(false);
      }
    },
    [loadPolicies, selectPolicy]
  );

  const updatePolicy = useCallback(
    async (policyId: string, payload: PolicyUpdate): Promise<boolean> => {
      if (isMutatingRef.current) return false;
      setSubmitting(true);
      setMutationError(null);
      setMutationSuccess(null);

      try {
        const updated = await apiUpdatePolicy(policyId, payload);
        setMutationSuccess(`Policy '${updated.name}' updated successfully.`);
        await loadPolicies(false);
        await selectPolicy(updated.id);
        return true;
      } catch (err) {
        const msg = err instanceof PolicyApiError ? err.detail : "Failed to update policy.";
        setMutationError(msg);
        return false;
      } finally {
        setSubmitting(false);
      }
    },
    [loadPolicies, selectPolicy]
  );

  const updatePolicyStatus = useCallback(
    async (policyId: string, newStatus: PolicyStatus): Promise<boolean> => {
      if (isMutatingRef.current) return false;
      setSubmitting(true);
      setMutationError(null);
      setMutationSuccess(null);

      try {
        const updated = await apiUpdatePolicyStatus(policyId, newStatus);
        setMutationSuccess(`Policy status transitioned to ${newStatus}.`);
        await loadPolicies(false);
        await selectPolicy(updated.id);
        return true;
      } catch (err) {
        const msg = err instanceof PolicyApiError ? err.detail : "Failed to transition policy status.";
        setMutationError(msg);
        return false;
      } finally {
        setSubmitting(false);
      }
    },
    [loadPolicies, selectPolicy]
  );

  const archivePolicy = useCallback(
    async (policyId: string): Promise<boolean> => {
      if (isMutatingRef.current) return false;
      setSubmitting(true);
      setMutationError(null);
      setMutationSuccess(null);

      try {
        await apiArchivePolicy(policyId);
        setMutationSuccess("Policy archived successfully.");
        await loadPolicies(false);
        setSelectedPolicyId(null);
        setSelectedPolicy(null);
        return true;
      } catch (err) {
        const msg = err instanceof PolicyApiError ? err.detail : "Failed to archive policy.";
        setMutationError(msg);
        return false;
      } finally {
        setSubmitting(false);
      }
    },
    [loadPolicies]
  );

  const branchDraftVersion = useCallback(
    async (policyId: string, changelog?: string): Promise<PolicyVersionResponse | null> => {
      if (isMutatingRef.current) return null;
      setSubmitting(true);
      setMutationError(null);
      setMutationSuccess(null);

      try {
        const newVersion = await apiBranchPolicyVersion(policyId, changelog);
        setMutationSuccess(`Branched new Draft version v${newVersion.version_number}.`);
        await selectPolicy(policyId);
        setSelectedVersion(newVersion);
        return newVersion;
      } catch (err) {
        const msg = err instanceof PolicyApiError ? err.detail : "Failed to branch draft version.";
        setMutationError(msg);
        return null;
      } finally {
        setSubmitting(false);
      }
    },
    [selectPolicy]
  );

  const publishVersion = useCallback(
    async (policyId: string, versionId: string): Promise<boolean> => {
      if (isMutatingRef.current) return false;
      setSubmitting(true);
      setMutationError(null);
      setMutationSuccess(null);

      try {
        const published = await apiPublishPolicyVersion(policyId, versionId);
        setMutationSuccess(
          `Version v${published.version_number} published and activated successfully. This version is now immutable.`
        );
        await loadPolicies(false);
        await selectPolicy(policyId);
        return true;
      } catch (err) {
        const msg = err instanceof PolicyApiError ? err.detail : "Failed to publish version.";
        setMutationError(msg);
        return false;
      } finally {
        setSubmitting(false);
      }
    },
    [loadPolicies, selectPolicy]
  );

  const createRule = useCallback(
    async (policyId: string, versionId: string, payload: PolicyRuleCreate): Promise<boolean> => {
      if (isMutatingRef.current) return false;
      setSubmitting(true);
      setMutationError(null);
      setMutationSuccess(null);

      try {
        await apiCreatePolicyRule(policyId, versionId, payload);
        setMutationSuccess(`Rule '${payload.rule_name}' added to draft version.`);
        await selectVersion(versionId);
        return true;
      } catch (err) {
        const msg = err instanceof PolicyApiError ? err.detail : "Failed to add rule.";
        setMutationError(msg);
        return false;
      } finally {
        setSubmitting(false);
      }
    },
    [selectVersion]
  );

  const updateRule = useCallback(
    async (
      policyId: string,
      versionId: string,
      ruleId: string,
      payload: PolicyRuleUpdate
    ): Promise<boolean> => {
      if (isMutatingRef.current) return false;
      setSubmitting(true);
      setMutationError(null);
      setMutationSuccess(null);

      try {
        await apiUpdatePolicyRule(policyId, versionId, ruleId, payload);
        setMutationSuccess("Rule updated successfully.");
        await selectVersion(versionId);
        return true;
      } catch (err) {
        const msg = err instanceof PolicyApiError ? err.detail : "Failed to update rule.";
        setMutationError(msg);
        return false;
      } finally {
        setSubmitting(false);
      }
    },
    [selectVersion]
  );

  const deleteRule = useCallback(
    async (policyId: string, versionId: string, ruleId: string): Promise<boolean> => {
      if (isMutatingRef.current) return false;
      setSubmitting(true);
      setMutationError(null);
      setMutationSuccess(null);

      try {
        await apiDeletePolicyRule(policyId, versionId, ruleId);
        setMutationSuccess("Rule deleted from draft version.");
        await selectVersion(versionId);
        return true;
      } catch (err) {
        const msg = err instanceof PolicyApiError ? err.detail : "Failed to delete rule.";
        setMutationError(msg);
        return false;
      } finally {
        setSubmitting(false);
      }
    },
    [selectVersion]
  );

  // Policy Simulation
  const simulatePolicy = useCallback(async (payload: PolicySimulateRequest) => {
    setSimulating(true);
    setSimulationError(null);
    setSimulationResult(null);

    try {
      const res = await apiSimulatePolicies(payload);
      setSimulationResult(res);
      return res;
    } catch (err) {
      const msg = err instanceof PolicyApiError ? err.detail : "Policy simulation failed.";
      setSimulationError(msg);
      return null;
    } finally {
      setSimulating(false);
    }
  }, []);

  // Client-side keyword filter over the fetched page
  const filteredItems = items.filter((item) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      item.name.toLowerCase().includes(q) ||
      item.slug.toLowerCase().includes(q) ||
      (item.description && item.description.toLowerCase().includes(q))
    );
  });

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return {
    // Registry listing
    items: filteredItems,
    rawItems: items,
    total,
    totalPages,
    page,
    pageSize,
    typeFilter,
    statusFilter,
    searchQuery,
    loading,
    error,
    setTypeFilter: (t: FilterPolicyType) => {
      setTypeFilterState(t);
      setPageState(1);
    },
    setStatusFilter: (s: FilterPolicyStatus) => {
      setStatusFilterState(s);
      setPageState(1);
    },
    setSearchQuery: setSearchQueryState,
    setPage: setPageState,
    setPageSize: (size: number) => {
      setPageSizeState(size);
      setPageState(1);
    },
    refresh: () => loadPolicies(true),

    // Policy Detail & Versioning
    selectedPolicyId,
    selectedPolicy,
    selectedLoading,
    versions,
    selectedVersion,
    compareVersion,
    selectPolicy,
    selectVersion,
    setCompareVersion,

    // Mutation state & actions
    submitting,
    mutationError,
    mutationSuccess,
    clearMutationState: () => {
      setMutationError(null);
      setMutationSuccess(null);
    },
    createPolicy,
    updatePolicy,
    updatePolicyStatus,
    archivePolicy,
    branchDraftVersion,
    publishVersion,
    createRule,
    updateRule,
    deleteRule,

    // Simulation
    simulating,
    simulationResult,
    simulationError,
    simulatePolicy,
    clearSimulationState: () => {
      setSimulationError(null);
      setSimulationResult(null);
    },
  };
}

