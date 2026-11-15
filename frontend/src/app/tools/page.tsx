"use client";

/**
 * Governed Tool Catalog Workbench (Phase 9.6).
 *
 * Route: /tools
 * Page Access: All 5 canonical roles (ADMIN, SECURITY_ANALYST, AUDITOR, AGENT_OPERATOR, VIEWER)
 * Mutation Access: ADMIN, SECURITY_ANALYST (canManageTools)
 */

import React, { useState } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { RoleGuard } from "@/components/auth/role-guard";
import { canManageTools } from "@/lib/permissions";
import { ToolsIcon } from "@/components/ui/icons";
import { useTools } from "@/lib/tools/use-tools";
import { ToolCatalogTable } from "@/components/tools/tool-catalog-table";
import { ToolDetailDrawer } from "@/components/tools/tool-detail-drawer";
import { ToolModal } from "@/components/tools/tool-modal";
import { ToolVersionModal } from "@/components/tools/tool-version-modal";
import { PublishToolVersionDialog } from "@/components/tools/publish-tool-version-dialog";
import type { ToolAccessType, ToolResponse, ToolRiskLevel, ToolStatus, ToolVersionResponse } from "@/types/tools";

export default function ToolsPage() {
  const {
    tools,
    rawTools,
    isLoading,
    error,
    refresh,

    // Filters
    statusFilter,
    setStatusFilter,
    riskLevelFilter,
    setRiskLevelFilter,
    accessTypeFilter,
    setAccessTypeFilter,
    searchQuery,
    setSearchQuery,

    // Selected Tool & Drawer
    selectedTool,
    selectTool,
    isDetailLoading,
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
  } = useTools();

  // Modals state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editingTool, setEditingTool] = useState<ToolResponse | null>(null);
  const [isCreateVersionOpen, setIsCreateVersionOpen] = useState(false);
  const [publishingVersion, setPublishingVersion] = useState<ToolVersionResponse | null>(null);

  // Compute summary stats
  const activeCount = rawTools.filter((t) => t.status === "ACTIVE").length;
  const criticalOrHighCount = rawTools.filter((t) => t.risk_level === "CRITICAL" || t.risk_level === "HIGH").length;
  const mutatingCount = rawTools.filter((t) => t.access_type === "WRITE").length;

  return (
    <AppShell>
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 border-b border-gray-800">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
              <ToolsIcon className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl font-bold tracking-tight text-white">Governed Tool Catalog</h2>
              <p className="text-xs text-gray-400 mt-0.5">
                Authoritative registry of standard and custom tools, sensitivity classifications, JSON schemas, and version lifecycles.
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
            check={canManageTools}
            disabled
            disabledMessage="Registering or modifying tools requires ADMIN or SECURITY_ANALYST role"
          >
            <button
              type="button"
              onClick={() => setIsCreateModalOpen(true)}
              className="py-2 px-4 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-medium text-xs transition-colors shadow-sm shadow-amber-600/20"
            >
              + Register Tool
            </button>
          </RoleGuard>
        </div>
      </div>

      {/* Summary KPI Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6">
        <div className="p-4 rounded-2xl bg-gray-900/60 border border-gray-800/80">
          <span className="text-[11px] font-medium text-gray-400 uppercase tracking-wider">Total Cataloged</span>
          <div className="text-2xl font-bold font-mono text-white mt-1">{rawTools.length}</div>
        </div>
        <div className="p-4 rounded-2xl bg-gray-900/60 border border-gray-800/80">
          <span className="text-[11px] font-medium text-gray-400 uppercase tracking-wider">Active Tools</span>
          <div className="text-2xl font-bold font-mono text-emerald-400 mt-1">{activeCount}</div>
        </div>
        <div className="p-4 rounded-2xl bg-gray-900/60 border border-gray-800/80">
          <span className="text-[11px] font-medium text-gray-400 uppercase tracking-wider">High / Critical Risk</span>
          <div className="text-2xl font-bold font-mono text-rose-400 mt-1">{criticalOrHighCount}</div>
        </div>
        <div className="p-4 rounded-2xl bg-gray-900/60 border border-gray-800/80">
          <span className="text-[11px] font-medium text-gray-400 uppercase tracking-wider">Write (Mutating)</span>
          <div className="text-2xl font-bold font-mono text-amber-400 mt-1">{mutatingCount}</div>
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
            placeholder="Search tools by name, slug, description..."
            className="w-full px-3 py-1.5 rounded-xl bg-gray-950 border border-gray-800 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-amber-500"
          />
        </div>

        {/* Filter Dropdowns */}
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as "ALL" | ToolStatus)}
            className="px-3 py-1.5 rounded-xl bg-gray-950 border border-gray-800 text-xs text-gray-300 focus:outline-none focus:border-amber-500"
          >
            <option value="ALL">All Statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="DRAFT">Draft</option>
            <option value="SUSPENDED">Suspended</option>
            <option value="DEACTIVATED">Deactivated</option>
          </select>

          <select
            value={riskLevelFilter}
            onChange={(e) => setRiskLevelFilter(e.target.value as "ALL" | ToolRiskLevel)}
            className="px-3 py-1.5 rounded-xl bg-gray-950 border border-gray-800 text-xs text-gray-300 focus:outline-none focus:border-amber-500"
          >
            <option value="ALL">All Risk Levels</option>
            <option value="LOW">Low Risk</option>
            <option value="MEDIUM">Medium Risk</option>
            <option value="HIGH">High Risk</option>
            <option value="CRITICAL">Critical Risk</option>
          </select>

          <select
            value={accessTypeFilter}
            onChange={(e) => setAccessTypeFilter(e.target.value as "ALL" | ToolAccessType)}
            className="px-3 py-1.5 rounded-xl bg-gray-950 border border-gray-800 text-xs text-gray-300 focus:outline-none focus:border-amber-500"
          >
            <option value="ALL">All Access Types</option>
            <option value="READ">Read Only</option>
            <option value="WRITE">Write (Mutating)</option>
          </select>
        </div>
      </div>

      {error && (
        <div className="mt-4 p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-400">
          {error}
        </div>
      )}

      {/* Tools Catalog Table */}
      <div className="mt-6">
        <ToolCatalogTable
          tools={tools}
          isLoading={isLoading}
          onSelectTool={(tool) => selectTool(tool)}
          onActivate={activateTool}
          onSuspend={suspendTool}
          onDeactivate={deactivateTool}
        />
      </div>

      {/* Tool Detail Drawer */}
      <ToolDetailDrawer
        tool={selectedTool}
        isOpen={Boolean(selectedTool)}
        isLoading={isDetailLoading}
        versions={versions}
        isVersionsLoading={isVersionsLoading}
        onClose={() => selectTool(null)}
        onEdit={(tool) => setEditingTool(tool)}
        onActivate={activateTool}
        onSuspend={suspendTool}
        onDeactivate={deactivateTool}
        onOpenCreateVersion={() => setIsCreateVersionOpen(true)}
        onOpenPublishVersion={(ver) => setPublishingVersion(ver)}
      />

      {/* Create / Edit Tool Modal */}
      {(isCreateModalOpen || editingTool) && (
        <ToolModal
          isOpen={isCreateModalOpen || Boolean(editingTool)}
          initialTool={editingTool}
          onClose={() => {
            setIsCreateModalOpen(false);
            setEditingTool(null);
          }}
          onSubmitCreate={createTool}
          onSubmitUpdate={updateTool}
        />
      )}

      {/* Author Tool Version Modal */}
      {isCreateVersionOpen && selectedTool && (
        <ToolVersionModal
          isOpen={isCreateVersionOpen}
          tool={selectedTool}
          onClose={() => setIsCreateVersionOpen(false)}
          onSubmit={(payload) => createVersion(selectedTool.id, payload)}
        />
      )}

      {/* Publish Tool Version Confirmation Dialog */}
      {publishingVersion && selectedTool && (
        <PublishToolVersionDialog
          isOpen={Boolean(publishingVersion)}
          tool={selectedTool}
          version={publishingVersion}
          onClose={() => setPublishingVersion(null)}
          onConfirmPublish={() => publishVersion(selectedTool.id, publishingVersion.id)}
        />
      )}
    </AppShell>
  );
}
