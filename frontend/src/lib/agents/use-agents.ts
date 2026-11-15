/**
 * Custom React Hook for Managing VERIDEX Agent Fleet Registry (Phase 9.6).
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  AgentCreate,
  AgentEnvironment,
  AgentResponse,
  AgentRiskTier,
  AgentStatus,
  AgentToolPermission,
  AgentUpdate,
  AgentVersionCreate,
  AgentVersionResponse,
} from "@/types/agents";
import type { ToolResponse } from "@/types/tools";
import {
  activateAgent as apiActivateAgent,
  createAgent as apiCreateAgent,
  createAgentVersion as apiCreateAgentVersion,
  deactivateAgent as apiDeactivateAgent,
  fetchAgent,
  fetchAgentTools as apiFetchAgentTools,
  fetchAgentVersions as apiFetchAgentVersions,
  fetchAgents,
  grantAgentTool as apiGrantAgentTool,
  revokeAgentTool as apiRevokeAgentTool,
  suspendAgent as apiSuspendAgent,
  updateAgent as apiUpdateAgent,
  AgentApiError,
} from "./agents-api";
import { fetchTools } from "@/lib/tools/tools-api";

export type FilterAgentStatus = "ALL" | AgentStatus;
export type FilterAgentEnvironment = "ALL" | AgentEnvironment;
export type FilterAgentRiskTier = "ALL" | AgentRiskTier;

export interface UseAgentsOptions {
  initialStatus?: FilterAgentStatus;
  initialEnvironment?: FilterAgentEnvironment;
  initialRiskTier?: FilterAgentRiskTier;
  initialLimit?: number;
}

export function useAgents(options: UseAgentsOptions = {}) {
  const {
    initialStatus = "ALL",
    initialEnvironment = "ALL",
    initialRiskTier = "ALL",
    initialLimit = 50,
  } = options;

  // Filters & Pagination
  const [statusFilter, setStatusFilter] = useState<FilterAgentStatus>(initialStatus);
  const [environmentFilter, setEnvironmentFilter] = useState<FilterAgentEnvironment>(initialEnvironment);
  const [riskTierFilter, setRiskTierFilter] = useState<FilterAgentRiskTier>(initialRiskTier);
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(initialLimit);

  // Agent Fleet State
  const [agents, setAgents] = useState<AgentResponse[]>([]);
  const [totalAgents, setTotalAgents] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Selected Agent Detail State
  const [selectedAgent, setSelectedAgent] = useState<AgentResponse | null>(null);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  // Version History State
  const [versions, setVersions] = useState<AgentVersionResponse[]>([]);
  const [isVersionsLoading, setIsVersionsLoading] = useState(false);

  // Tool Permissions State
  const [toolPermissions, setToolPermissions] = useState<AgentToolPermission[]>([]);
  const [availableTools, setAvailableTools] = useState<ToolResponse[]>([]);
  const [isToolsLoading, setIsToolsLoading] = useState(false);

  // Empirical Trust Profile State
  const [trustProfile, setTrustProfile] = useState<Record<string, unknown> | null>(null);
  const [isProfileLoading, setIsProfileLoading] = useState(false);

  const isMounted = useRef(true);
  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  // Fetch paginated agent roster
  const loadAgents = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const skip = page * pageSize;
      const res = await fetchAgents(skip, pageSize);
      if (isMounted.current) {
        setAgents(res.items);
        setTotalAgents(res.total);
      }
    } catch (err) {
      if (isMounted.current) {
        const msg = err instanceof AgentApiError ? err.detail : "Failed to load agents";
        setError(msg);
      }
    } finally {
      if (isMounted.current) {
        setIsLoading(false);
      }
    }
  }, [page, pageSize]);

  useEffect(() => {
    let ignore = false;
    async function execute() {
      try {
        const skip = page * pageSize;
        const res = await fetchAgents(skip, pageSize);
        if (!ignore) {
          setAgents(res.items);
          setTotalAgents(res.total);
          setError(null);
        }
      } catch (err) {
        if (!ignore) {
          const msg = err instanceof AgentApiError ? err.detail : "Failed to load agents";
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
  }, [page, pageSize]);

  // Load single agent detail drawer data
  const selectAgent = useCallback(async (agentOrId: AgentResponse | string | null) => {
    if (!agentOrId) {
      setSelectedAgent(null);
      setVersions([]);
      setToolPermissions([]);
      setTrustProfile(null);
      return;
    }

    const agentId = typeof agentOrId === "string" ? agentOrId : agentOrId.id;
    setIsDetailLoading(true);
    setDetailError(null);

    // If full agent object passed, set immediately for responsive UI
    if (typeof agentOrId !== "string") {
      setSelectedAgent(agentOrId);
    }

    try {
      const [agentRes, versionsRes, toolsPermRes] = await Promise.all([
        typeof agentOrId === "string" ? fetchAgent(agentId) : Promise.resolve(agentOrId),
        apiFetchAgentVersions(agentId).catch(() => [] as AgentVersionResponse[]),
        apiFetchAgentTools(agentId).catch(() => [] as AgentToolPermission[]),
      ]);

      if (isMounted.current) {
        setSelectedAgent(agentRes);
        setVersions(versionsRes);
        setToolPermissions(toolsPermRes);
      }

      // Load trust profile if available
      setIsProfileLoading(true);
      fetch(`/api/bff/risk/profiles/agents/${encodeURIComponent(agentId)}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((profile) => {
          if (isMounted.current) {
            setTrustProfile(profile);
          }
        })
        .catch(() => {
          if (isMounted.current) setTrustProfile(null);
        })
        .finally(() => {
          if (isMounted.current) setIsProfileLoading(false);
        });

      // Load available tools catalog for permissions dialog
      fetchTools(0, 500)
        .then((r) => {
          if (isMounted.current) setAvailableTools(r.items);
        })
        .catch(() => {});
    } catch (err) {
      if (isMounted.current) {
        const msg = err instanceof AgentApiError ? err.detail : "Failed to load agent details";
        setDetailError(msg);
      }
    } finally {
      if (isMounted.current) {
        setIsDetailLoading(false);
      }
    }
  }, []);

  // Reload versions for selected agent
  const reloadVersions = useCallback(async () => {
    if (!selectedAgent) return;
    setIsVersionsLoading(true);
    try {
      const res = await apiFetchAgentVersions(selectedAgent.id);
      if (isMounted.current) {
        setVersions(res);
      }
    } catch (err) {
      console.error("Failed to reload versions:", err);
    } finally {
      if (isMounted.current) {
        setIsVersionsLoading(false);
      }
    }
  }, [selectedAgent]);

  // Reload tool permissions for selected agent
  const reloadToolPermissions = useCallback(async () => {
    if (!selectedAgent) return;
    setIsToolsLoading(true);
    try {
      const res = await apiFetchAgentTools(selectedAgent.id);
      if (isMounted.current) {
        setToolPermissions(res);
      }
    } catch (err) {
      console.error("Failed to reload tool permissions:", err);
    } finally {
      if (isMounted.current) {
        setIsToolsLoading(false);
      }
    }
  }, [selectedAgent]);

  // Agent Mutations
  const createAgent = useCallback(
    async (payload: AgentCreate) => {
      const newAgent = await apiCreateAgent(payload);
      await loadAgents();
      return newAgent;
    },
    [loadAgents]
  );

  const updateAgent = useCallback(
    async (id: string, payload: AgentUpdate) => {
      const updated = await apiUpdateAgent(id, payload);
      if (selectedAgent && selectedAgent.id === id) {
        setSelectedAgent(updated);
      }
      await loadAgents();
      return updated;
    },
    [loadAgents, selectedAgent]
  );

  const activateAgent = useCallback(
    async (id: string) => {
      const updated = await apiActivateAgent(id);
      if (selectedAgent && selectedAgent.id === id) {
        setSelectedAgent(updated);
      }
      await loadAgents();
      return updated;
    },
    [loadAgents, selectedAgent]
  );

  const suspendAgent = useCallback(
    async (id: string) => {
      const updated = await apiSuspendAgent(id);
      if (selectedAgent && selectedAgent.id === id) {
        setSelectedAgent(updated);
      }
      await loadAgents();
      return updated;
    },
    [loadAgents, selectedAgent]
  );

  const deactivateAgent = useCallback(
    async (id: string) => {
      const updated = await apiDeactivateAgent(id);
      if (selectedAgent && selectedAgent.id === id) {
        setSelectedAgent(updated);
      }
      await loadAgents();
      return updated;
    },
    [loadAgents, selectedAgent]
  );

  const branchVersion = useCallback(
    async (id: string, versionString: string, payload: AgentVersionCreate) => {
      const newVersion = await apiCreateAgentVersion(id, versionString, payload);
      await reloadVersions();
      return newVersion;
    },
    [reloadVersions]
  );

  const grantTool = useCallback(
    async (agentId: string, toolId: string) => {
      const res = await apiGrantAgentTool(agentId, toolId);
      await reloadToolPermissions();
      return res;
    },
    [reloadToolPermissions]
  );

  const revokeTool = useCallback(
    async (agentId: string, toolId: string) => {
      await apiRevokeAgentTool(agentId, toolId);
      await reloadToolPermissions();
    },
    [reloadToolPermissions]
  );

  // Filtered agents in memory (for combined status, environment, tier, and search query)
  const filteredAgents = agents.filter((agent) => {
    if (statusFilter !== "ALL" && agent.status !== statusFilter) return false;
    if (environmentFilter !== "ALL" && agent.environment !== environmentFilter) return false;
    if (riskTierFilter !== "ALL" && agent.risk_tier !== riskTierFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const matchName = agent.name.toLowerCase().includes(q);
      const matchSlug = agent.slug.toLowerCase().includes(q);
      const matchDesc = agent.description?.toLowerCase().includes(q) ?? false;
      const matchModel = `${agent.model_provider} ${agent.model_name}`.toLowerCase().includes(q);
      if (!matchName && !matchSlug && !matchDesc && !matchModel) return false;
    }
    return true;
  });

  return {
    agents: filteredAgents,
    rawAgents: agents,
    totalAgents,
    isLoading,
    error,
    refresh: loadAgents,

    // Filter controls
    statusFilter,
    setStatusFilter,
    environmentFilter,
    setEnvironmentFilter,
    riskTierFilter,
    setRiskTierFilter,
    searchQuery,
    setSearchQuery,
    page,
    setPage,
    pageSize,
    setPageSize,

    // Selected Agent Drawer
    selectedAgent,
    selectAgent,
    isDetailLoading,
    detailError,
    versions,
    isVersionsLoading,
    toolPermissions,
    availableTools,
    isToolsLoading,
    trustProfile,
    isProfileLoading,

    // Operations
    createAgent,
    updateAgent,
    activateAgent,
    suspendAgent,
    deactivateAgent,
    branchVersion,
    grantTool,
    revokeTool,
  };
}
