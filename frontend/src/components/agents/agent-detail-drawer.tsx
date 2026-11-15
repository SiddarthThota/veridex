"use client";

import React, { useState } from "react";
import type { AgentResponse, AgentToolPermission, AgentVersionResponse } from "@/types/agents";
import type { ToolResponse } from "@/types/tools";
import { AgentStatusBadge } from "./agent-status-badge";
import { formatDate, formatEnvironment, formatRiskTier } from "@/lib/agents/agents-formatters";
import { useAuth } from "@/components/auth/auth-context";
import { canManageAgents } from "@/lib/permissions";

interface AgentDetailDrawerProps {
  agent: AgentResponse | null;
  isOpen: boolean;
  isLoading?: boolean;
  versions: AgentVersionResponse[];
  isVersionsLoading: boolean;
  toolPermissions: AgentToolPermission[];
  availableTools: ToolResponse[];
  isToolsLoading: boolean;
  trustProfile: Record<string, unknown> | null;
  isProfileLoading: boolean;
  onClose: () => void;
  onEdit: (agent: AgentResponse) => void;
  onActivate: (id: string) => Promise<unknown>;
  onSuspend: (id: string) => Promise<unknown>;
  onDeactivate: (id: string) => Promise<unknown>;
  onOpenBranchVersion: () => void;
  onOpenGrantTool: () => void;
  onRevokeTool: (agentId: string, toolId: string) => Promise<unknown>;
}

