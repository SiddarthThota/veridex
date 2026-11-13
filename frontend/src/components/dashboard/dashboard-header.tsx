"use client";

/**
 * Dashboard Header Component for VERIDEX SecOps Dashboard (Phase 9.3).
 *
 * Implements:
 * - Real-time operational context and active tenant display.
 * - Explicit, configurable auto-refresh cadence selector (Manual, 30s, 1m, 5m).
 * - Independent manual refresh trigger with animation.
 * - Last successfully retrieved UTC timestamp indicator.
 */

import React from "react";
import { useAuth } from "@/components/auth/auth-context";
import { RoleBadge } from "@/components/ui/role-badge";
import { formatDateTime } from "@/lib/analytics/analytics-formatters";

interface DashboardHeaderProps {
  lastUpdated: Date | null;
  isRefreshing: boolean;
  onRefresh: () => void;
  autoRefreshInterval: number;
  onSetAutoRefresh: (seconds: number) => void;
}

export function DashboardHeader({
  lastUpdated,
  isRefreshing,
  onRefresh,
  autoRefreshInterval,
  onSetAutoRefresh,
}: DashboardHeaderProps) {
  const { user, organization } = useAuth();

  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 border-b border-gray-800/80">
      <div>
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-bold tracking-tight text-white">Security Operations</h2>
          {user?.role && <RoleBadge role={user.role} size="sm" />}
        </div>
        <p className="text-xs text-gray-400 mt-1">
          Real-time governance telemetry and anomaly monitoring for{" "}
          <span className="text-gray-200 font-medium">
            {organization?.name || "Enterprise Tenant"}
          </span>
          .
        </p>
      </div>

      {/* Controls: Last Updated + Refresh Controls */}
      <div className="flex flex-wrap items-center gap-3 text-xs">
        {lastUpdated && (
          <span className="text-[11px] text-gray-500 font-mono hidden md:inline">
            Updated {formatDateTime(lastUpdated.toISOString())}
          </span>
        )}

        {/* Auto-refresh interval dropdown */}
        <div className="flex items-center gap-1.5 bg-gray-900 border border-gray-800 rounded-lg px-2.5 py-1.5">
          <span className="text-[11px] text-gray-400 font-medium">Refresh:</span>
          <select
            value={autoRefreshInterval}
            onChange={(e) => onSetAutoRefresh(Number(e.target.value))}
            className="bg-transparent text-gray-200 text-xs focus:outline-hidden cursor-pointer"
            aria-label="Automatic refresh interval"
          >
            <option value={0} className="bg-gray-900 text-gray-200">
              Manual
            </option>
            <option value={30} className="bg-gray-900 text-gray-200">
              30s
            </option>
            <option value={60} className="bg-gray-900 text-gray-200">
              1m
            </option>
            <option value={300} className="bg-gray-900 text-gray-200">
              5m
            </option>
          </select>
        </div>

        {/* Manual Refresh Button */}
        <button
          type="button"
          onClick={onRefresh}
          disabled={isRefreshing}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gray-900 hover:bg-gray-800 text-gray-200 border border-gray-800 font-medium transition-colors disabled:opacity-50"
          title="Manually fetch latest telemetry metrics"
        >
          <svg
            className={`w-3.5 h-3.5 text-gray-400 ${isRefreshing ? "animate-spin text-indigo-400" : ""}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            />
          </svg>
          <span>{isRefreshing ? "Fetching..." : "Refresh"}</span>
        </button>
      </div>
    </div>
  );
}

