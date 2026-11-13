"use client";

/**
 * Governance Activity Trends Chart for VERIDEX SecOps Dashboard (Phase 9.3).
 *
 * Implements native responsive SVG time-series visualization:
 * - Total invocations and decision breakdown (Allow, Deny, Require Approval).
 * - Tool executions and risk assessment counts.
 * - Hourly and Daily granularities using only returned buckets.
 * - Accessible SVG structure, coordinate scaling, and interactive hover tooltip.
 */

import React, { useState } from "react";
import type { TrendsAnalytics, TrendBucket } from "@/types/analytics";
import { formatNumber, formatBucketLabel, formatDateTime } from "@/lib/analytics/analytics-formatters";
import { ChartSkeleton } from "./dashboard-skeleton";
import { DashboardEmptyState, DashboardErrorCard } from "./dashboard-empty-state";

interface GovernanceTrendsChartProps {
  trends: {
    data: TrendsAnalytics | null;
    loading: boolean;
    error: string | null;
  };
  onRetry?: () => void;
}

export function GovernanceTrendsChart({ trends, onRetry }: GovernanceTrendsChartProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  if (trends.loading) {
    return <ChartSkeleton height="h-80" />;
  }

  if (trends.error) {
    return (
      <DashboardErrorCard
        title="Failed to load Governance Activity Trends"
        error={trends.error}
        onRetry={onRetry}
      />
    );
  }

  const buckets = trends.data?.buckets || [];
  if (buckets.length === 0) {
    return (
      <div className="p-6 rounded-2xl bg-gray-900/60 border border-gray-800/80">
        <h3 className="text-sm font-semibold text-white mb-2">Governance Activity Trends</h3>
        <DashboardEmptyState
          title="No trend activity in selected range"
          message="No time-series buckets were recorded. As AI agents invoke tools, throughput and outcome distributions will appear here."
        />
      </div>
    );
  }

  const granularity = trends.data?.granularity || "day";

  // SVG Chart Dimensions
  const svgWidth = 800;
  const svgHeight = 240;
  const padding = { top: 20, right: 20, bottom: 35, left: 50 };
  const chartWidth = svgWidth - padding.left - padding.right;
  const chartHeight = svgHeight - padding.top - padding.bottom;

  // Maximum value for Y-axis scale
  const maxVal = Math.max(
    ...buckets.map((b) => Math.max(b.total_invocations, b.tool_executions_count, 1)),
    10
  );
  // Nice round Y-axis ceiling
  const yCeil = Math.ceil(maxVal / 10) * 10;

  // Coordinate scales
  const getX = (index: number) => {
    if (buckets.length === 1) return padding.left + chartWidth / 2;
    return padding.left + (index / (buckets.length - 1)) * chartWidth;
  };

  const getY = (val: number) => {
    return padding.top + chartHeight - (val / yCeil) * chartHeight;
  };

  // Build SVG path for Total Invocations area & stroke
  const linePoints = buckets.map((b, i) => `${getX(i)},${getY(b.total_invocations)}`);
  const linePath = `M ${linePoints.join(" L ")}`;
  const areaPath = `M ${getX(0)},${padding.top + chartHeight} L ${linePoints.join(" L ")} L ${getX(
    buckets.length - 1
  )},${padding.top + chartHeight} Z`;

  // Build line path for Tool Executions
  const execPoints = buckets.map((b, i) => `${getX(i)},${getY(b.tool_executions_count)}`);
  const execPath = `M ${execPoints.join(" L ")}`;

  const activeBucket: TrendBucket | null =
    hoveredIndex !== null && buckets[hoveredIndex] ? buckets[hoveredIndex] : null;

  return (
    <div className="p-6 rounded-2xl bg-gray-900/60 border border-gray-800/80 hover:border-gray-700/80 transition-colors">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div>
          <div className="flex items-center gap-2.5">
            <h3 className="text-sm font-semibold text-white">Governance Activity Trends</h3>
            <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded-sm bg-gray-950 text-indigo-400 border border-gray-800">
              {granularity === "hour" ? "Hourly Buckets" : "Daily Buckets"}
            </span>
          </div>
          <p className="text-xs text-gray-400 mt-1">
            Throughput, governance decisions, and execution volume across the evaluated interval.
          </p>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-4 text-[11px] select-none">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-indigo-500" />
            <span className="text-gray-300">Total Invocations</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-emerald-400" />
            <span className="text-gray-300">Executions</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-rose-400" />
            <span className="text-gray-300">Denials</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-amber-400" />
            <span className="text-gray-300">Approvals</span>
          </div>
        </div>
      </div>

      {/* Responsive SVG Chart Container */}
      <div className="relative w-full overflow-hidden select-none">
        <svg
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          className="w-full h-auto overflow-visible font-mono"
          role="img"
          aria-label={`Governance activity trends chart showing ${buckets.length} ${granularity} buckets`}
        >
          <title>Governance Activity Trends Chart</title>
          <desc>
            Multi-series time-series chart showing total invocations, allow, deny, require approval, and
            tool execution counts.
          </desc>

          <defs>
            <linearGradient id="invocationAreaGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#6366f1" stopOpacity="0.25" />
              <stop offset="100%" stopColor="#6366f1" stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {/* Grid lines (4 horizontal divisions) */}
          {[0, 0.25, 0.5, 0.75, 1].map((pct) => {
            const y = padding.top + chartHeight * (1 - pct);
            const labelVal = Math.round(yCeil * pct);
            return (
              <g key={pct}>
                <line
                  x1={padding.left}
                  y1={y}
                  x2={padding.left + chartWidth}
                  y2={y}
                  stroke="#1f2937"
                  strokeDasharray="3 3"
                />
                <text
                  x={padding.left - 8}
                  y={y + 3}
                  textAnchor="end"
                  fontSize="10"
                  fill="#6b7280"
                >
                  {labelVal}
                </text>
              </g>
            );
          })}

          {/* Area & Line for Total Invocations */}
          <path d={areaPath} fill="url(#invocationAreaGradient)" />
          <path
            d={linePath}
            fill="none"
            stroke="#6366f1"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Line for Tool Executions */}
          <path
            d={execPath}
            fill="none"
            stroke="#10b981"
            strokeWidth="2"
            strokeDasharray="4 2"
            strokeLinecap="round"
          />

          {/* Data Nodes & Vertical Hover Triggers */}
          {buckets.map((b, i) => {
            const x = getX(i);
            const y = getY(b.total_invocations);
            const isHovered = hoveredIndex === i;

            return (
              <g key={b.timestamp}>
                {/* Vertical cursor guide when hovered */}
                {isHovered && (
                  <line
                    x1={x}
                    y1={padding.top}
                    x2={x}
                    y2={padding.top + chartHeight}
                    stroke="#818cf8"
                    strokeWidth="1"
                    strokeDasharray="2 2"
                  />
                )}

                {/* Invocations point */}
                <circle
                  cx={x}
                  cy={y}
                  r={isHovered ? 5 : 3}
                  fill="#6366f1"
                  stroke="#030712"
                  strokeWidth="2"
                  className="transition-all"
                />

                {/* X-axis time label (sampled to prevent clutter) */}
                {(i === 0 ||
                  i === buckets.length - 1 ||
                  i % Math.ceil(buckets.length / 6) === 0) && (
                  <text
                    x={x}
                    y={padding.top + chartHeight + 18}
                    textAnchor="middle"
                    fontSize="10"
                    fill="#9ca3af"
                  >
                    {formatBucketLabel(b.timestamp, granularity)}
                  </text>
                )}

                {/* Transparent hover capture column */}
                <rect
                  x={x - (chartWidth / (buckets.length * 2 || 1))}
                  y={padding.top}
                  width={chartWidth / (buckets.length || 1)}
                  height={chartHeight + padding.bottom}
                  fill="transparent"
                  className="cursor-pointer"
                  onMouseEnter={() => setHoveredIndex(i)}
                  onMouseLeave={() => setHoveredIndex(null)}
                />
              </g>
            );
          })}
        </svg>

        {/* Hover Inspector Tooltip Floating Overlay */}
        {activeBucket && hoveredIndex !== null && (
          <div
            className="absolute top-2 pointer-events-none z-10 p-3 rounded-xl bg-gray-950/95 border border-gray-800 shadow-xl text-xs space-y-1.5 transition-all duration-75"
            style={{
              left: `${Math.min(
                Math.max(10, (getX(hoveredIndex) / svgWidth) * 100),
                70
              )}%`,
            }}
          >
            <div className="font-semibold text-gray-200 border-b border-gray-800 pb-1">
              {formatDateTime(activeBucket.timestamp)}
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px]">
              <div className="text-gray-400">Total Invocations:</div>
              <div className="text-right font-mono font-medium text-indigo-300">
                {formatNumber(activeBucket.total_invocations)}
              </div>
              <div className="text-gray-400">Allowed:</div>
              <div className="text-right font-mono font-medium text-emerald-400">
                {formatNumber(activeBucket.allow_count)}
              </div>
              <div className="text-gray-400">Denied:</div>
              <div className="text-right font-mono font-medium text-rose-400">
                {formatNumber(activeBucket.deny_count)}
              </div>
              <div className="text-gray-400">Require Approval:</div>
              <div className="text-right font-mono font-medium text-amber-400">
                {formatNumber(activeBucket.require_approval_count)}
              </div>
              <div className="text-gray-400">Tool Executions:</div>
              <div className="text-right font-mono font-medium text-emerald-300">
                {formatNumber(activeBucket.tool_executions_count)}
              </div>
              <div className="text-gray-400">Risk Assessments:</div>
              <div className="text-right font-mono font-medium text-purple-300">
                {formatNumber(activeBucket.risk_assessments_count)}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

