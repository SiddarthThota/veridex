/**
 * Custom React Hook for Managing VERIDEX Quantitative Risk Engine (Phase 9.5).
 *
 * Coordinates risk assessments explorer, bounded-concurrency agent trust profiling,
 * immutable scoring configuration publisher, and dry-run simulation.
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  AgentRiskProfileResponse,
  RiskAssessmentResponse,
  RiskConfigurationResponse,
  RiskConfigurationVersionCreate,
  RiskConfigurationVersionResponse,
  RiskEvaluateRequest,
  RiskEvaluateResponse,
  RiskLevel,
} from "@/types/risk";
import type { AgentSummary, ToolSummary, ToolVersionSummary } from "@/types/entities";
import {
  evaluateRisk as apiEvaluateRisk,
  fetchActiveRiskConfig,
  fetchAgentRiskProfile,
  fetchAgentsList,
  fetchRiskAssessment,
  fetchRiskAssessments,
  fetchToolsList,
  fetchToolVersionsList,
  publishRiskConfigVersion as apiPublishRiskConfigVersion,
  RiskApiError,
} from "./risk-api";

export type FilterRiskLevel = "ALL" | RiskLevel;

export interface UseRiskOptions {
  initialRiskLevel?: FilterRiskLevel;
  initialPageSize?: number;
}

export function useRisk(options: UseRiskOptions = {}) {
  const { initialRiskLevel = "ALL", initialPageSize = 25 } = options;

  // --- Subview Tab State ---
  const [activeTab, setActiveTab] = useState<"assessments" | "profiles" | "config" | "simulation">("assessments");

  // --- 1. Assessments Explorer State ---
  const [riskLevelFilter, setRiskLevelFilterState] = useState<FilterRiskLevel>(initialRiskLevel);
  const [agentFilter, setAgentFilterState] = useState<string>("");
  const [toolFilter, setToolFilterState] = useState<string>("");
  const [startDateFilter, setStartDateFilterState] = useState<string>("");
  const [endDateFilter, setEndDateFilterState] = useState<string>("");
  const [assessmentPage, setAssessmentPageState] = useState(1);
  const [assessmentPageSize, setAssessmentPageSizeState] = useState(initialPageSize);

  const [assessments, setAssessments] = useState<RiskAssessmentResponse[]>([]);
  const [assessmentsTotal, setAssessmentsTotal] = useState(0);
  const [assessmentsLoading, setAssessmentsLoading] = useState(true);
  const [assessmentsError, setAssessmentsError] = useState<string | null>(null);

  const [selectedAssessment, setSelectedAssessment] = useState<RiskAssessmentResponse | null>(null);
  const [assessmentDetailLoading, setAssessmentDetailLoading] = useState(false);

  // --- 2. Bounded Agent Profiles State ---
  const [agentPage, setAgentPageState] = useState(1);
  const AGENT_PAGE_SIZE = 20;
  const [agentsList, setAgentsList] = useState<AgentSummary[]>([]);
  const [agentsTotal, setAgentsTotal] = useState(0);
  const [agentsLoading, setAgentsLoading] = useState(false);
  const [agentProfiles, setAgentProfiles] = useState<Record<string, AgentRiskProfileResponse>>({});
  const [profileLoadingStates, setProfileLoadingStates] = useState<Record<string, boolean>>({});
  const [profileErrors, setProfileErrors] = useState<Record<string, string>>({});

  // Lazy agent drilldown
  const [expandedAgentId, setExpandedAgentId] = useState<string | null>(null);
  const [expandedAgentAssessments, setExpandedAgentAssessments] = useState<RiskAssessmentResponse[]>([]);
  const [expandedAgentLoading, setExpandedAgentLoading] = useState(false);

  // --- 3. Risk Configuration State ---
  const [activeConfig, setActiveConfig] = useState<RiskConfigurationResponse | null>(null);
  const [configLoading, setConfigLoading] = useState(false);
  const [configSubmitting, setConfigSubmitting] = useState(false);
  const [configError, setConfigError] = useState<string | null>(null);
  const [configSuccess, setConfigSuccess] = useState<string | null>(null);

  // Proposed configuration template for authoring
  const [proposedConfig, setProposedConfig] = useState<RiskConfigurationVersionCreate>({
    weight_tool: 0.35,
    weight_data: 0.25,
    weight_agent: 0.20,
    weight_context: 0.20,
    threshold_medium: 30,
    threshold_high: 60,
    threshold_critical: 85,
    approval_threshold: 60,
    deny_threshold: 90,
    heuristic_rules: [],
    changelog: "",
  });

  // --- 4. Risk Simulation State ---
  const [simulationLoading, setSimulationLoading] = useState(false);
  const [simulationResult, setSimulationResult] = useState<RiskEvaluateResponse | null>(null);
  const [simulationError, setSimulationError] = useState<string | null>(null);

  // Entity cache for selectors
  const [cachedAgents, setCachedAgents] = useState<AgentSummary[]>([]);
  const [cachedTools, setCachedTools] = useState<ToolSummary[]>([]);
  const [cachedToolVersions, setCachedToolVersions] = useState<Record<string, ToolVersionSummary[]>>({});

  // Concurrency & Abort Guards
  const assessmentAbortRef = useRef<AbortController | null>(null);
  const agentsAbortRef = useRef<AbortController | null>(null);
  const isMutatingRef = useRef(false);

  // --- Assessment Fetcher ---
  const loadAssessments = useCallback(async (showLoading = true) => {
    if (isMutatingRef.current) return;

    if (assessmentAbortRef.current) {
      assessmentAbortRef.current.abort();
    }
    const controller = new AbortController();
    assessmentAbortRef.current = controller;

    if (showLoading) setAssessmentsLoading(true);
    setAssessmentsError(null);

    try {
      const offset = (assessmentPage - 1) * assessmentPageSize;
      const res = await fetchRiskAssessments(
        {
          risk_level: riskLevelFilter === "ALL" ? undefined : riskLevelFilter,
          agent_id: agentFilter.trim() || undefined,
          tool_id: toolFilter.trim() || undefined,
          start_date: startDateFilter.trim() || undefined,
          end_date: endDateFilter.trim() || undefined,
          limit: assessmentPageSize,
          offset,
        },
        controller.signal
      );

      setAssessments(res.items);
      setAssessmentsTotal(res.total);
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
      const msg = err instanceof RiskApiError ? err.detail : "Failed to load risk assessments.";
      setAssessmentsError(msg);
    } finally {
      if (showLoading) setAssessmentsLoading(false);
    }
  }, [assessmentPage, assessmentPageSize, riskLevelFilter, agentFilter, toolFilter, startDateFilter, endDateFilter]);

  useEffect(() => {
    let isMounted = true;
    (async () => {
      if (isMounted) {
        await loadAssessments();
      }
    })();
    return () => {
      isMounted = false;
      if (assessmentAbortRef.current) assessmentAbortRef.current.abort();
    };
  }, [loadAssessments]);

  // Select Assessment for deep-dive drawer
  const selectAssessment = useCallback(async (assessmentId: string | null) => {
    if (!assessmentId) {
      setSelectedAssessment(null);
      return;
    }
    setAssessmentDetailLoading(true);
    try {
      const detail = await fetchRiskAssessment(assessmentId);
      setSelectedAssessment(detail);
    } catch (err) {
      const msg = err instanceof RiskApiError ? err.detail : "Failed to load assessment detail.";
      setAssessmentsError(msg);
    } finally {
      setAssessmentDetailLoading(false);
    }
  }, []);

  // --- Bounded Concurrency Agent Profile Loader ---
  const loadSingleProfileWithRetry = useCallback(async (agentId: string) => {
    setProfileLoadingStates((prev) => ({ ...prev, [agentId]: true }));
    setProfileErrors((prev) => {
      const copy = { ...prev };
      delete copy[agentId];
      return copy;
    });

    const delays = [500, 1500];
    let attempt = 0;

    while (attempt <= 2) {
      try {
        const profile = await fetchAgentRiskProfile(agentId);
        setAgentProfiles((prev) => ({ ...prev, [agentId]: profile }));
        setProfileLoadingStates((prev) => ({ ...prev, [agentId]: false }));
        return;
      } catch (err) {
        attempt += 1;
        if (attempt <= 2) {
          await new Promise((resolve) => setTimeout(resolve, delays[attempt - 1]));
        } else {
          const msg = err instanceof RiskApiError ? err.detail : "Profile unavailable";
          setProfileErrors((prev) => ({ ...prev, [agentId]: msg }));
          setProfileLoadingStates((prev) => ({ ...prev, [agentId]: false }));
        }
      }
    }
  }, []);

  // Worker pool for bounded concurrency (max 4 concurrent requests)
  const loadAgentProfilesBounded = useCallback(async (agents: AgentSummary[]) => {
    const queue = [...agents];
    const MAX_CONCURRENCY = 4;

    const worker = async () => {
      while (queue.length > 0) {
        const nextAgent = queue.shift();
        if (nextAgent) {
          await loadSingleProfileWithRetry(nextAgent.id);
        }
      }
    };

    const workers = Array.from({ length: Math.min(MAX_CONCURRENCY, agents.length) }, () => worker());
    await Promise.all(workers);
  }, [loadSingleProfileWithRetry]);

  // Load Agents Page and trigger bounded profile fetching
  const loadAgentsPage = useCallback(async () => {
    if (agentsAbortRef.current) agentsAbortRef.current.abort();
    const controller = new AbortController();
    agentsAbortRef.current = controller;

    setAgentsLoading(true);
    try {
      const skip = (agentPage - 1) * AGENT_PAGE_SIZE;
      const res = await fetchAgentsList(skip, AGENT_PAGE_SIZE, controller.signal);
      setAgentsList(res.items);
      setAgentsTotal(res.total);

      // Start bounded profile fetching for visible agents
      loadAgentProfilesBounded(res.items);
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
    } finally {
      setAgentsLoading(false);
    }
  }, [agentPage, loadAgentProfilesBounded]);

  useEffect(() => {
    let isMounted = true;
    if (activeTab === "profiles") {
      (async () => {
        if (isMounted) {
          await loadAgentsPage();
        }
      })();
    }
    return () => {
      isMounted = false;
      if (agentsAbortRef.current) agentsAbortRef.current.abort();
    };
  }, [activeTab, loadAgentsPage]);

  // Lazy drilldown: fetch assessments for an expanded agent
  const expandAgent = useCallback(async (agentId: string | null) => {
    setExpandedAgentId(agentId);
    if (!agentId) {
      setExpandedAgentAssessments([]);
      return;
    }

    setExpandedAgentLoading(true);
    try {
      const res = await fetchRiskAssessments({ agent_id: agentId, limit: 10 });
      setExpandedAgentAssessments(res.items);
    } catch {
      setExpandedAgentAssessments([]);
    } finally {
      setExpandedAgentLoading(false);
    }
  }, []);

  // --- Risk Configuration ---
  const loadConfig = useCallback(async () => {
    setConfigLoading(true);
    setConfigError(null);
    try {
      const res = await fetchActiveRiskConfig();
      setActiveConfig(res);
      if (res.current_version) {
        setProposedConfig({
          weight_tool: res.current_version.weight_tool,
          weight_data: res.current_version.weight_data,
          weight_agent: res.current_version.weight_agent,
          weight_context: res.current_version.weight_context,
          threshold_medium: res.current_version.threshold_medium,
          threshold_high: res.current_version.threshold_high,
          threshold_critical: res.current_version.threshold_critical,
          approval_threshold: res.current_version.approval_threshold,
          deny_threshold: res.current_version.deny_threshold,
          heuristic_rules: res.current_version.heuristic_rules || [],
          changelog: "",
        });
      }
    } catch (err) {
      const msg = err instanceof RiskApiError ? err.detail : "Failed to load active risk configuration.";
      setConfigError(msg);
    } finally {
      setConfigLoading(false);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;
    if (activeTab === "config") {
      (async () => {
        if (isMounted) {
          await loadConfig();
        }
      })();
    }
    return () => {
      isMounted = false;
    };
  }, [activeTab, loadConfig]);

  const publishConfig = useCallback(
    async (payload: RiskConfigurationVersionCreate): Promise<RiskConfigurationVersionResponse | null> => {
      if (isMutatingRef.current) return null;
      isMutatingRef.current = true;
      setConfigSubmitting(true);
      setConfigError(null);
      setConfigSuccess(null);

      try {
        const published = await apiPublishRiskConfigVersion(payload);
        setConfigSuccess(`Risk configuration version v${published.version_number} published successfully.`);
        await loadConfig();
        return published;
      } catch (err) {
        const msg = err instanceof RiskApiError ? err.detail : "Failed to publish risk configuration.";
        setConfigError(msg);
        return null;
      } finally {
        setConfigSubmitting(false);
        isMutatingRef.current = false;
      }
    },
    [loadConfig]
  );

  // Load config template from assessment snapshot
  const loadConfigFromSnapshot = useCallback((snapshot: Record<string, unknown>) => {
    if (!snapshot) return;
    setProposedConfig((prev) => ({
      ...prev,
      weight_tool: typeof snapshot.weight_tool === "number" ? snapshot.weight_tool : prev.weight_tool,
      weight_data: typeof snapshot.weight_data === "number" ? snapshot.weight_data : prev.weight_data,
      weight_agent: typeof snapshot.weight_agent === "number" ? snapshot.weight_agent : prev.weight_agent,
      weight_context: typeof snapshot.weight_context === "number" ? snapshot.weight_context : prev.weight_context,
      threshold_medium: typeof snapshot.threshold_medium === "number" ? snapshot.threshold_medium : prev.threshold_medium,
      threshold_high: typeof snapshot.threshold_high === "number" ? snapshot.threshold_high : prev.threshold_high,
      threshold_critical: typeof snapshot.threshold_critical === "number" ? snapshot.threshold_critical : prev.threshold_critical,
      approval_threshold: typeof snapshot.approval_threshold === "number" ? snapshot.approval_threshold : prev.approval_threshold,
      deny_threshold: typeof snapshot.deny_threshold === "number" ? snapshot.deny_threshold : prev.deny_threshold,
      changelog: `Loaded from assessment template snapshot`,
    }));
    setActiveTab("config");
  }, []);

  // --- Entity Selectors Cache (for Simulation) ---
  const loadEntitySelectors = useCallback(async () => {
    try {
      const [agentsRes, toolsRes] = await Promise.all([
        fetchAgentsList(0, 100),
        fetchToolsList(0, 100),
      ]);
      setCachedAgents(agentsRes.items);
      setCachedTools(toolsRes.items);
    } catch {
      // Ignored non-fatal cache warm
    }
  }, []);

  const loadToolVersions = useCallback(async (toolId: string) => {
    if (cachedToolVersions[toolId]) return cachedToolVersions[toolId];
    try {
      const versions = await fetchToolVersionsList(toolId);
      setCachedToolVersions((prev) => ({ ...prev, [toolId]: versions }));
      return versions;
    } catch {
      return [];
    }
  }, [cachedToolVersions]);

  useEffect(() => {
    let isMounted = true;
    if (activeTab === "simulation" && cachedAgents.length === 0) {
      (async () => {
        if (isMounted) {
          await loadEntitySelectors();
        }
      })();
    }
    return () => {
      isMounted = false;
    };
  }, [activeTab, cachedAgents.length, loadEntitySelectors]);

  // --- Risk Simulation ---
  const simulateRisk = useCallback(async (payload: RiskEvaluateRequest) => {
    setSimulationLoading(true);
    setSimulationError(null);
    setSimulationResult(null);

    try {
      const result = await apiEvaluateRisk(payload);
      setSimulationResult(result);
      return result;
    } catch (err) {
      const msg = err instanceof RiskApiError ? err.detail : "Risk evaluation failed.";
      setSimulationError(msg);
      return null;
    } finally {
      setSimulationLoading(false);
    }
  }, []);

  const totalAssessmentPages = Math.max(1, Math.ceil(assessmentsTotal / assessmentPageSize));
  const totalAgentPages = Math.max(1, Math.ceil(agentsTotal / AGENT_PAGE_SIZE));

  return {
    activeTab,
    setActiveTab,

    // 1. Assessments
    assessments,
    assessmentsTotal,
    totalAssessmentPages,
    assessmentPage,
    assessmentPageSize,
    riskLevelFilter,
    agentFilter,
    toolFilter,
    startDateFilter,
    endDateFilter,
    assessmentsLoading,
    assessmentsError,
    selectedAssessment,
    assessmentDetailLoading,
    setAssessmentPage: setAssessmentPageState,
    setAssessmentPageSize: (size: number) => {
      setAssessmentPageSizeState(size);
      setAssessmentPageState(1);
    },
    setRiskLevelFilter: (lvl: FilterRiskLevel) => {
      setRiskLevelFilterState(lvl);
      setAssessmentPageState(1);
    },
    setAgentFilter: (a: string) => {
      setAgentFilterState(a);
      setAssessmentPageState(1);
    },
    setToolFilter: (t: string) => {
      setToolFilterState(t);
      setAssessmentPageState(1);
    },
    setStartDateFilter: setStartDateFilterState,
    setEndDateFilter: setEndDateFilterState,
    selectAssessment,
    refreshAssessments: () => loadAssessments(true),

    // 2. Agent Profiles
    agentsList,
    agentsTotal,
    totalAgentPages,
    agentPage,
    agentsLoading,
    agentProfiles,
    profileLoadingStates,
    profileErrors,
    expandedAgentId,
    expandedAgentAssessments,
    expandedAgentLoading,
    setAgentPage: setAgentPageState,
    expandAgent,
    retryProfile: loadSingleProfileWithRetry,
    refreshAgents: loadAgentsPage,

    // 3. Risk Configuration
    activeConfig,
    proposedConfig,
    setProposedConfig,
    configLoading,
    configSubmitting,
    configError,
    configSuccess,
    publishConfig,
    loadConfigFromSnapshot,
    clearConfigMessages: () => {
      setConfigError(null);
      setConfigSuccess(null);
    },

    // 4. Simulation & Selectors
    cachedAgents,
    cachedTools,
    loadToolVersions,
    simulationLoading,
    simulationResult,
    simulationError,
    simulateRisk,
    clearSimulationState: () => {
      setSimulationError(null);
      setSimulationResult(null);
    },
  };
}

