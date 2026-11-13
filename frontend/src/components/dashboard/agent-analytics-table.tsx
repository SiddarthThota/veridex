"use client";

/**
 * Paginated Agent Analytics Table for VERIDEX SecOps Dashboard (Phase 9.3).
 *
 * Implements:
 * - Agent identification (name, environment, truncated UUID).
 * - Invocation volumes and decision distribution (Allow, Deny, Require Approval).
 * - Historical denial rate percentage and calculated trust score.
 * - Accurately labeled average evaluation duration (avg_evaluation_duration_ms).
 * - Server-side pagination controls (page, total_pages, total_items).
 */

import React from "react";
import type { AgentAnalyticsResponse } from "@/types/analytics";
import {
  formatNumber,
  formatRate,
  formatScore,
  formatDurationMs,
} from "@/lib/analytics/analytics-formatters";
import { TableSkeleton } from "./dashboard-skeleton";
import { DashboardEmptyState, DashboardErrorCard } from "./dashboard-empty-state";

interface AgentAnalyticsTableProps {
  agents: {
    data: AgentAnalyticsResponse | null;
    loading: boolean;
    error: string | null;
  };
  currentPage: number;
  onPageChange: (newPage: number) => void;
  onRetry?: () => void;
}

export function AgentAnalyticsTable({
  agents,
  currentPage,
  onPageChange,
  onRetry,
}: AgentAnalyticsTableProps) {
  if (agents.loading) {
    return <TableSkeleton rows={4} />;
  }

  if (agents.error) {
    return (
      <DashboardErrorCard
        title="Failed to load Agent Analytics"
        error={agents.error}
        onRetry={onRetry}
      />
    );
  }

  const d = agents.data;
  const items = d?.items || [];
  const pagination = d?.pagination;

  if (items.length === 0) {
    return (
      <div className="p-6 rounded-2xl bg-gray-900/60 border border-gray-800/80">
        <h3 className="text-sm font-semibold text-white mb-2">Agent Fleet Analytics</h3>
        <DashboardEmptyState
          title="No agent records in selected interval"
          message="Agent telemetry and evaluation timings will populate as agents initiate governed runs."
        />
      </div>
    );
  }

  return (
    <div className="p-6 rounded-2xl bg-gray-900/60 border border-gray-800/80 hover:border-gray-700/80 transition-colors flex flex-col justify-between">
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold text-white">Agent Fleet Activity</h3>
            <p className="text-xs text-gray-400 mt-0.5">
              Governed agent throughput, historical denial rate, and average evaluation duration
            </p>
          </div>
          {pagination && (
            <span className="text-[11px] font-mono text-gray-400">
              Total {formatNumber(pagination.total_items)} agents
            </span>
          )}
        </div>

        {/* Responsive Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-gray-300">
            <thead>
              <tr className="border-b border-gray-800 text-gray-500 font-medium">
                <th scope="col" className="pb-3 pl-1">
                  Agent
                </th>
                <th scope="col" className="pb-3 text-right">
                  Invocations
                </th>
                <th scope="col" className="pb-3 text-right">
                  Decisions (A/D/R)
                </th>
                <th scope="col" className="pb-3 text-right">
                  Denial Rate
                </th>
                <th scope="col" className="pb-3 text-right">
                  Trust Score
                </th>
                <th scope="col" className="pb-3 text-right pr-1">
                  Avg Eval Duration
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/50 font-mono">
              {items.map((item) => (
                <tr key={item.agent_id} className="hover:bg-gray-950/40 transition-colors">
                  <td className="py-3 pl-1 font-sans">
                    <div className="font-medium text-gray-200">{item.agent_name}</div>
                    <div className="flex items-center gap-2 mt-0.5 text-[10px] text-gray-500">
                      <span className="font-mono">{item.agent_id.slice(0, 8)}...</span>
                      <span className="px-1.5 py-0.2 rounded-xs bg-gray-800 text-gray-400">
                        {item.agent_environment}
                      </span>
                    </div>
                  </td>
                  <td className="py-3 text-right font-medium text-gray-100">
                    {formatNumber(item.total_invocations)}
                  </td>
                  <td className="py-3 text-right text-[11px]">
                    <span className="text-emerald-400 font-medium">{item.allow_count}</span>
                    <span className="text-gray-600 mx-1">/</span>
                    <span className="text-rose-400 font-medium">{item.deny_count}</span>
                    <span className="text-gray-600 mx-1">/</span>
                    <span className="text-amber-400 font-medium">{item.require_approval_count}</span>
                  </td>
                  <td className="py-3 text-right">
                    <span
                      className={`px-2 py-0.5 rounded-full text-[11px] ${
                        (item.historical_denial_rate || 0) > 0.15
                          ? "bg-rose-500/10 text-rose-400"
                          : (item.historical_denial_rate || 0) > 0.05
                            ? "bg-amber-500/10 text-amber-400"
                            : "bg-emerald-500/10 text-emerald-400"
                      }`}
                    >
                      {formatRate(item.historical_denial_rate)}
                    </span>
                  </td>
                  <td className="py-3 text-right text-indigo-300 font-medium">
                    {formatScore(item.calculated_trust_score)}
                  </td>
                  <td className="py-3 text-right pr-1 text-gray-400">
                    {formatDurationMs(item.avg_evaluation_duration_ms)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination Controls */}
      {pagination && pagination.total_pages > 1 && (
        <div className="flex items-center justify-between pt-4 mt-2 border-t border-gray-800/60 text-xs">
          <span className="text-gray-500">
            Page {pagination.page} of {pagination.total_pages}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={currentPage <= 1}
              onClick={() => onPageChange(currentPage - 1)}
              className="px-2.5 py-1 rounded-md bg-gray-950 border border-gray-800 text-gray-300 hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Previous
            </button>
            <button
              type="button"
              disabled={currentPage >= pagination.total_pages}
              onClick={() => onPageChange(currentPage + 1)}
              className="px-2.5 py-1 rounded-md bg-gray-950 border border-gray-800 text-gray-300 hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

