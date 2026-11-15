"use client";

import React from "react";
import type { FilterRunStatus } from "@/lib/runs/use-runs";

interface RunsFiltersProps {
  agentId: string;
  status: FilterRunStatus;
  onAgentIdChange: (val: string) => void;
  onStatusChange: (val: FilterRunStatus) => void;
  onReset: () => void;
}

export function RunsFilters({
  agentId,
  status,
  onAgentIdChange,
  onStatusChange,
  onReset,
}: RunsFiltersProps) {
  const hasActiveFilters = Boolean(agentId.trim()) || status !== "ALL";

  return (
    <div className="p-4 rounded-2xl bg-gray-900/60 border border-gray-800/80 flex flex-col md:flex-row md:items-center justify-between gap-4">
      <div className="flex flex-wrap items-center gap-3 flex-1">
        {/* Agent ID filter */}
        <div className="w-full sm:w-64">
          <input
            type="text"
            value={agentId}
            onChange={(e) => onAgentIdChange(e.target.value)}
            placeholder="Filter by Agent UUID..."
            className="w-full px-3 py-1.5 rounded-xl bg-gray-950 border border-gray-800 text-xs text-white placeholder-gray-500 font-mono focus:outline-none focus:border-purple-500"
          />
        </div>

        {/* Status Dropdown */}
        <div>
          <select
            value={status}
            onChange={(e) => onStatusChange(e.target.value as FilterRunStatus)}
            className="px-3 py-1.5 rounded-xl bg-gray-950 border border-gray-800 text-xs text-gray-300 focus:outline-none focus:border-purple-500"
          >
            <option value="ALL">All Run Statuses</option>
            <option value="RUNNING">Running</option>
            <option value="COMPLETED">Completed</option>
            <option value="FAILED">Failed</option>
            <option value="CANCELLED">Cancelled</option>
            <option value="PENDING">Pending</option>
          </select>
        </div>
      </div>

      {hasActiveFilters && (
        <button
          type="button"
          onClick={onReset}
          className="text-xs text-gray-400 hover:text-white px-3 py-1.5 rounded-xl bg-gray-800/60 hover:bg-gray-800 transition-colors"
        >
          Clear Filters
        </button>
      )}
    </div>
  );
}
