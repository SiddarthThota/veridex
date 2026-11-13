"use client";

/**
 * Agent Runs & Execution Audit Log (Phase 9.2 Shell).
 *
 * Route: /runs
 * Page Access: ADMIN, SECURITY_ANALYST, AUDITOR, AGENT_OPERATOR
 * Action Access: ADMIN, AGENT_OPERATOR (canManageRuns)
 */

import React from "react";
import { AppShell } from "@/components/layout/app-shell";
import { RoleGuard } from "@/components/auth/role-guard";
import { canManageRuns } from "@/lib/permissions";
import { RunsIcon } from "@/components/ui/icons";

export default function RunsPage() {
  return (
    <AppShell>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 border-b border-gray-800">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-white">Agent Runs & Invocations</h2>
          <p className="text-xs text-gray-400 mt-1">
            Complete telemetry and lifecycle tracking for active and historic AI agent runs.
          </p>
        </div>
        <div>
          <RoleGuard
            check={canManageRuns}
            disabled
            disabledMessage="Triggering or managing agent runs requires ADMIN or AGENT_OPERATOR role"
          >
            <button
              type="button"
              className="py-2 px-4 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs transition-colors shadow-sm shadow-indigo-600/20"
            >
              Start Agent Run
            </button>
          </RoleGuard>
        </div>
      </div>

      {/* Runs Shell Container */}
      <div className="p-6 rounded-2xl bg-gray-900/60 border border-gray-800/80">
        <div className="flex items-center gap-4 mb-6">
          <div className="p-3 rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/20">
            <RunsIcon className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white">Execution Audit Trail</h3>
            <p className="text-xs text-gray-400 mt-0.5">
              Audited endpoint: <code className="font-mono text-purple-300">GET /api/v1/runs</code>
            </p>
          </div>
        </div>

        {/* Empty state */}
        <div className="p-12 text-center rounded-xl bg-gray-950/50 border border-dashed border-gray-800">
          <p className="text-sm text-gray-300 font-medium">Ready for Agent Activity</p>
          <p className="text-xs text-gray-500 mt-1 max-w-md mx-auto">
            Governed runs, tool invocation traces, and evaluation latency timings will be logged here.
          </p>
        </div>
      </div>
    </AppShell>
  );
}

