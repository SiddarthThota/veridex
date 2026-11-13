"use client";

/**
 * Risk Assessment Engine & Configuration (Phase 9.2 Shell).
 *
 * Route: /risk
 * Page Access: ADMIN, SECURITY_ANALYST, AUDITOR, AGENT_OPERATOR, VIEWER
 * Action Access: ADMIN, SECURITY_ANALYST (canManageRiskConfig)
 */

import React from "react";
import { AppShell } from "@/components/layout/app-shell";
import { RoleGuard } from "@/components/auth/role-guard";
import { canManageRiskConfig } from "@/lib/permissions";
import { RiskIcon } from "@/components/ui/icons";

export default function RiskPage() {
  return (
    <AppShell>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 border-b border-gray-800">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-white">Risk Engine & Scoring</h2>
          <p className="text-xs text-gray-400 mt-1">
            Dynamic risk profiling, multi-dimensional threshold configuration, and score analytics.
          </p>
        </div>
        <div>
          <RoleGuard
            check={canManageRiskConfig}
            disabled
            disabledMessage="Creating risk configuration versions requires ADMIN or SECURITY_ANALYST role"
          >
            <button
              type="button"
              className="py-2 px-4 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs transition-colors shadow-sm shadow-indigo-600/20"
            >
              New Config Version
            </button>
          </RoleGuard>
        </div>
      </div>

      {/* Risk Container */}
      <div className="p-6 rounded-2xl bg-gray-900/60 border border-gray-800/80">
        <div className="flex items-center gap-4 mb-6">
          <div className="p-3 rounded-xl bg-rose-500/10 text-rose-400 border border-rose-500/20">
            <RiskIcon className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white">Dynamic Risk Calculation Engine</h3>
            <p className="text-xs text-gray-400 mt-0.5">
              Audited endpoint: <code className="font-mono text-rose-300">GET /api/v1/risk/config</code>
            </p>
          </div>
        </div>

        <div className="p-12 text-center rounded-xl bg-gray-950/50 border border-dashed border-gray-800">
          <p className="text-sm text-gray-300 font-medium">Risk Profiles & Formulas Initialized</p>
          <p className="text-xs text-gray-500 mt-1 max-w-md mx-auto">
            Configured weight matrices, blast radius thresholds, and composite risk scoring metrics are operational.
          </p>
        </div>
      </div>
    </AppShell>
  );
}

