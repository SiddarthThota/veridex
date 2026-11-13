"use client";

/**
 * Governed Tools Registry (Phase 9.2 Shell).
 *
 * Route: /tools
 * Page Access: ADMIN, SECURITY_ANALYST, AUDITOR, AGENT_OPERATOR, VIEWER
 * Action Access: ADMIN, SECURITY_ANALYST (canManageTools)
 */

import React from "react";
import { AppShell } from "@/components/layout/app-shell";
import { RoleGuard } from "@/components/auth/role-guard";
import { canManageTools } from "@/lib/permissions";
import { ToolsIcon } from "@/components/ui/icons";

export default function ToolsPage() {
  return (
    <AppShell>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 border-b border-gray-800">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-white">Governed Tools</h2>
          <p className="text-xs text-gray-400 mt-1">
            Standard and custom tool registry, risk classifications, schemas, and versioning.
          </p>
        </div>
        <div>
          <RoleGuard
            check={canManageTools}
            disabled
            disabledMessage="Registering or modifying tools requires ADMIN or SECURITY_ANALYST role"
          >
            <button
              type="button"
              className="py-2 px-4 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs transition-colors shadow-sm shadow-indigo-600/20"
            >
              Register Tool
            </button>
          </RoleGuard>
        </div>
      </div>

      {/* Tools Container */}
      <div className="p-6 rounded-2xl bg-gray-900/60 border border-gray-800/80">
        <div className="flex items-center gap-4 mb-6">
          <div className="p-3 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <ToolsIcon className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white">Tool Definition Catalog</h3>
            <p className="text-xs text-gray-400 mt-0.5">
              Audited endpoint: <code className="font-mono text-amber-300">GET /api/v1/tools</code>
            </p>
          </div>
        </div>

        <div className="p-12 text-center rounded-xl bg-gray-950/50 border border-dashed border-gray-800">
          <p className="text-sm text-gray-300 font-medium">Tool Definitions Catalogued</p>
          <p className="text-xs text-gray-500 mt-1 max-w-md mx-auto">
            Governed tool schemas and their sensitivity classifications will be displayed here.
          </p>
        </div>
      </div>
    </AppShell>
  );
}

