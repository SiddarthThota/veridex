"use client";

/**
 * Risk Assessment Distribution & Histogram Card (Phase 9.3).
 *
 * Implements:
 * - 4 Canonical risk tier counts (LOW, MEDIUM, HIGH, CRITICAL).
 * - Aggregate score metrics: Average, Minimum, and Maximum risk score.
 * - 10-Bucket Native Responsive SVG Risk Histogram with color-coded severity bars.
 */

import React, { useState } from "react";
import type { RiskDistributionAnalytics, RiskHistogramBucket } from "@/types/analytics";
import { formatNumber, formatScore } from "@/lib/analytics/analytics-formatters";
import { ChartSkeleton } from "./dashboard-skeleton";
import { DashboardEmptyState, DashboardErrorCard } from "./dashboard-empty-state";

interface RiskDistributionCardProps {
  risk: {
    data: RiskDistributionAnalytics | null;
    loading: boolean;
    error: string | null;
  };
  onRetry?: () => void;
}

export function RiskDistributionCard({ risk, onRetry }: RiskDistributionCardProps) {
  const [hoveredBucket, setHoveredBucket] = useState<RiskHistogramBucket | null>(null);

  if (risk.loading) {
    return <ChartSkeleton height="h-80" />;
  }

  if (risk.error) {
    return (
      <DashboardErrorCard
        title="Failed to load Risk Distribution"
        error={risk.error}
        onRetry={onRetry}
      />
    );
  }

  const d = risk.data;
  if (!d || d.total_assessments === 0) {
    return (
      <div className="p-6 rounded-2xl bg-gray-900/60 border border-gray-800/80">
        <h3 className="text-sm font-semibold text-white mb-2">Risk Assessment Distribution</h3>
        <DashboardEmptyState
          title="No risk assessments recorded"
          message="Multi-dimensional risk scoring metrics will be charted here once agent actions are evaluated."
        />
      </div>
    );
  }

  // Histogram SVG dimensions
  const svgWidth = 500;
  const svgHeight = 160;
  const padding = { top: 15, right: 15, bottom: 25, left: 35 };
  const chartWidth = svgWidth - padding.left - padding.right;
  const chartHeight = svgHeight - padding.top - padding.bottom;

  const histogram = d.histogram || [];
  const maxBucketCount = Math.max(...histogram.map((h) => h.count), 5);
  const barWidth = chartWidth / (histogram.length || 1) - 4;

  const getBarColor = (minScore: number) => {
    if (minScore >= 70) return "#f43f5e"; // Rose / Critical
    if (minScore >= 40) return "#f59e0b"; // Amber / High-Medium
    if (minScore >= 20) return "#6366f1"; // Indigo / Low-Medium
    return "#10b981"; // Emerald / Low
  };

  return (
    <div className="p-6 rounded-2xl bg-gray-900/60 border border-gray-800/80 hover:border-gray-700/80 transition-colors flex flex-col justify-between">
      {/* Header */}
      <div>
        <div className="flex items-center justify-between gap-3 mb-4">
          <div>
            <h3 className="text-sm font-semibold text-white">Risk Distribution</h3>
            <p className="text-xs text-gray-400 mt-0.5">
              Score distribution across {formatNumber(d.total_assessments)} evaluations
            </p>
          </div>
          <span className="text-[11px] font-mono text-purple-300 bg-purple-500/10 px-2 py-0.5 rounded-full border border-purple-500/20">
            Avg {formatScore(d.average_risk_score)} / 100
          </span>
        </div>

        {/* 4 Tiers Counter Grid */}
        <div className="grid grid-cols-4 gap-2 text-center mb-5">
          <div className="p-2.5 rounded-xl bg-gray-950/70 border border-emerald-500/20">
            <span className="text-[10px] text-gray-400 uppercase tracking-wider block">Low</span>
            <span className="text-lg font-bold text-emerald-400 font-mono">
              {formatNumber(d.low_count)}
            </span>
          </div>
          <div className="p-2.5 rounded-xl bg-gray-950/70 border border-indigo-500/20">
            <span className="text-[10px] text-gray-400 uppercase tracking-wider block">Medium</span>
            <span className="text-lg font-bold text-indigo-400 font-mono">
              {formatNumber(d.medium_count)}
            </span>
          </div>
          <div className="p-2.5 rounded-xl bg-gray-950/70 border border-amber-500/20">
            <span className="text-[10px] text-gray-400 uppercase tracking-wider block">High</span>
            <span className="text-lg font-bold text-amber-400 font-mono">
              {formatNumber(d.high_count)}
            </span>
          </div>
          <div className="p-2.5 rounded-xl bg-gray-950/70 border border-rose-500/20">
            <span className="text-[10px] text-gray-400 uppercase tracking-wider block">Critical</span>
            <span className="text-lg font-bold text-rose-400 font-mono">
              {formatNumber(d.critical_count)}
            </span>
          </div>
        </div>

        {/* Score Statistics Row */}
        <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-gray-950/50 border border-gray-800/60 text-xs mb-4">
          <div className="flex items-center gap-1.5">
            <span className="text-gray-500">Min Score:</span>
            <span className="font-mono text-gray-300 font-medium">
              {d.min_risk_score !== null ? d.min_risk_score : "—"}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-gray-500">Avg Score:</span>
            <span className="font-mono text-indigo-300 font-medium">
              {formatScore(d.average_risk_score)}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-gray-500">Max Score:</span>
            <span className="font-mono text-rose-400 font-medium">
              {d.max_risk_score !== null ? d.max_risk_score : "—"}
            </span>
          </div>
        </div>
      </div>

      {/* 10-Bucket Native SVG Histogram */}
      <div className="relative pt-2">
        <div className="text-[10px] text-gray-400 font-medium mb-1.5 flex items-center justify-between">
          <span>Score Histogram (10 Deciles)</span>
          {hoveredBucket && (
            <span className="text-indigo-300 font-mono">
              Range {hoveredBucket.range_label}: {formatNumber(hoveredBucket.count)} events
            </span>
          )}
        </div>

        <svg
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          className="w-full h-auto overflow-visible font-mono"
          role="img"
          aria-label="Risk score distribution histogram across 10 deciles"
        >
          <title>Risk Score Distribution Histogram</title>
          <desc>Bucketed distribution of risk evaluation scores from 0 to 100.</desc>

          {/* Baseline axis */}
          <line
            x1={padding.left}
            y1={padding.top + chartHeight}
            x2={padding.left + chartWidth}
            y2={padding.top + chartHeight}
            stroke="#374151"
            strokeWidth="1"
          />

          {/* Histogram Bars */}
          {histogram.map((bucket, i) => {
            const x = padding.left + i * (barWidth + 4);
            const barH = (bucket.count / maxBucketCount) * chartHeight;
            const y = padding.top + chartHeight - barH;
            const isHovered = hoveredBucket?.range_label === bucket.range_label;

            return (
              <g
                key={bucket.range_label}
                className="cursor-pointer"
                onMouseEnter={() => setHoveredBucket(bucket)}
                onMouseLeave={() => setHoveredBucket(null)}
              >
                <rect
                  x={x}
                  y={y}
                  width={barWidth}
                  height={Math.max(barH, 2)}
                  rx="2"
                  fill={getBarColor(bucket.min_score)}
                  opacity={isHovered ? 1 : 0.8}
                  className="transition-opacity"
                />
                {/* Score decile marker under every second bar */}
                {i % 2 === 0 && (
                  <text
                    x={x + barWidth / 2}
                    y={padding.top + chartHeight + 14}
                    textAnchor="middle"
                    fontSize="9"
                    fill="#9ca3af"
                  >
                    {bucket.min_score}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

