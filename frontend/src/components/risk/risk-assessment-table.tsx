/**
 * Risk Assessment Audit Explorer Table Component (Phase 9.5).
 *
 * Implements historical assessment log inspection with exact backend filter query parameters:
 * - agent_id
 * - tool_id
 * - risk_level (LOW, MEDIUM, HIGH, CRITICAL)
 * - start_date / end_date (ISO 8601)
 * - limit / offset pagination
 */

"use client";

import React from "react";
import type { RiskAssessmentResponse } from "@/types/risk";
import type { FilterRiskLevel } from "@/lib/risk/use-risk";
import { getScoreBand } from "@/lib/risk/risk-formatters";
import { RiskLevelBadge } from "./risk-level-badge";
import { RiskVectorBreakdown } from "./risk-vector-breakdown";

interface RiskAssessmentTableProps {
  assessments: RiskAssessmentResponse[];
  total: number;
  totalPages: number;
  page: number;
  pageSize: number;
  riskLevelFilter: FilterRiskLevel;
  agentFilter: string;
  toolFilter: string;
  startDateFilter: string;
  endDateFilter: string;
  loading: boolean;
  error: string | null;
  onRiskLevelChange: (level: FilterRiskLevel) => void;
  onAgentFilterChange: (agentId: string) => void;
  onToolFilterChange: (toolId: string) => void;
  onStartDateChange: (date: string) => void;
  onEndDateChange: (date: string) => void;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  onSelectAssessment: (assessmentId: string) => void;
  onResetFilters: () => void;
  onRetry: () => void;
}

