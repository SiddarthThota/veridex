/**
 * Policies Workbench Header & Sub-Navigation (Phase 9.5).
 */

"use client";

import React from "react";
import { RoleGuard } from "@/components/auth/role-guard";
import { canManagePolicies, canSimulatePolicies } from "@/lib/permissions";
import { PoliciesIcon } from "@/components/ui/icons";

interface PoliciesHeaderProps {
  activeTab: "registry" | "detail" | "simulation";
  onTabChange: (tab: "registry" | "detail" | "simulation") => void;
  hasSelectedPolicy: boolean;
  onNewPolicy: () => void;
  totalCount: number;
}

export function PoliciesHeader({
  activeTab,
  onTabChange,
  hasSelectedPolicy,
  onNewPolicy,
  totalCount,
}: PoliciesHeaderProps) {
  return (
    <div className="space-y-4 pb-6 border-b border-gray-800">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
            <PoliciesIcon className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
              <span>Governance Policy Management</span>
              <span className="text-xs font-mono font-medium px-2 py-0.5 rounded-full bg-gray-800 text-gray-400">
                {totalCount} Policies
              </span>
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">
              Declarative rule authoring, Google RE2 condition trees, immutable versioning, and dry-run simulation.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <RoleGuard
            check={canSimulatePolicies}
            disabled
            disabledMessage="VIEWER role is not authorized to simulate policies (HTTP 403)"
          >
            <button
              type="button"
              onClick={() => onTabChange("simulation")}
              className={`py-2 px-3.5 rounded-lg text-xs font-medium transition-colors border ${
                activeTab === "simulation"
                  ? "bg-indigo-600/20 text-indigo-300 border-indigo-500/40"
                  : "bg-gray-800 hover:bg-gray-700 text-gray-200 border-gray-700"
              }`}
            >
              ⚡ Simulation Studio
            </button>
          </RoleGuard>

          <RoleGuard check={canManagePolicies}>
            <button
              type="button"
              onClick={onNewPolicy}
              className="py-2 px-4 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs transition-colors shadow-sm shadow-indigo-600/30"
            >
              + New Policy
            </button>
          </RoleGuard>
        </div>
      </div>

      {/* Sub-Navigation Tabs */}
      <div className="flex items-center gap-2 pt-2">
        <button
          type="button"
          onClick={() => onTabChange("registry")}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            activeTab === "registry"
              ? "bg-gray-800 text-white shadow-xs"
              : "text-gray-400 hover:text-gray-200 hover:bg-gray-900"
          }`}
        >
          Policy Registry
        </button>

        {hasSelectedPolicy && (
          <button
            type="button"
            onClick={() => onTabChange("detail")}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              activeTab === "detail"
                ? "bg-gray-800 text-white shadow-xs"
                : "text-gray-400 hover:text-gray-200 hover:bg-gray-900"
            }`}
          >
            Policy Details & Versions
          </button>
        )}

        <button
          type="button"
          onClick={() => onTabChange("simulation")}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            activeTab === "simulation"
              ? "bg-gray-800 text-white shadow-xs"
              : "text-gray-400 hover:text-gray-200 hover:bg-gray-900"
          }`}
        >
          Dry-Run Simulation
        </button>
      </div>
    </div>
  );
}

