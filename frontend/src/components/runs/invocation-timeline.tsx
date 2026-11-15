"use client";

import React from "react";
import type { ToolRequestResponse } from "@/types/runs";
import { ExecutionStatusBadge } from "./execution-status-badge";
import {
  formatDate,
  formatDurationMs,
  formatGovernanceDecision,
  formatLatency,
} from "@/lib/runs/runs-formatters";

interface InvocationTimelineProps {
  invocations: ToolRequestResponse[];
  isLoading: boolean;
  onSelectInvocation: (inv: ToolRequestResponse) => void;
}

export function InvocationTimeline({
  invocations,
  isLoading,
  onSelectInvocation,
}: InvocationTimelineProps) {
  if (isLoading && invocations.length === 0) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-24 rounded-2xl bg-gray-900/60 border border-gray-800 animate-pulse"
          />
        ))}
      </div>
    );
  }

  if (invocations.length === 0) {
    return (
      <div className="p-12 text-center rounded-2xl bg-gray-900/40 border border-dashed border-gray-800">
        <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-purple-500/10 text-purple-400 flex items-center justify-center">
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <p className="text-sm font-medium text-gray-200">No tool invocations recorded</p>
        <p className="text-xs text-gray-500 mt-1 max-w-sm mx-auto">
          This run session has not dispatched any tool requests through the Governance Gateway yet.
        </p>
      </div>
    );
  }

  return (
    <div className="relative pl-6 space-y-6 before:absolute before:left-2.5 before:top-3 before:bottom-3 before:w-0.5 before:bg-gray-800">
      {invocations.map((inv, idx) => {
        const decisionConfig = formatGovernanceDecision(inv.decision);

        return (
          <div
            key={inv.id}
            onClick={() => onSelectInvocation(inv)}
            className="relative group p-4 rounded-2xl bg-gray-900/60 hover:bg-gray-800/60 border border-gray-800/80 cursor-pointer transition-all shadow-sm"
          >
            {/* Timeline node */}
            <div
              className={`absolute -left-[27px] top-4 w-3.5 h-3.5 rounded-full border-2 border-gray-950 ${
                inv.decision === "ALLOW"
                  ? "bg-emerald-400"
                  : inv.decision === "DENY"
                  ? "bg-rose-400"
                  : "bg-amber-400"
              }`}
            />

            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div className="flex items-center gap-3">
                <span className="text-xs font-mono font-bold text-gray-400">#{idx + 1}</span>
                <span
                  className={`px-2 py-0.5 rounded text-[11px] font-bold border ${decisionConfig.badgeClass}`}
                >
                  {decisionConfig.label}
                </span>
                <span className="font-mono text-xs text-white group-hover:text-purple-400 transition-colors">
                  Tool: {inv.tool_id.slice(0, 8)}...
                </span>
              </div>

              <div className="flex items-center gap-3 text-xs">
                {inv.execution && <ExecutionStatusBadge status={inv.execution.status} size="sm" />}
                <span className="text-gray-500 font-mono text-[11px] whitespace-nowrap">
                  {formatDate(inv.created_at)}
                </span>
              </div>
            </div>

            {/* Invocations metadata summary */}
            <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] text-gray-400 bg-gray-950/60 p-2.5 rounded-xl border border-gray-800/60 font-mono">
              <div>
                <span className="text-gray-500 block">Gateway Latency:</span>
                <span>{formatLatency(inv.evaluation_duration_ms)}</span>
              </div>
              <div>
                <span className="text-gray-500 block">Exec Duration:</span>
                <span>{formatDurationMs(inv.execution?.duration_ms)}</span>
              </div>
              <div className="sm:col-span-2 truncate">
                <span className="text-gray-500 block">Arguments Hash:</span>
                <span className="truncate">{inv.arguments_hash.slice(0, 24)}...</span>
              </div>
            </div>

            {/* Violation codes pill strip if any */}
            {inv.violation_codes.length > 0 && (
              <div className="mt-2.5 flex flex-wrap gap-1.5 items-center">
                <span className="text-[10px] text-rose-400 font-medium">Violations:</span>
                {inv.violation_codes.map((code, cIdx) => (
                  <span
                    key={cIdx}
                    className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-rose-500/10 text-rose-300 border border-rose-500/20"
                  >
                    {code}
                  </span>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
