"use client";

/**
 * Organization & User Directory (Phase 9.2 Shell).
 *
 * Route: /organization
 * Page Access: ADMIN, SECURITY_ANALYST, AUDITOR
 * Action Access: ADMIN (canManageUsers)
 */

import React from "react";
import { AppShell } from "@/components/layout/app-shell";
import { useAuth } from "@/components/auth/auth-context";
import { RoleBadge } from "@/components/ui/role-badge";
import { OrganizationIcon } from "@/components/ui/icons";

export default function OrganizationPage() {
  const { user, organization, isLoading } = useAuth();

  return (
    <AppShell>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 border-b border-gray-800">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-white">Organization & Users</h2>
          <p className="text-xs text-gray-400 mt-1">
            Tenant configuration, authorized security operators, and access credentials.
          </p>
        </div>
      </div>

      {/* Organization Details Card */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 p-6 rounded-2xl bg-gray-900/60 border border-gray-800/80 space-y-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              <OrganizationIcon className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white">Tenant Profile</h3>
              <p className="text-xs text-gray-400 font-mono">BFF /api/bff/organizations/my</p>
            </div>
          </div>

          <div className="space-y-3 pt-2 text-xs">
            <div>
              <span className="text-gray-500 block mb-0.5">Organization Name</span>
              <span className="text-gray-200 font-medium">
                {isLoading ? "Loading..." : organization?.name || "Veridex Enterprise Tenant"}
              </span>
            </div>
            <div>
              <span className="text-gray-500 block mb-0.5">Tenant ID</span>
              <span className="text-gray-300 font-mono text-[11px] break-all">
                {isLoading ? "..." : organization?.id || "tenant-default-001"}
              </span>
            </div>
            <div>
              <span className="text-gray-500 block mb-0.5">Your User Profile</span>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-gray-200 font-medium">{user?.email || "Signed In"}</span>
                {user?.role && <RoleBadge role={user.role} size="sm" />}
              </div>
            </div>
          </div>
        </div>

        {/* User Directory Roster Shell */}
        <div className="lg:col-span-2 p-6 rounded-2xl bg-gray-900/60 border border-gray-800/80">
          <h3 className="text-sm font-semibold text-white mb-1">Tenant Operators & Analysts</h3>
          <p className="text-xs text-gray-400 mb-6">
            Roster of users with access to this tenant across the 5 canonical roles.
          </p>

          <div className="p-8 text-center rounded-xl bg-gray-950/50 border border-dashed border-gray-800">
            <p className="text-sm text-gray-300 font-medium">Directory Synchronized</p>
            <p className="text-xs text-gray-500 mt-1 max-w-sm mx-auto">
              RBAC access permissions are strictly enforced on all API requests by the FastAPI gateway.
            </p>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

