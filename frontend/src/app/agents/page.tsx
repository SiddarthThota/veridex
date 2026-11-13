"use client";

/**
 * Registered AI Agents Directory (Phase 9.2 Shell).
 *
 * Route: /agents
 * Page Access: ADMIN, SECURITY_ANALYST, AUDITOR, AGENT_OPERATOR, VIEWER
 * Action Access: ADMIN, AGENT_OPERATOR (canManageAgents)
 */

import React from "react";
import { AppShell } from "@/components/layout/app-shell";
import { RoleGuard } from "@/components/auth/role-guard";
import { canManageAgents } from "@/lib/permissions";
import { AgentsIcon } from "@/components/ui/icons";

export default function AgentsPage() {
  return (
    <AppShell>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 border-b border-gray-800">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-white">Registered Agents</h2>
          <p className="text-xs text-gray-400 mt-1">
            Governed AI agent profiles, risk tier assignments, and permitted tool bindings.
          </p>
        </div>
        <div>
          <RoleGuard
            check={canManageAgents}
            disabled
            disabledMessage="Registering new agents requires ADMIN or AGENT_OPERATOR role"
          >
            <button
              type="button"
              className="py-2 px-4 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs transition-colors shadow-sm shadow-indigo-600/20"
            >
              Register Agent
            </button>
          </RoleGuard>
        </div>
      </div>

      {/* Agents Registry Container */}
      <div className="p-6 rounded-2xl bg-gray-900/60 border border-gray-800/80">
        <div className="flex items-center gap-4 mb-6">
          <div className="p-3 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
            <AgentsIcon className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white">Agent Fleet Registry</h3>
            <p className="text-xs text-gray-400 mt-0.5">
              Audited endpoint: <code className="font-mono text-cyan-300">GET /api/v1/agents</code>
            </p>
          </div>
        </div>

        <div className="p-12 text-center rounded-xl bg-gray-950/50 border border-dashed border-gray-800">
          <p className="text-sm text-gray-300 font-medium">Fleet Roster Active</p>
          <p className="text-xs text-gray-500 mt-1 max-w-md mx-auto">
            Configured agents and their real-time operational status will be catalogued in this registry.
          </p>
        </div>
      </div>
    </AppShell>
  );
}

