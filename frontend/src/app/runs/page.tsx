"use client";

/**
 * Agent Runs & Execution Forensics Directory (Phase 9.6).
 *
 * Route: /runs
 * Page Access: ADMIN, SECURITY_ANALYST, AUDITOR, AGENT_OPERATOR (VIEWER: Denied HTTP 403)
 * Action Access: ADMIN, AGENT_OPERATOR (canManageRuns)
 */

import React, { useState } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { RoleGuard } from "@/components/auth/role-guard";
import { useAuth } from "@/components/auth/auth-context";
import { canManageRuns } from "@/lib/permissions";
import { RunsIcon } from "@/components/ui/icons";
import { useRuns } from "@/lib/runs/use-runs";
import { RunHistoryTable } from "@/components/runs/run-history-table";
import { RunsFilters } from "@/components/runs/runs-filters";
import { RunModal } from "@/components/runs/run-modal";

export default function RunsPage() {
  const { user } = useAuth();
  const isViewer = user?.role === "VIEWER";

  // If VIEWER, block immediately without dispatching any BFF calls
  if (isViewer) {
    return (
      <AppShell>
        <div className="flex flex-col items-center justify-center p-12 text-center my-12 max-w-xl mx-auto rounded-3xl bg-gray-900/60 border border-rose-500/20 shadow-2xl backdrop-blur-md">
          <div className="w-16 h-16 rounded-2xl bg-rose-500/10 text-rose-400 border border-rose-500/20 flex items-center justify-center mb-4">
            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
              />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-white tracking-tight">Access Restricted</h2>
          <p className="text-xs text-rose-300 font-medium mt-1">
            Execution Forensics Boundary Enforcement
          </p>
          <p className="text-xs text-gray-400 mt-3 leading-relaxed">
            In accordance with VERIDEX governance architecture and the backend v0.8.0 security matrix, the{" "}
            <span className="font-semibold text-gray-200">VIEWER</span> role is strictly denied access to execution
            sessions, tool invocation timelines, and forensic telemetry.
          </p>
        </div>
      </AppShell>
    );
  }

  return <AuthorizedRunsContent />;
}

function AuthorizedRunsContent() {
  const {
    runs,
    totalRuns,
    isLoading,
    error,
    refresh,

    // Filters
    agentIdFilter,
    setAgentIdFilter,
    statusFilter,
    setStatusFilter,

    // Operations
    createRun,
  } = useRuns();

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  // Compute stats
  const runningCount = runs.filter((r) => r.status === "RUNNING").length;
  const completedCount = runs.filter((r) => r.status === "COMPLETED").length;
  const failedCount = runs.filter((r) => r.status === "FAILED").length;

  return (
    <AppShell>
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 border-b border-gray-800">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/20">
              <RunsIcon className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl font-bold tracking-tight text-white">Execution Forensics</h2>
              <p className="text-xs text-gray-400 mt-0.5">
                Investigate agent execution sessions, step-by-step tool invocation audits, and governance decisions.
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
            check={canManageRuns}
            disabled
            disabledMessage="Initiating agent runs requires ADMIN or AGENT_OPERATOR role"
          >
            <button
              type="button"
              onClick={() => setIsCreateModalOpen(true)}
              className="py-2 px-4 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-medium text-xs transition-colors shadow-sm shadow-purple-600/20"
            >
              + Start Agent Run
            </button>
          </RoleGuard>
        </div>
      </div>

      {/* Summary KPI Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6">
        <div className="p-4 rounded-2xl bg-gray-900/60 border border-gray-800/80">
          <span className="text-[11px] font-medium text-gray-400 uppercase tracking-wider">Total Recorded</span>
          <div className="text-2xl font-bold font-mono text-white mt-1">{totalRuns}</div>
        </div>
        <div className="p-4 rounded-2xl bg-gray-900/60 border border-gray-800/80">
          <span className="text-[11px] font-medium text-gray-400 uppercase tracking-wider">Active Running</span>
          <div className="text-2xl font-bold font-mono text-blue-400 mt-1">{runningCount}</div>
        </div>
        <div className="p-4 rounded-2xl bg-gray-900/60 border border-gray-800/80">
          <span className="text-[11px] font-medium text-gray-400 uppercase tracking-wider">Completed</span>
          <div className="text-2xl font-bold font-mono text-emerald-400 mt-1">{completedCount}</div>
        </div>
        <div className="p-4 rounded-2xl bg-gray-900/60 border border-gray-800/80">
          <span className="text-[11px] font-medium text-gray-400 uppercase tracking-wider">Failed</span>
          <div className="text-2xl font-bold font-mono text-rose-400 mt-1">{failedCount}</div>
        </div>
      </div>

      {/* Filters Strip */}
      <div className="mt-6">
        <RunsFilters
          agentId={agentIdFilter}
          status={statusFilter}
          onAgentIdChange={setAgentIdFilter}
          onStatusChange={setStatusFilter}
          onReset={() => {
            setAgentIdFilter("");
            setStatusFilter("ALL");
          }}
        />
      </div>

      {error && (
        <div className="mt-4 p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-400">
          {error}
        </div>
      )}

      {/* Runs Table */}
      <div className="mt-6">
        <RunHistoryTable runs={runs} isLoading={isLoading} />
      </div>

      {/* Start Run Modal */}
      {isCreateModalOpen && (
        <RunModal
          isOpen={isCreateModalOpen}
          onClose={() => setIsCreateModalOpen(false)}
          onSubmitCreate={createRun}
        />
      )}
    </AppShell>
  );
}