export function RiskAssessmentTable({
  assessments,
  total,
  totalPages,
  page,
  pageSize,
  riskLevelFilter,
  agentFilter,
  toolFilter,
  startDateFilter,
  endDateFilter,
  loading,
  error,
  onRiskLevelChange,
  onAgentFilterChange,
  onToolFilterChange,
  onStartDateChange,
  onEndDateChange,
  onPageChange,
  onPageSizeChange,
  onSelectAssessment,
  onResetFilters,
  onRetry,
}: RiskAssessmentTableProps) {
  return (
    <div className="space-y-4">
      {/* Filter Toolbar */}
      <div className="p-4 rounded-xl bg-gray-900/60 border border-gray-800 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            {/* Risk Level Filter */}
            <div className="space-y-1">
              <label className="text-[11px] text-gray-400 block font-medium">Risk Level</label>
              <select
                value={riskLevelFilter}
                onChange={(e) => onRiskLevelChange(e.target.value as FilterRiskLevel)}
                className="bg-gray-950 border border-gray-800 text-gray-300 text-xs rounded-lg px-2.5 py-1.5 focus:border-indigo-500 focus:outline-none"
              >
                <option value="ALL">All Levels</option>
                <option value="LOW">Low (0–29)</option>
                <option value="MEDIUM">Medium (30–59)</option>
                <option value="HIGH">High (60–84)</option>
                <option value="CRITICAL">Critical (85–100)</option>
              </select>
            </div>

            {/* Agent ID Filter */}
            <div className="space-y-1">
              <label className="text-[11px] text-gray-400 block font-medium">Agent ID</label>
              <input
                type="text"
                value={agentFilter}
                onChange={(e) => onAgentFilterChange(e.target.value)}
                placeholder="Filter by agent UUID..."
                className="bg-gray-950 border border-gray-800 text-gray-300 text-xs rounded-lg px-2.5 py-1.5 font-mono focus:border-indigo-500 focus:outline-none w-44"
              />
            </div>

            {/* Tool ID Filter */}
            <div className="space-y-1">
              <label className="text-[11px] text-gray-400 block font-medium">Tool ID</label>
              <input
                type="text"
                value={toolFilter}
                onChange={(e) => onToolFilterChange(e.target.value)}
                placeholder="Filter by tool UUID..."
                className="bg-gray-950 border border-gray-800 text-gray-300 text-xs rounded-lg px-2.5 py-1.5 font-mono focus:border-indigo-500 focus:outline-none w-44"
              />
            </div>

            {/* Start Date */}
            <div className="space-y-1">
              <label className="text-[11px] text-gray-400 block font-medium">From Date</label>
              <input
                type="date"
                value={startDateFilter}
                onChange={(e) => onStartDateChange(e.target.value)}
                className="bg-gray-950 border border-gray-800 text-gray-300 text-xs rounded-lg px-2 py-1.5 focus:border-indigo-500 focus:outline-none"
              />
            </div>

            {/* End Date */}
            <div className="space-y-1">
              <label className="text-[11px] text-gray-400 block font-medium">To Date</label>
              <input
                type="date"
                value={endDateFilter}
                onChange={(e) => onEndDateChange(e.target.value)}
                className="bg-gray-950 border border-gray-800 text-gray-300 text-xs rounded-lg px-2 py-1.5 focus:border-indigo-500 focus:outline-none"
              />
            </div>
          </div>

          <div className="flex items-end">
            <button
              type="button"
              onClick={onResetFilters}
              className="text-xs px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white transition-colors"
            >
              Reset Filters
            </button>
          </div>
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-center justify-between">
          <span>{error}</span>
          <button
            type="button"
            onClick={onRetry}
            className="text-xs font-semibold underline hover:text-white"
          >
            Retry
          </button>
        </div>
      )}

      {/* Table Container */}
      <div className="overflow-x-auto rounded-2xl border border-gray-800 bg-gray-900/60 shadow-xs">
        <table className="w-full text-left text-xs text-gray-300">
          <thead className="bg-gray-950/80 text-[11px] uppercase tracking-wider text-gray-400 border-b border-gray-800">
            <tr>
              <th className="py-3 px-4 font-semibold">Assessed At</th>
              <th className="py-3 px-4 font-semibold">Risk Score & Band</th>
              <th className="py-3 px-4 font-semibold min-w-[180px]">4-Vector Decomposition</th>
              <th className="py-3 px-4 font-semibold">Agent / Tool</th>
              <th className="py-3 px-4 font-semibold">Heuristics</th>
              <th className="py-3 px-4 font-semibold text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800/80">
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="animate-pulse">
                  <td colSpan={6} className="py-4 px-4">
                    <div className="h-4 bg-gray-800/60 rounded w-2/3 mb-2" />
                    <div className="h-3 bg-gray-800/40 rounded w-1/4" />
                  </td>
                </tr>
              ))
            ) : assessments.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-12 text-center text-gray-500">
                  No risk assessments match the selected filter criteria.
                </td>
              </tr>
            ) : (
              assessments.map((a) => {
                const scoreInfo = getScoreBand(a.risk_score);
                const subscores = {
                  tool: a.subscore_tool,
                  data: a.subscore_data,
                  agent: a.subscore_agent,
                  context: a.subscore_context,
                };
                return (
                  <tr
                    key={a.id}
                    onClick={() => onSelectAssessment(a.id)}
                    className="hover:bg-gray-800/40 transition-colors cursor-pointer group"
                  >
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <div className="text-gray-200 font-medium">
                        {new Date(a.assessed_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                      </div>
                      <div className="text-[11px] text-gray-500">
                        {new Date(a.assessed_at).toLocaleDateString()}
                      </div>
                    </td>

                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <span className={`text-base font-black font-mono ${scoreInfo.color}`}>
                          {a.risk_score}
                        </span>
                        <RiskLevelBadge level={a.risk_level} />
                      </div>
                    </td>

                    <td className="py-3.5 px-4">
                      <RiskVectorBreakdown subscores={subscores} compact />
                    </td>

                    <td className="py-3.5 px-4 font-mono text-[11px]">
                      <div className="text-gray-300 truncate max-w-[160px]" title={a.agent_id}>
                        Agent: {a.agent_id.substring(0, 8)}...
                      </div>
                      <div className="text-gray-500 truncate max-w-[160px]" title={a.tool_id}>
                        Tool: {a.tool_id.substring(0, 8)}...
                      </div>
                    </td>

                    <td className="py-3.5 px-4">
                      {a.heuristics_matched?.length > 0 ? (
                        <span className="px-2 py-0.5 rounded bg-rose-500/10 text-rose-400 font-semibold text-[11px]">
                          {a.heuristics_matched.length} Matched
                        </span>
                      ) : (
                        <span className="text-gray-500 text-[11px]">None</span>
                      )}
                    </td>

                    <td className="py-3.5 px-4 text-right">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectAssessment(a.id);
                        }}
                        className="px-2.5 py-1 rounded bg-gray-800 hover:bg-gray-700 text-gray-200 font-medium text-xs transition-colors"
                      >
                        Inspect
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Footer */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-2 text-xs text-gray-400">
        <div>
          Showing {assessments.length} of {total} assessments (Page {page} of {totalPages})
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span>Per page:</span>
            <select
              value={pageSize}
              onChange={(e) => onPageSizeChange(parseInt(e.target.value, 10))}
              className="bg-gray-900 border border-gray-800 text-gray-300 rounded px-2 py-1 text-xs focus:outline-none"
            >
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => onPageChange(page - 1)}
              className="px-2.5 py-1 rounded bg-gray-900 hover:bg-gray-800 text-gray-300 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Previous
            </button>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => onPageChange(page + 1)}
              className="px-2.5 py-1 rounded bg-gray-900 hover:bg-gray-800 text-gray-300 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