export function AgentDetailDrawer({
  agent,
  isOpen,
  versions,
  isVersionsLoading,
  toolPermissions,
  availableTools,
  isToolsLoading,
  trustProfile,
  isProfileLoading,
  onClose,
  onEdit,
  onActivate,
  onSuspend,
  onDeactivate,
  onOpenBranchVersion,
  onOpenGrantTool,
  onRevokeTool,
}: AgentDetailDrawerProps) {
  const { user } = useAuth();
  const canMutate = canManageAgents(user?.role);
  const [activeTab, setActiveTab] = useState<"overview" | "versions" | "tools" | "trust">("overview");

  if (!isOpen || !agent) return null;

  const envConfig = formatEnvironment(agent.environment);
  const tierConfig = formatRiskTier(agent.risk_tier);

  // Map tool_id to ToolResponse for pretty display in tools tab
  const toolsMap = new Map(availableTools.map((t) => [t.id, t]));

  return (
    <div className="fixed inset-y-0 right-0 z-50 w-full max-w-2xl bg-gray-900 border-l border-gray-800 shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-right duration-200">
      {/* Drawer Header */}
      <div className="p-6 border-b border-gray-800 bg-gray-950/40 flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-bold text-white tracking-tight">{agent.name}</h2>
            <AgentStatusBadge status={agent.status} size="sm" />
          </div>
          <div className="flex items-center gap-3 text-xs text-gray-400 mt-1">
            <span className="font-mono text-cyan-400">{agent.slug}</span>
            <span>•</span>
            <span className={`px-2 py-0.5 rounded text-[10px] font-medium border ${envConfig.badgeClass}`}>
              {envConfig.label}
            </span>
            <span>•</span>
            <span className={`px-2 py-0.5 rounded text-[10px] font-medium border ${tierConfig.badgeClass}`}>
              {tierConfig.label}
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="text-gray-400 hover:text-white p-1 rounded-lg hover:bg-gray-800 transition-colors"
        >
          ✕
        </button>
      </div>

      {/* Tabs */}
      <div className="flex items-center px-6 border-b border-gray-800 bg-gray-950/20 text-xs">
        <button
          type="button"
          onClick={() => setActiveTab("overview")}
          className={`py-3 px-3 font-medium border-b-2 transition-colors ${
            activeTab === "overview"
              ? "border-cyan-400 text-cyan-400"
              : "border-transparent text-gray-400 hover:text-gray-200"
          }`}
        >
          Overview
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("versions")}
          className={`py-3 px-3 font-medium border-b-2 transition-colors ${
            activeTab === "versions"
              ? "border-cyan-400 text-cyan-400"
              : "border-transparent text-gray-400 hover:text-gray-200"
          }`}
        >
          Version History ({versions.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("tools")}
          className={`py-3 px-3 font-medium border-b-2 transition-colors ${
            activeTab === "tools"
              ? "border-cyan-400 text-cyan-400"
              : "border-transparent text-gray-400 hover:text-gray-200"
          }`}
        >
          Permitted Tools ({toolPermissions.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("trust")}
          className={`py-3 px-3 font-medium border-b-2 transition-colors ${
            activeTab === "trust"
              ? "border-cyan-400 text-cyan-400"
              : "border-transparent text-gray-400 hover:text-gray-200"
          }`}
        >
          Empirical Trust Profile
        </button>
      </div>

      {/* Drawer Body */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* OVERVIEW TAB */}
        {activeTab === "overview" && (
          <div className="space-y-6">
            {/* Description Card */}
            <div className="p-4 rounded-xl bg-gray-950/60 border border-gray-800/80">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">Description</h4>
              <p className="text-xs text-gray-200 leading-relaxed">
                {agent.description || "No description provided for this agent profile."}
              </p>
            </div>

            {/* Active Model Specification */}
            <div className="p-4 rounded-xl bg-gray-950/60 border border-gray-800/80">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">
                Authoritative Active Model
              </h4>
              <div className="grid grid-cols-2 gap-4 text-xs">
                <div>
                  <span className="text-gray-500 block mb-0.5">Model Provider</span>
                  <span className="font-mono text-cyan-300 font-semibold">{agent.model_provider}</span>
                </div>
                <div>
                  <span className="text-gray-500 block mb-0.5">Model Name</span>
                  <span className="font-mono text-white font-semibold">{agent.model_name}</span>
                </div>
              </div>
            </div>

            {/* Metadata Grid */}
            <div className="p-4 rounded-xl bg-gray-950/60 border border-gray-800/80">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">System Identifiers</h4>
              <div className="grid grid-cols-2 gap-4 text-xs">
                <div>
                  <span className="text-gray-500 block mb-0.5">Agent UUID</span>
                  <span className="font-mono text-gray-300 text-[11px] select-all">{agent.id}</span>
                </div>
                <div>
                  <span className="text-gray-500 block mb-0.5">Organization ID</span>
                  <span className="font-mono text-gray-300 text-[11px] select-all">{agent.organization_id}</span>
                </div>
                <div>
                  <span className="text-gray-500 block mb-0.5">Owner User ID</span>
                  <span className="font-mono text-gray-300 text-[11px] select-all">{agent.owner_user_id}</span>
                </div>
                <div>
                  <span className="text-gray-500 block mb-0.5">Lifecycle Status</span>
                  <span className="font-medium text-white">{agent.status}</span>
                </div>
                <div>
                  <span className="text-gray-500 block mb-0.5">Created At</span>
                  <span className="text-gray-300">{formatDate(agent.created_at)}</span>
                </div>
                <div>
                  <span className="text-gray-500 block mb-0.5">Last Updated</span>
                  <span className="text-gray-300">{formatDate(agent.updated_at)}</span>
                </div>
              </div>
            </div>

            {/* Lifecycle Action Panel */}
            {canMutate && (
              <div className="p-4 rounded-xl bg-gray-950/60 border border-gray-800/80">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">
                  Lifecycle Management
                </h4>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => onEdit(agent)}
                    className="py-1.5 px-3 rounded-lg bg-gray-800 hover:bg-gray-700 text-white text-xs font-medium transition-colors"
                  >
                    Edit Metadata
                  </button>

                  {agent.status === "DRAFT" && (
                    <button
                      type="button"
                      onClick={() => onActivate(agent.id)}
                      className="py-1.5 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium transition-colors"
                    >
                      Activate Agent
                    </button>
                  )}

                  {agent.status === "ACTIVE" && (
                    <button
                      type="button"
                      onClick={() => onSuspend(agent.id)}
                      className="py-1.5 px-3 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-medium transition-colors"
                    >
                      Suspend Agent
                    </button>
                  )}

                  {agent.status === "SUSPENDED" && (
                    <button
                      type="button"
                      onClick={() => onActivate(agent.id)}
                      className="py-1.5 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium transition-colors"
                    >
                      Reactivate Agent
                    </button>
                  )}

                  {agent.status !== "DEACTIVATED" && (
                    <button
                      type="button"
                      onClick={() => onDeactivate(agent.id)}
                      className="py-1.5 px-3 rounded-lg bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-500/30 text-xs font-medium transition-colors"
                    >
                      Deactivate Agent
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* VERSION HISTORY TAB */}
        {activeTab === "versions" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-xs font-semibold text-white">Immutable Version Snapshots</h4>
                <p className="text-[11px] text-gray-400 mt-0.5">
                  Historical snapshots recorded via <code className="font-mono text-cyan-300">POST /api/v1/agents/{`{id}`}/versions</code>.
                </p>
              </div>
              {canMutate && (
                <button
                  type="button"
                  onClick={onOpenBranchVersion}
                  className="py-1.5 px-3 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-medium transition-colors shadow-sm"
                >
                  + Branch Version
                </button>
              )}
            </div>

            <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/20 text-xs text-blue-300 leading-relaxed">
              <span className="font-semibold">Backend Architectural Invariant:</span> In FastAPI v0.8.0, agent version
              records are historical snapshots initialized in <code className="font-mono px-1 py-0.5 rounded bg-blue-900/40 text-blue-200">DRAFT</code>.
              The root Agent entity governs the active operational model and environment. No HTTP publishing endpoint
              exists in the backend specification.
            </div>

            {isVersionsLoading ? (
              <div className="p-6 text-center text-xs text-gray-400 animate-pulse">Loading version history...</div>
            ) : versions.length === 0 ? (
              <div className="p-8 text-center rounded-xl bg-gray-950/40 border border-dashed border-gray-800 text-xs text-gray-500">
                No historical versions found for this agent.
              </div>
            ) : (
              <div className="divide-y divide-gray-800 border border-gray-800 rounded-xl bg-gray-950/60 overflow-hidden">
                {versions.map((ver) => (
                  <div key={ver.id} className="p-4 flex items-center justify-between hover:bg-gray-900/40 transition-colors">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-white">{ver.version}</span>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20">
                          {ver.status}
                        </span>
                      </div>
                      <div className="text-[11px] text-gray-400 mt-1">
                        Model: <span className="font-mono text-gray-300">{ver.model_provider}/{ver.model_name}</span>
                      </div>
                      <div className="text-[10px] text-gray-500 mt-0.5">
                        Recorded on {formatDate(ver.created_at)} • Creator: <span className="font-mono">{ver.created_by.slice(0, 8)}...</span>
                      </div>
                    </div>

                    {ver.system_configuration && (
                      <div className="text-right">
                        <span className="text-[10px] font-mono text-gray-400 px-2 py-1 rounded bg-gray-900 border border-gray-800">
                          Config Attached
                        </span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* PERMITTED TOOLS TAB */}
        {activeTab === "tools" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-xs font-semibold text-white">Bound Tool Permissions</h4>
                <p className="text-[11px] text-gray-400 mt-0.5">
                  Tools explicitly permitted for this agent. Queried via <code className="font-mono text-cyan-300">GET /api/v1/agents/{`{id}`}/tools</code>.
                </p>
              </div>
              {canMutate && (
                <button
                  type="button"
                  onClick={onOpenGrantTool}
                  className="py-1.5 px-3 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-medium transition-colors shadow-sm"
                >
                  + Grant Tool Access
                </button>
              )}
            </div>

            {isToolsLoading ? (
              <div className="p-6 text-center text-xs text-gray-400 animate-pulse">Loading tool bindings...</div>
            ) : toolPermissions.length === 0 ? (
              <div className="p-8 text-center rounded-xl bg-gray-950/40 border border-dashed border-gray-800 text-xs text-gray-500">
                No tool permissions are currently granted to this agent. Under default-deny governance, this agent cannot invoke any tools.
              </div>
            ) : (
              <div className="divide-y divide-gray-800 border border-gray-800 rounded-xl bg-gray-950/60 overflow-hidden">
                {toolPermissions.map((perm) => {
                  const toolObj = toolsMap.get(perm.tool_id);
                  return (
                    <div key={perm.tool_id} className="p-4 flex items-center justify-between hover:bg-gray-900/40 transition-colors">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-white">
                            {toolObj ? toolObj.name : `Tool ID: ${perm.tool_id.slice(0, 8)}...`}
                          </span>
                          {toolObj && (
                            <span className="font-mono text-[10px] text-gray-500">
                              ({toolObj.slug})
                            </span>
                          )}
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            Allowed
                          </span>
                        </div>
                        {toolObj?.description && (
                          <div className="text-[11px] text-gray-400 mt-0.5">{toolObj.description}</div>
                        )}
                        <div className="text-[10px] text-gray-500 mt-1">
                          Bound on {formatDate(perm.created_at)}
                        </div>
                      </div>

                      {canMutate && (
                        <button
                          type="button"
                          onClick={() => onRevokeTool(agent.id, perm.tool_id)}
                          className="py-1 px-2 rounded-lg bg-rose-600/10 hover:bg-rose-600/20 text-rose-400 border border-rose-500/20 text-xs font-medium transition-colors"
                        >
                          Revoke
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* EMPIRICAL TRUST PROFILE TAB */}
        {activeTab === "trust" && (
          <div className="space-y-4">
            <div>
              <h4 className="text-xs font-semibold text-white">Empirical Risk & Trust Profile</h4>
              <p className="text-[11px] text-gray-400 mt-0.5">
                Calculated from historical execution sessions and policy evaluations via <code className="font-mono text-cyan-300">GET /api/v1/risk/profiles/agents/{`{id}`}</code>.
              </p>
            </div>

            {isProfileLoading ? (
              <div className="p-6 text-center text-xs text-gray-400 animate-pulse">Calculating empirical trust profile...</div>
            ) : !trustProfile ? (
              <div className="p-8 text-center rounded-xl bg-gray-950/40 border border-dashed border-gray-800 text-xs text-gray-500">
                No active empirical risk profile data found for this agent. Run sessions will populate quantitative trust metrics.
              </div>
            ) : (
              <div className="space-y-4">
                {/* Composite Trust Card */}
                <div className="p-4 rounded-xl bg-gray-950/60 border border-gray-800/80 flex items-center justify-between">
                  <div>
                    <span className="text-xs text-gray-400 block mb-1">Empirical Trust Score</span>
                    <span className="text-2xl font-bold font-mono text-cyan-400">
                      {typeof trustProfile.trust_score === "number" ? trustProfile.trust_score.toFixed(1) : "—"}{" "}
                      <span className="text-xs text-gray-500 font-normal">/ 100</span>
                    </span>
                  </div>
                  <div>
                    <span className="text-xs text-gray-400 block mb-1">Evaluated Tier</span>
                    <span className="px-2.5 py-1 rounded text-xs font-bold border bg-cyan-500/10 text-cyan-400 border-cyan-500/20">
                      {String(trustProfile.assigned_tier || agent.risk_tier)}
                    </span>
                  </div>
                </div>

                {/* Empirical Stats Grid */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="p-3 rounded-xl bg-gray-950/60 border border-gray-800/80 text-center">
                    <span className="text-[10px] text-gray-400 uppercase tracking-wider block mb-1">
                      Total Invocations
                    </span>
                    <span className="font-mono text-base font-semibold text-white">
                      {String(trustProfile.total_invocations ?? 0)}
                    </span>
                  </div>
                  <div className="p-3 rounded-xl bg-gray-950/60 border border-gray-800/80 text-center">
                    <span className="text-[10px] text-gray-400 uppercase tracking-wider block mb-1">
                      Violations
                    </span>
                    <span className="font-mono text-base font-semibold text-rose-400">
                      {String(trustProfile.violation_count ?? 0)}
                    </span>
                  </div>
                  <div className="p-3 rounded-xl bg-gray-950/60 border border-gray-800/80 text-center">
                    <span className="text-[10px] text-gray-400 uppercase tracking-wider block mb-1">
                      Avg Risk Score
                    </span>
                    <span className="font-mono text-base font-semibold text-amber-400">
                      {typeof trustProfile.average_risk_score === "number"
                        ? trustProfile.average_risk_score.toFixed(2)
                        : "—"}
                    </span>
                  </div>
                </div>

                {/* Profile JSON viewer for deep inspection */}
                <div className="p-4 rounded-xl bg-gray-950 border border-gray-800/80">
                  <h5 className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-2">
                    Raw Profile Data
                  </h5>
                  <pre className="font-mono text-[11px] text-gray-300 overflow-x-auto p-2 bg-gray-900/50 rounded-lg max-h-48">
                    <code>{JSON.stringify(trustProfile, null, 2)}</code>
                  </pre>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
