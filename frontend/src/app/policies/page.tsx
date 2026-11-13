"use client";

/**
 * Governance Policy Management & Simulation (Phase 9.2 Shell).
 *
 * Route: /policies
 * Page Access: ADMIN, SECURITY_ANALYST, AUDITOR, AGENT_OPERATOR, VIEWER
 * Action Access:
 * - Create/Edit: ADMIN, SECURITY_ANALYST (canManagePolicies)
 * - Simulate: ADMIN, SECURITY_ANALYST, AUDITOR, AGENT_OPERATOR (canSimulatePolicies)
 */

import React from "react";
import { AppShell } from "@/components/layout/app-shell";
import { RoleGuard } from "@/components/auth/role-guard";
import { canManagePolicies, canSimulatePolicies } from "@/lib/permissions";
import { PoliciesIcon } from "@/components/ui/icons";

export default function PoliciesPage() {
  return (
    <AppShell>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 border-b border-gray-800">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-white">Governance Policies</h2>
          <p className="text-xs text-gray-400 mt-1">
            Declarative condition trees, enforcement actions, and offline policy simulation.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <RoleGuard
            check={canSimulatePolicies}
            disabled
            disabledMessage="Simulating policies requires an operational role"
          >
            <button
              type="button"
              className="py-2 px-3.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-200 font-medium text-xs transition-colors border border-gray-700"
            >
              Simulate Rule
            </button>
          </RoleGuard>
          <RoleGuard
            check={canManagePolicies}
            disabled
            disabledMessage="Authoring policies requires ADMIN or SECURITY_ANALYST role"
          >
            <button
              type="button"
              className="py-2 px-4 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs transition-colors shadow-sm shadow-indigo-600/20"
            >
              New Policy Rule
            </button>
          </RoleGuard>
        </div>
      </div>

      {/* Policies Container */}
      <div className="p-6 rounded-2xl bg-gray-900/60 border border-gray-800/80">
        <div className="flex items-center gap-4 mb-6">
          <div className="p-3 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <PoliciesIcon className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white">Active Policy Rule Hierarchy</h3>
            <p className="text-xs text-gray-400 mt-0.5">
              Audited endpoint: <code className="font-mono text-emerald-300">GET /api/v1/policies</code>
            </p>
          </div>
        </div>

        <div className="p-12 text-center rounded-xl bg-gray-950/50 border border-dashed border-gray-800">
          <p className="text-sm text-gray-300 font-medium">Policy Engine Configured</p>
          <p className="text-xs text-gray-500 mt-1 max-w-md mx-auto">
            Governance rules, deterministic boolean condition trees, and gate triggers are enforced on all tool invocations.
          </p>
        </div>
      </div>
    </AppShell>
  );
}

