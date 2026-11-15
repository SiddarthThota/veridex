"use client";

import React from "react";
import Link from "next/link";
import type { AgentRunResponse } from "@/types/runs";
import { RunStatusBadge } from "./run-status-badge";
import { formatDate } from "@/lib/runs/runs-formatters";
import { formatEnvironment } from "@/lib/agents/agents-formatters";

interface RunHistoryTableProps {
  runs: AgentRunResponse[];
  isLoading: boolean;
  onSelectRun?: (run: AgentRunResponse) => void;
}

export function RunHistoryTable({ runs, isLoading, onSelectRun }: RunHistoryTableProps) {
  if (isLoading && runs.length === 0) {
    return (
      <div className="space-y-3">
        {[1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className="h-16 rounded-xl bg-gray-900/60 border border-gray-800 animate-pulse flex items-center px-6"
          />
        ))}
      </div>
    );
  }

  if (runs.length === 0) {
    return (
      <div className="p-12 text-center rounded-2xl bg-gray-900/40 border border-dashed border-gray-800">
        <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-purple-500/10 text-purple-400 flex items-center justify-center">
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <polygon points="5 3 19 12 5 21 5 3" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <p className="text-sm font-medium text-gray-200">No agent runs recorded</p>
        <p className="text-xs text-gray-500 mt-1 max-w-sm mx-auto">
          No execution runs match your current filter parameters. Start an agent run or adjust filter criteria.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-gray-800/80 bg-gray-900/40 shadow-sm backdrop-blur-sm">
      <table className="w-full text-left text-xs text-gray-300">
        <thead className="bg-gray-950/60 text-gray-400 border-b border-gray-800 font-medium uppercase tracking-wider text-[10px]">
          <tr>
            <th className="py-3.5 px-4 sm:px-6">Run Session ID</th>
            <th className="py-3.5 px-4">Agent ID</th>
            <th className="py-3.5 px-4">Environment</th>
            <th className="py-3.5 px-4">Trace ID</th>
            <th className="py-3.5 px-4">Status</th>
            <th className="py-3.5 px-4">Started At</th>
            <th className="py-3.5 px-4 sm:px-6 text-right">Forensics</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-800/60">
          {runs.map((run) => {
            const envConfig = formatEnvironment(run.environment);

            return (
              <tr
                key={run.id}
                className="group hover:bg-gray-800/40 transition-colors cursor-pointer"
                onClick={() => onSelectRun?.(run)}
              >
                {/* Run Session ID */}
                <td className="py-4 px-4 sm:px-6">
                  <div className="font-mono font-semibold text-white group-hover:text-purple-400 transition-colors">
                    {run.id.slice(0, 8)}...{run.id.slice(-4)}
                  </div>
                  {run.input_prompt && (
                    <div className="text-[11px] text-gray-400 mt-0.5 line-clamp-1 max-w-xs">
                      {run.input_prompt}
                    </div>
                  )}
                </td>

                {/* Agent ID */}
                <td className="py-4 px-4 font-mono text-gray-400 text-[11px]">
                  {run.agent_id.slice(0, 8)}...
                </td>

                {/* Environment */}
                <td className="py-4 px-4">
                  <span
                    className={`inline-block px-2 py-0.5 rounded text-[11px] font-medium border ${envConfig.badgeClass}`}
                  >
                    {envConfig.label}
                  </span>
                </td>

                {/* Trace ID */}
                <td className="py-4 px-4 font-mono text-gray-400 text-[11px]">
                  {run.trace_id ? (
                    <span className="px-1.5 py-0.5 rounded bg-gray-950 border border-gray-800 text-gray-300">
                      {run.trace_id.slice(0, 12)}...
                    </span>
                  ) : (
                    "—"
                  )}
                </td>

                {/* Status */}
                <td className="py-4 px-4">
                  <RunStatusBadge status={run.status} size="sm" />
                </td>

                {/* Started At */}
                <td className="py-4 px-4 text-gray-400 text-[11px] whitespace-nowrap">
                  {formatDate(run.started_at)}
                </td>

                {/* Actions */}
                <td className="py-4 px-4 sm:px-6 text-right whitespace-nowrap">
                  <Link
                    href={`/runs/${run.id}`}
                    onClick={(e) => e.stopPropagation()}
                    className="inline-flex items-center gap-1.5 py-1 px-3 rounded-lg bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 border border-purple-500/30 text-xs font-medium transition-colors"
                  >
                    Inspect Session →
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
