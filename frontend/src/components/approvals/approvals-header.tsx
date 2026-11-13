/**
 * Header Component for Approvals Queue (Phase 9.4).
 */

import React from "react";
import { formatRelativeTime } from "@/lib/approvals/approvals-formatters";

interface ApprovalsHeaderProps {
  pendingCount: number;
  totalCount: number;
  loading: boolean;
  lastUpdated: Date | null;
  autoRefreshInterval: number;
  onAutoRefreshChange: (seconds: number) => void;
  onRefresh: () => void;
}

export function ApprovalsHeader({
  pendingCount,
  loading,
  lastUpdated,
  autoRefreshInterval,
  onAutoRefreshChange,
  onRefresh,
}: ApprovalsHeaderProps) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 border-b border-gray-800">
      <div>
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-bold tracking-tight text-white">Approvals Review Queue</h2>
          {pendingCount > 0 ? (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
              {pendingCount} Pending
            </span>
          ) : (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              Queue Clear
            </span>
          )}
        </div>
        <p className="text-xs text-gray-400 mt-1">
          Human-in-the-loop governance review for gated and high-risk agent tool invocations.
        </p>
      </div>

      <div className="flex items-center gap-3 self-start sm:self-auto">
        {/* Auto Refresh Cadence Selector */}
        <div className="flex items-center gap-1.5 bg-gray-900/80 border border-gray-800 rounded-lg px-2.5 py-1 text-xs">
          <span className="text-gray-500">Auto:</span>
          <select
            value={autoRefreshInterval}
            onChange={(e) => onAutoRefreshChange(Number(e.target.value))}
            className="bg-transparent text-gray-300 focus:outline-none cursor-pointer"
            aria-label="Auto refresh interval"
          >
            <option value={0} className="bg-gray-900 text-gray-300">Off</option>
            <option value={15} className="bg-gray-900 text-gray-300">15s</option>
            <option value={30} className="bg-gray-900 text-gray-300">30s</option>
            <option value={60} className="bg-gray-900 text-gray-300">60s</option>
          </select>
        </div>

        {/* Last updated indicator */}
        {lastUpdated && (
          <span className="text-xs text-gray-500 hidden md:inline">
            Updated {formatRelativeTime(lastUpdated.toISOString())}
          </span>
        )}

        {/* Manual Refresh Button */}
        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          aria-label="Refresh approvals queue"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-800/80 hover:bg-gray-700/80 text-gray-300 hover:text-white text-xs font-medium border border-gray-700/50 transition-colors disabled:opacity-50"
        >
          <svg
            className={`w-3.5 h-3.5 ${loading ? "animate-spin text-indigo-400" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            />
          </svg>
          <span>Refresh</span>
        </button>
      </div>
    </div>
  );
}

