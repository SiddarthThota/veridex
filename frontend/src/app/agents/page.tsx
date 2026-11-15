"use client";

/**
 * Agent Fleet Registry Workbench (Phase 9.6).
 *
 * Route: /agents
 * Page Access: All 5 canonical roles (ADMIN, SECURITY_ANALYST, AUDITOR, AGENT_OPERATOR, VIEWER)
 * Mutation Access: ADMIN, AGENT_OPERATOR (canManageAgents)
 */

import React, { useState } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { RoleGuard } from "@/components/auth/role-guard";
import { canManageAgents } from "@/lib/permissions";
import { AgentsIcon } from "@/components/ui/icons";
import { useAgents } from "@/lib/agents/use-agents";
import { AgentRosterTable } from "@/components/agents/agent-roster-table";
import { AgentDetailDrawer } from "@/components/agents/agent-detail-drawer";
import { AgentModal } from "@/components/agents/agent-modal";
import { AgentVersionModal } from "@/components/agents/agent-version-modal";
import { AgentToolPermissionDialog } from "@/components/agents/agent-tool-permission-dialog";
import type { AgentEnvironment, AgentResponse, AgentRiskTier, AgentStatus } from "@/types/agents";

export default function AgentsPage() {
  const {
    agents,
    rawAgents,
    isLoading,
    error,
    refresh,

    // Filters
    statusFilter,
    setStatusFilter,
    environmentFilter,
    setEnvironmentFilter,
    riskTierFilter,
    setRiskTierFilter,
    searchQuery,
    setSearchQuery,

    // Selected Agent & Drawer
    selectedAgent,
    selectAgent,
    isDetailLoading,
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
  } = useAgents();

  // Modals state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editingAgent, setEditingAgent] = useState<AgentResponse | null>(null);
  const [isBranchModalOpen, setIsBranchModalOpen] = useState(false);
  const [isGrantToolOpen, setIsGrantToolOpen] = useState(false);

  // Compute summary stats
  const activeCount = rawAgents.filter((a) => a.status === "ACTIVE").length;
  const draftCount = rawAgents.filter((a) => a.status === "DRAFT").length;
  const suspendedCount = rawAgents.filter((a) => a.status === "SUSPENDED").length;

  return (
    <AppShell>
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 border-b border-gray-800">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
              <AgentsIcon className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl font-bold tracking-tight text-white">Agent Fleet Registry</h2>
              <p className="text-xs text-gray-400 mt-0.5">
                Authoritative catalog of registered AI agents, active model bindings, immutable version snapshots, and tool permissions.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => refresh()}
            className="py-2 px-3 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white text-xs font-medium transition-colors"
          >
            Refresh
          </button>

          <RoleGuard
            check={canManageAgents}
            disabled
            disabledMessage="Registering new agents requires ADMIN or AGENT_OPERATOR role"
          >
            <button
              type="button"
              onClick={() => setIsCreateModalOpen(true)}
              className="py-2 px-4 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-medium text-xs transition-colors shadow-sm shadow-cyan-600/20"
            >
              + Register Agent
            </button>
          </RoleGuard>
        </div>
      </div>

      {/* Summary KPI Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6">
        <div className="p-4 rounded-2xl bg-gray-900/60 border border-gray-800/80">
          <span className="text-[11px] font-medium text-gray-400 uppercase tracking-wider">Total Agents</span>
          <div className="text-2xl font-bold font-mono text-white mt-1">{rawAgents.length}</div>
        </div>
        <div className="p-4 rounded-2xl bg-gray-900/60 border border-gray-800/80">
          <span className="text-[11px] font-medium text-gray-400 uppercase tracking-wider">Active</span>
          <div className="text-2xl font-bold font-mono text-emerald-400 mt-1">{activeCount}</div>
        </div>
        <div className="p-4 rounded-2xl bg-gray-900/60 border border-gray-800/80">
          <span className="text-[11px] font-medium text-gray-400 uppercase tracking-wider">Draft</span>
          <div className="text-2xl font-bold font-mono text-gray-400 mt-1">{draftCount}</div>
        </div>
        <div className="p-4 rounded-2xl bg-gray-900/60 border border-gray-800/80">
          <span className="text-[11px] font-medium text-gray-400 uppercase tracking-wider">Suspended</span>
          <div className="text-2xl font-bold font-mono text-amber-400 mt-1">{suspendedCount}</div>
        </div>
      </div>

      {/* Filters Strip */}
      <div className="mt-6 p-4 rounded-2xl bg-gray-900/60 border border-gray-800/80 flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Search */}
        <div className="w-full md:w-72">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search agents by name, slug, model..."
            className="w-full px-3 py-1.5 rounded-xl bg-gray-950 border border-gray-800 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500"
          />
        </div>

        {/* Filter Dropdowns */}
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as "ALL" | AgentStatus)}
            className="px-3 py-1.5 rounded-xl bg-gray-950 border border-gray-800 text-xs text-gray-300 focus:outline-none focus:border-cyan-500"
          >
            <option value="ALL">All Statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="DRAFT">Draft</option>
            <option value="SUSPENDED">Suspended</option>
            <option value="DEACTIVATED">Deactivated</option>
          </select>

          <select
            value={environmentFilter}
            onChange={(e) => setEnvironmentFilter(e.target.value as "ALL" | AgentEnvironment)}
            className="px-3 py-1.5 rounded-xl bg-gray-950 border border-gray-800 text-xs text-gray-300 focus:outline-none focus:border-cyan-500"
          >
            <option value="ALL">All Environments</option>
            <option value="DEVELOPMENT">Development</option>
            <option value="STAGING">Staging</option>
            <option value="PRODUCTION">Production</option>
          </select>

          <select
            value={riskTierFilter}
            onChange={(e) => setRiskTierFilter(e.target.value as "ALL" | AgentRiskTier)}
            className="px-3 py-1.5 rounded-xl bg-gray-950 border border-gray-800 text-xs text-gray-300 focus:outline-none focus:border-cyan-500"
          >
            <option value="ALL">All Risk Tiers</option>
            <option value="TIER_1">Tier 1 (Low)</option>
            <option value="TIER_2">Tier 2 (Moderate)</option>
            <option value="TIER_3">Tier 3 (High)</option>
            <option value="TIER_4">Tier 4 (Critical)</option>
          </select>
        </div>
      </div>

      {error && (
        <div className="mt-4 p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-400">
          {error}
        </div>
      )}

      {/* Agents Roster Table */}
      <div className="mt-6">
        <AgentRosterTable
          agents={agents}
          isLoading={isLoading}
          onSelectAgent={(agent) => selectAgent(agent)}
          onActivate={activateAgent}
          onSuspend={suspendAgent}
          onDeactivate={deactivateAgent}
        />
      </div>

      {/* Agent Detail Drawer */}
      <AgentDetailDrawer
        agent={selectedAgent}
        isOpen={Boolean(selectedAgent)}
        isLoading={isDetailLoading}
        versions={versions}
        isVersionsLoading={isVersionsLoading}
        toolPermissions={toolPermissions}
        availableTools={availableTools}
        isToolsLoading={isToolsLoading}
        trustProfile={trustProfile}
        isProfileLoading={isProfileLoading}
        onClose={() => selectAgent(null)}
        onEdit={(agent) => setEditingAgent(agent)}
        onActivate={activateAgent}
        onSuspend={suspendAgent}
        onDeactivate={deactivateAgent}
        onOpenBranchVersion={() => setIsBranchModalOpen(true)}
        onOpenGrantTool={() => setIsGrantToolOpen(true)}
        onRevokeTool={revokeTool}
      />

      {/* Create / Edit Agent Modal */}
      {(isCreateModalOpen || editingAgent) && (
        <AgentModal
          isOpen={isCreateModalOpen || Boolean(editingAgent)}
          initialAgent={editingAgent}
          onClose={() => {
            setIsCreateModalOpen(false);
            setEditingAgent(null);
          }}
          onSubmitCreate={createAgent}
          onSubmitUpdate={updateAgent}
        />
      )}

      {/* Branch Agent Version Modal */}
      {isBranchModalOpen && selectedAgent && (
        <AgentVersionModal
          isOpen={isBranchModalOpen}
          agent={selectedAgent}
          onClose={() => setIsBranchModalOpen(false)}
          onSubmit={(versionString, payload) => branchVersion(selectedAgent.id, versionString, payload)}
        />
      )}

      {/* Grant Tool Permission Dialog */}
      {isGrantToolOpen && selectedAgent && (
        <AgentToolPermissionDialog
          isOpen={isGrantToolOpen}
          agent={selectedAgent}
          currentPermissions={toolPermissions}
          availableTools={availableTools}
          onClose={() => setIsGrantToolOpen(false)}
          onGrantTool={(toolId) => grantTool(selectedAgent.id, toolId)}
        />
      )}
    </AppShell>
  );
}
