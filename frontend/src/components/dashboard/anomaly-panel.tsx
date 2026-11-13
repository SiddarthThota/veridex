"use client";

/**
 * Anomaly Monitoring Panel for VERIDEX SecOps Dashboard (Phase 9.3).
 *
 * Implements:
 * - Structured informational findings display from AnomalyReport.findings.
 * - Anomaly detector classifications:
 *   - DENIAL_RATE_SPIKE
 *   - CRITICAL_RISK_SURGE
 *   - LATENCY_SLA_DEGRADATION
 * - Severity hierarchy: INFO, MEDIUM, HIGH, CRITICAL.
 * - Evaluation status: TRIGGERED (alerting), NORMAL, INSUFFICIENT_DATA.
 * - Metric comparisons (current_value vs baseline_value vs threshold).
 * - Explicit framing as informational governance signals (read-only observability).
 */

import React from "react";
import type { AnomalyReport, AnomalyFinding, AnomalyType } from "@/types/analytics";
import {
  formatDateTime,
  formatNumber,
  getSeverityStyle,
  getStatusStyle,
} from "@/lib/analytics/analytics-formatters";
import { TableSkeleton } from "./dashboard-skeleton";
import { DashboardEmptyState, DashboardErrorCard } from "./dashboard-empty-state";

interface AnomalyPanelProps {
  anomalies: {
    data: AnomalyReport | null;
    loading: boolean;
    error: string | null;
  };
  onRetry?: () => void;
}

function getDetectorTitle(type: AnomalyType): { title: string; desc: string } {
  switch (type) {
    case "DENIAL_RATE_SPIKE":
      return {
        title: "Denial Rate Spike Detector",
        desc: "Detects anomalous surges in policy DENY decisions against historical baseline",
      };
    case "CRITICAL_RISK_SURGE":
      return {
        title: "Critical Risk Surge Detector",
        desc: "Monitors sharp elevation of high and critical composite risk evaluations",
      };
    case "LATENCY_SLA_DEGRADATION":
      return {
        title: "Latency SLA Degradation Detector",
        desc: "Flags significant governance policy evaluation duration overhead",
      };
    default:
      return {
        title: type,
        desc: "Governance anomaly detection rule",
      };
  }
}

function formatDetectorMetric(type: AnomalyType, val: number | null): string {
  if (val === null || val === undefined || isNaN(val)) return "—";
  if (type === "LATENCY_SLA_DEGRADATION") {
    return `${val.toFixed(1)}ms`;
  }
  // Rate or count (usually 0.0-1.0 or ratio)
  if (val <= 1.0) {
    return `${(val * 100).toFixed(1)}%`;
  }
  return val.toFixed(1);
}

export function AnomalyPanel({ anomalies, onRetry }: AnomalyPanelProps) {
  if (anomalies.loading) {
    return <TableSkeleton rows={3} />;
  }

  if (anomalies.error) {
    return (
      <DashboardErrorCard
        title="Failed to load Anomaly Report"
        error={anomalies.error}
        onRetry={onRetry}
      />
    );
  }

  const findings = anomalies.data?.findings || [];
  if (findings.length === 0) {
    return (
      <div className="p-6 rounded-2xl bg-gray-900/60 border border-gray-800/80">
        <h3 className="text-sm font-semibold text-white mb-2">Anomaly Monitoring</h3>
        <DashboardEmptyState
          title="No anomaly findings reported"
          message="Sliding-window anomaly detection rules found no anomalies across the current observation window."
        />
      </div>
    );
  }

  return (
    <div className="p-6 rounded-2xl bg-gray-900/60 border border-gray-800/80 hover:border-gray-700/80 transition-colors">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <h3 className="text-sm font-semibold text-white">Sliding-Window Anomaly Monitoring</h3>
            <span className="text-[10px] text-gray-400 font-mono bg-gray-950 px-2 py-0.5 rounded-sm border border-gray-800">
              Evaluated {formatDateTime(anomalies.data?.evaluated_at)}
            </span>
          </div>
          <p className="text-xs text-gray-400 mt-1">
            Read-only statistical signals comparing current sliding window to historical baselines.
          </p>
        </div>

        <span className="text-[11px] text-gray-500 font-mono">
          {findings.length} Active Detectors
        </span>
      </div>

      {/* Findings Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {findings.map((finding: AnomalyFinding) => {
          const detector = getDetectorTitle(finding.anomaly_type);
          const sev = getSeverityStyle(finding.severity);
          const stat = getStatusStyle(finding.status);
          const isTriggered = finding.status === "TRIGGERED";

          return (
            <div
              key={finding.anomaly_type}
              className={`p-4 rounded-xl border flex flex-col justify-between transition-colors ${
                isTriggered
                  ? "bg-rose-950/20 border-rose-500/30 shadow-sm shadow-rose-950/50"
                  : "bg-gray-950/50 border-gray-800/80"
              }`}
            >
              <div>
                {/* Status and Severity Badges */}
                <div className="flex items-center justify-between gap-2 mb-3">
                  <span
                    className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium border ${stat.badge}`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${stat.dot}`} />
                    {stat.label}
                  </span>

                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-mono font-medium border ${sev.badge}`}
                  >
                    {finding.severity}
                  </span>
                </div>

                {/* Detector Title & Subtitle */}
                <h4 className="text-xs font-semibold text-gray-200">{detector.title}</h4>
                <p className="text-[11px] text-gray-500 mt-0.5 leading-snug">{detector.desc}</p>

                {/* Metric Comparisons */}
                <div className="my-3 p-2.5 rounded-lg bg-gray-900/60 border border-gray-800/60 grid grid-cols-3 gap-2 text-center text-xs font-mono">
                  <div>
                    <span className="text-gray-500 text-[10px] block">Current</span>
                    <span
                      className={`font-semibold ${
                        isTriggered ? "text-rose-400" : "text-gray-200"
                      }`}
                    >
                      {formatDetectorMetric(finding.anomaly_type, finding.current_value)}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-500 text-[10px] block">Baseline</span>
                    <span className="text-gray-400">
                      {formatDetectorMetric(finding.anomaly_type, finding.baseline_value)}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-500 text-[10px] block">Threshold</span>
                    <span className="text-amber-400">
                      {formatDetectorMetric(finding.anomaly_type, finding.threshold)}
                    </span>
                  </div>
                </div>

                {/* Explanation */}
                <p className="text-[11px] text-gray-400 leading-relaxed bg-gray-900/40 p-2 rounded-md border border-gray-800/40 font-sans">
                  {finding.explanation}
                </p>
              </div>

              {/* Sample Counts Footer */}
              <div className="pt-3 mt-3 border-t border-gray-800/50 flex items-center justify-between text-[10px] font-mono text-gray-500">
                <span>Samples: {formatNumber(finding.current_samples)}</span>
                {finding.baseline_samples !== null && (
                  <span>Baseline: {formatNumber(finding.baseline_samples)}</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Observability framing note */}
      <div className="mt-4 pt-3 border-t border-gray-800/60 text-center">
        <p className="text-[10px] text-gray-500">
          Informational governance signals. Veridex evaluates sliding windows objectively without
          altering downstream execution policies or sending unconfigured notifications.
        </p>
      </div>
    </div>
  );
}

