"use client";

/**
 * Overview KPI Grid for VERIDEX SecOps Dashboard (Phase 9.3).
 *
 * Implements 4 cohesive KPI cards covering all 13 fields from OverviewAnalytics:
 * 1. Total Invocations & Decision Rates (allow_percentage, deny_percentage, require_approval_percentage)
 * 2. Blocked / Denied Actions (deny_count, deny_percentage)
 * 3. Tool Executions & Gated Requests (total_tool_executions, require_approval_count)
 * 4. Human Approvals & Resolution Rate (approval_resolution_rate, approved, rejected, pending, expired)
 */

import React from "react";
import type { OverviewAnalytics } from "@/types/analytics";
import {
  formatNumber,
  formatPercentage,
  formatRate,
} from "@/lib/analytics/analytics-formatters";
import { KpiCardSkeleton } from "./dashboard-skeleton";
import { DashboardErrorCard } from "./dashboard-empty-state";

interface OverviewKpiGridProps {
  overview: {
    data: OverviewAnalytics | null;
    loading: boolean;
    error: string | null;
  };
  onRetry?: () => void;
}

export function OverviewKpiGrid({ overview, onRetry }: OverviewKpiGridProps) {
  if (overview.loading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCardSkeleton />
        <KpiCardSkeleton />
        <KpiCardSkeleton />
        <KpiCardSkeleton />
      </div>
    );
  }

  if (overview.error) {
    return (
      <DashboardErrorCard
        title="Failed to load Governance Overview"
        error={overview.error}
        onRetry={onRetry}
      />
    );
  }

  const d = overview.data;
  if (!d) return null;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {/* 1. Total Invocations */}
      <div className="p-5 rounded-2xl bg-gray-900/60 border border-gray-800/80 hover:border-gray-700/80 transition-colors flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between text-xs font-medium text-gray-400 mb-2">
            <span className="uppercase tracking-wider">Total Invocations</span>
            <span className="text-emerald-400 font-mono text-[11px] bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
              {formatPercentage(d.allow_percentage)} Allowed
            </span>
          </div>
          <div className="text-3xl font-bold text-gray-100 tracking-tight my-1">
            {formatNumber(d.total_invocations)}
          </div>
        </div>

        <div className="pt-3 border-t border-gray-800/60 mt-3 grid grid-cols-3 gap-2 text-[11px]">
          <div>
            <span className="text-gray-500 block">Allow</span>
            <span className="text-gray-200 font-medium font-mono">{formatNumber(d.allow_count)}</span>
          </div>
          <div>
            <span className="text-gray-500 block">Deny</span>
            <span className="text-rose-400 font-medium font-mono">{formatNumber(d.deny_count)}</span>
          </div>
          <div>
            <span className="text-gray-500 block">Review</span>
            <span className="text-amber-400 font-medium font-mono">
              {formatNumber(d.require_approval_count)}
            </span>
          </div>
        </div>
      </div>

      {/* 2. Blocked Actions / Policy Denials */}
      <div className="p-5 rounded-2xl bg-gray-900/60 border border-gray-800/80 hover:border-gray-700/80 transition-colors flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between text-xs font-medium text-gray-400 mb-2">
            <span className="uppercase tracking-wider">Blocked Invocations</span>
            <span
              className={`font-mono text-[11px] px-2 py-0.5 rounded-full border ${
                d.deny_percentage > 15
                  ? "bg-rose-500/10 text-rose-400 border-rose-500/20"
                  : d.deny_percentage > 5
                    ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
                    : "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
              }`}
            >
              {formatPercentage(d.deny_percentage)} Denied
            </span>
          </div>
          <div className="text-3xl font-bold text-rose-400 tracking-tight my-1">
            {formatNumber(d.deny_count)}
          </div>
        </div>

        <div className="pt-3 border-t border-gray-800/60 mt-3 flex items-center justify-between text-[11px] text-gray-400">
          <span>High-risk actions halted</span>
          <span className="font-mono text-gray-500">
            {formatPercentage(d.deny_percentage)} rate
          </span>
        </div>
      </div>

      {/* 3. Executions & Gated Actions */}
      <div className="p-5 rounded-2xl bg-gray-900/60 border border-gray-800/80 hover:border-gray-700/80 transition-colors flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between text-xs font-medium text-gray-400 mb-2">
            <span className="uppercase tracking-wider">Tool Executions</span>
            <span className="text-amber-400 font-mono text-[11px] bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20">
              {formatPercentage(d.require_approval_percentage)} Gated
            </span>
          </div>
          <div className="text-3xl font-bold text-gray-100 tracking-tight my-1">
            {formatNumber(d.total_tool_executions)}
          </div>
        </div>

        <div className="pt-3 border-t border-gray-800/60 mt-3 flex items-center justify-between text-[11px] text-gray-400">
          <span>Human-gate triggers</span>
          <span className="font-mono text-amber-300 font-medium">
            {formatNumber(d.require_approval_count)}
          </span>
        </div>
      </div>

      {/* 4. Human Approvals & Resolution Rate */}
      <div className="p-5 rounded-2xl bg-gray-900/60 border border-gray-800/80 hover:border-gray-700/80 transition-colors flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between text-xs font-medium text-gray-400 mb-2">
            <span className="uppercase tracking-wider">Resolution Rate</span>
            <span className="text-indigo-300 font-mono text-[11px] bg-indigo-500/10 px-2 py-0.5 rounded-full border border-indigo-500/20">
              {formatNumber(d.total_approvals)} Total
            </span>
          </div>
          <div className="text-3xl font-bold text-indigo-400 tracking-tight my-1">
            {formatRate(d.approval_resolution_rate)}
          </div>
        </div>

        <div className="pt-3 border-t border-gray-800/60 mt-3 grid grid-cols-4 gap-1.5 text-[11px] text-center">
          <div>
            <span className="text-emerald-400 font-mono font-medium block">
              {formatNumber(d.approved_approvals)}
            </span>
            <span className="text-gray-500 text-[10px]">Appr</span>
          </div>
          <div>
            <span className="text-rose-400 font-mono font-medium block">
              {formatNumber(d.rejected_approvals)}
            </span>
            <span className="text-gray-500 text-[10px]">Rej</span>
          </div>
          <div>
            <span className="text-amber-400 font-mono font-medium block">
              {formatNumber(d.pending_approvals)}
            </span>
            <span className="text-gray-500 text-[10px]">Pend</span>
          </div>
          <div>
            <span className="text-gray-400 font-mono font-medium block">
              {formatNumber(d.expired_approvals)}
            </span>
            <span className="text-gray-500 text-[10px]">Exp</span>
          </div>
        </div>
      </div>
    </div>
  );
}

