"use client";

/**
 * Paginated Governed Tool Analytics Table (Phase 9.3).
 *
 * Implements:
 * - Tool identification (name, slug, truncated UUID).
 * - Invocation count and governance outcomes (Allow, Deny, Require Approval).
 * - Execution success, failure, and timeout metrics.
 * - Accurately labeled average evaluation and execution durations (avg_evaluation_duration_ms, avg_execution_duration_ms).
 * - Server-side pagination controls (page, total_pages, total_items).
 */

import React from "react";
import type { ToolUtilizationResponse } from "@/types/analytics";
import { formatNumber, formatDurationMs } from "@/lib/analytics/analytics-formatters";
import { TableSkeleton } from "./dashboard-skeleton";
import { DashboardEmptyState, DashboardErrorCard } from "./dashboard-empty-state";

interface ToolAnalyticsTableProps {
  tools: {
    data: ToolUtilizationResponse | null;
    loading: boolean;
    error: string | null;
  };
  currentPage: number;
  onPageChange: (newPage: number) => void;
  onRetry?: () => void;
}

export function ToolAnalyticsTable({
  tools,
  currentPage,
  onPageChange,
  onRetry,
}: ToolAnalyticsTableProps) {
  if (tools.loading) {
    return <TableSkeleton rows={4} />;
  }

  if (tools.error) {
    return (
      <DashboardErrorCard
        title="Failed to load Tool Analytics"
        error={tools.error}
        onRetry={onRetry}
      />
    );
  }

  const d = tools.data;
  const items = d?.items || [];
  const pagination = d?.pagination;

  if (items.length === 0) {
    return (
      <div className="p-6 rounded-2xl bg-gray-900/60 border border-gray-800/80">
        <h3 className="text-sm font-semibold text-white mb-2">Governed Tool Utilization</h3>
        <DashboardEmptyState
          title="No tool executions in selected interval"
          message="Tool telemetry and execution outcomes will appear here as AI agents invoke registered tools."
        />
      </div>
    );
  }

  return (
    <div className="p-6 rounded-2xl bg-gray-900/60 border border-gray-800/80 hover:border-gray-700/80 transition-colors flex flex-col justify-between">
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold text-white">Governed Tool Utilization</h3>
            <p className="text-xs text-gray-400 mt-0.5">
              Tool invocation frequency, execution success rates, and average latency
            </p>
          </div>
          {pagination && (
            <span className="text-[11px] font-mono text-gray-400">
              Total {formatNumber(pagination.total_items)} tools
            </span>
          )}
        </div>

        {/* Responsive Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-gray-300">
            <thead>
              <tr className="border-b border-gray-800 text-gray-500 font-medium">
                <th scope="col" className="pb-3 pl-1">
                  Tool
                </th>
                <th scope="col" className="pb-3 text-right">
                  Invocations
                </th>
                <th scope="col" className="pb-3 text-right">
                  Outcomes (A/D/R)
                </th>
                <th scope="col" className="pb-3 text-right">
                  Execution (S/F/T)
                </th>
                <th scope="col" className="pb-3 text-right">
                  Avg Eval
                </th>
                <th scope="col" className="pb-3 text-right pr-1">
                  Avg Exec
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/50 font-mono">
              {items.map((item) => (
                <tr key={item.tool_id} className="hover:bg-gray-950/40 transition-colors">
                  <td className="py-3 pl-1 font-sans">
                    <div className="font-medium text-gray-200">{item.tool_name}</div>
                    <div className="text-[10px] text-gray-500 font-mono mt-0.5">
                      {item.tool_slug}
                    </div>
                  </td>
                  <td className="py-3 text-right font-medium text-gray-100">
                    {formatNumber(item.invocation_count)}
                  </td>
                  <td className="py-3 text-right text-[11px]">
                    <span className="text-emerald-400 font-medium">{item.allow_count}</span>
                    <span className="text-gray-600 mx-1">/</span>
                    <span className="text-rose-400 font-medium">{item.deny_count}</span>
                    <span className="text-gray-600 mx-1">/</span>
                    <span className="text-amber-400 font-medium">{item.require_approval_count}</span>
                  </td>
                  <td className="py-3 text-right text-[11px]">
                    <span className="text-emerald-400 font-medium">{item.execution_success_count}</span>
                    <span className="text-gray-600 mx-1">/</span>
                    <span className="text-rose-400 font-medium">{item.execution_failed_count}</span>
                    <span className="text-gray-600 mx-1">/</span>
                    <span className="text-amber-400 font-medium">{item.execution_timeout_count}</span>
                  </td>
                  <td className="py-3 text-right text-gray-400">
                    {formatDurationMs(item.avg_evaluation_duration_ms)}
                  </td>
                  <td className="py-3 text-right pr-1 text-gray-400">
                    {formatDurationMs(item.avg_execution_duration_ms)}
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

