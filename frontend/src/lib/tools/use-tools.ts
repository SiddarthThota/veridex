/**
 * Custom React Hook for Managing VERIDEX Governed Tool Catalog (Phase 9.6).
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  ToolAccessType,
  ToolApprovalRequirement,
  ToolCreate,
  ToolDataClassification,
  ToolResponse,
  ToolRiskLevel,
  ToolStatus,
  ToolUpdate,
  ToolVersionCreate,
  ToolVersionResponse,
} from "@/types/tools";
import {
  activateTool as apiActivateTool,
  createTool as apiCreateTool,
  createToolVersion as apiCreateToolVersion,
  deactivateTool as apiDeactivateTool,
  fetchTool,
  fetchToolVersions as apiFetchToolVersions,
  fetchTools,
  publishToolVersion as apiPublishToolVersion,
  suspendTool as apiSuspendTool,
  updateTool as apiUpdateTool,
  ToolApiError,
} from "./tools-api";

export type FilterToolStatus = "ALL" | ToolStatus;
export type FilterToolRiskLevel = "ALL" | ToolRiskLevel;
export type FilterToolAccessType = "ALL" | ToolAccessType;
export type FilterToolDataClassification = "ALL" | ToolDataClassification;
export type FilterToolApprovalRequirement = "ALL" | ToolApprovalRequirement;

export interface UseToolsOptions {
  initialStatus?: FilterToolStatus;
  initialRiskLevel?: FilterToolRiskLevel;
  initialLimit?: number;
}

export function useTools(options: UseToolsOptions = {}) {
  const {
    initialStatus = "ALL",
    initialRiskLevel = "ALL",
    initialLimit = 50,
  } = options;

  // Filters & Pagination
  const [statusFilter, setStatusFilter] = useState<FilterToolStatus>(initialStatus);
  const [riskLevelFilter, setRiskLevelFilter] = useState<FilterToolRiskLevel>(initialRiskLevel);
  const [accessTypeFilter, setAccessTypeFilter] = useState<FilterToolAccessType>("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(initialLimit);

  // Tools Catalog State
  const [tools, setTools] = useState<ToolResponse[]>([]);
  const [totalTools, setTotalTools] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Selected Tool Detail State
  const [selectedTool, setSelectedTool] = useState<ToolResponse | null>(null);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  // Version History State
  const [versions, setVersions] = useState<ToolVersionResponse[]>([]);
  const [isVersionsLoading, setIsVersionsLoading] = useState(false);

  const isMounted = useRef(true);
  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  // Fetch paginated tool catalog
  const loadTools = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const skip = page * pageSize;
      const res = await fetchTools(skip, pageSize);
      if (isMounted.current) {
        setTools(res.items);
        setTotalTools(res.total);
      }
    } catch (err) {
      if (isMounted.current) {
        const msg = err instanceof ToolApiError ? err.detail : "Failed to load tools";
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
        const res = await fetchTools(skip, pageSize);
        if (!ignore) {
          setTools(res.items);
          setTotalTools(res.total);
          setError(null);
        }
      } catch (err) {
        if (!ignore) {
          const msg = err instanceof ToolApiError ? err.detail : "Failed to load tools";
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

  // Load single tool detail drawer data
  const selectTool = useCallback(async (toolOrId: ToolResponse | string | null) => {
    if (!toolOrId) {
      setSelectedTool(null);
      setVersions([]);
      return;
    }

    const toolId = typeof toolOrId === "string" ? toolOrId : toolOrId.id;
    setIsDetailLoading(true);
    setDetailError(null);

    // Set immediate shallow tool if available
    if (typeof toolOrId !== "string") {
      setSelectedTool(toolOrId);
    }

    try {
      const [toolRes, versionsRes] = await Promise.all([
        typeof toolOrId === "string" ? fetchTool(toolId) : Promise.resolve(toolOrId),
        apiFetchToolVersions(toolId).catch(() => [] as ToolVersionResponse[]),
      ]);

      if (isMounted.current) {
        setSelectedTool(toolRes);
        setVersions(versionsRes);
      }
    } catch (err) {
      if (isMounted.current) {
        const msg = err instanceof ToolApiError ? err.detail : "Failed to load tool details";
        setDetailError(msg);
      }
    } finally {
      if (isMounted.current) {
        setIsDetailLoading(false);
      }
    }
  }, []);

  // Reload versions for selected tool
  const reloadVersions = useCallback(async () => {
    if (!selectedTool) return;
    setIsVersionsLoading(true);
    try {
      const res = await apiFetchToolVersions(selectedTool.id);
      if (isMounted.current) {
        setVersions(res);
      }
    } catch (err) {
      console.error("Failed to reload tool versions:", err);
    } finally {
      if (isMounted.current) {
        setIsVersionsLoading(false);
      }
    }
  }, [selectedTool]);

  // Tool Mutations
  const createTool = useCallback(
    async (payload: ToolCreate) => {
      const newTool = await apiCreateTool(payload);
      await loadTools();
      return newTool;
    },
    [loadTools]
  );

  const updateTool = useCallback(
    async (id: string, payload: ToolUpdate) => {
      const updated = await apiUpdateTool(id, payload);
      if (selectedTool && selectedTool.id === id) {
        setSelectedTool(updated);
      }
      await loadTools();
      return updated;
    },
    [loadTools, selectedTool]
  );

  const activateTool = useCallback(
    async (id: string) => {
      const updated = await apiActivateTool(id);
      if (selectedTool && selectedTool.id === id) {
        setSelectedTool(updated);
      }
      await loadTools();
      return updated;
    },
    [loadTools, selectedTool]
  );

  const suspendTool = useCallback(
    async (id: string) => {
      const updated = await apiSuspendTool(id);
      if (selectedTool && selectedTool.id === id) {
        setSelectedTool(updated);
      }
      await loadTools();
      return updated;
    },
    [loadTools, selectedTool]
  );

  const deactivateTool = useCallback(
    async (id: string) => {
      const updated = await apiDeactivateTool(id);
      if (selectedTool && selectedTool.id === id) {
        setSelectedTool(updated);
      }
      await loadTools();
      return updated;
    },
    [loadTools, selectedTool]
  );

  const createVersion = useCallback(
    async (toolId: string, payload: ToolVersionCreate) => {
      const newVersion = await apiCreateToolVersion(toolId, payload);
      await reloadVersions();
      return newVersion;
    },
    [reloadVersions]
  );

  const publishVersion = useCallback(
    async (toolId: string, versionId: string) => {
      const published = await apiPublishToolVersion(toolId, versionId);
      await reloadVersions();
      return published;
    },
    [reloadVersions]
  );

  // Filtered tools in memory
  const filteredTools = tools.filter((tool) => {
    if (statusFilter !== "ALL" && tool.status !== statusFilter) return false;
    if (riskLevelFilter !== "ALL" && tool.risk_level !== riskLevelFilter) return false;
    if (accessTypeFilter !== "ALL" && tool.access_type !== accessTypeFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const matchName = tool.name.toLowerCase().includes(q);
      const matchSlug = tool.slug.toLowerCase().includes(q);
      const matchDesc = tool.description?.toLowerCase().includes(q) ?? false;
      if (!matchName && !matchSlug && !matchDesc) return false;
    }
    return true;
  });

  return {
    tools: filteredTools,
    rawTools: tools,
    totalTools,
    isLoading,
    error,
    refresh: loadTools,

    // Filter controls
    statusFilter,
    setStatusFilter,
    riskLevelFilter,
    setRiskLevelFilter,
    accessTypeFilter,
    setAccessTypeFilter,
    searchQuery,
    setSearchQuery,
    page,
    setPage,
    pageSize,
    setPageSize,

    // Selected Tool Drawer
    selectedTool,
    selectTool,
    isDetailLoading,
    detailError,
    versions,
    isVersionsLoading,

    // Operations
    createTool,
    updateTool,
    activateTool,
    suspendTool,
    deactivateTool,
    createVersion,
    publishVersion,
  };
}
