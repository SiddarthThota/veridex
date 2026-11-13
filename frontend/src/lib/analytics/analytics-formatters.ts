/**
 * Data and Numeric Formatters for VERIDEX Analytics Dashboard (Phase 9.3).
 *
 * Provides locale-aware, resilient formatting for counts, percentages, rates,
 * durations, scores, dates, and severity classification styles.
 */

import type { AnomalySeverity, AnomalyStatus } from "@/types/analytics";

/** Formats integer counts with thousands separators, handling null/undefined cleanly */
export function formatNumber(val: number | null | undefined): string {
  if (val === null || val === undefined || isNaN(val)) return "—";
  return new Intl.NumberFormat("en-US").format(val);
}

/** Formats values that are already 0-100 percentage values (e.g. allow_percentage) */
export function formatPercentage(val: number | null | undefined, decimals = 1): string {
  if (val === null || val === undefined || isNaN(val)) return "—";
  return `${val.toFixed(decimals)}%`;
}

/** Formats ratio rates that are 0.0-1.0 (e.g. approval_resolution_rate, historical_denial_rate) */
export function formatRate(val: number | null | undefined, decimals = 1): string {
  if (val === null || val === undefined || isNaN(val)) return "—";
  return `${(val * 100).toFixed(decimals)}%`;
}

/** Formats evaluation or execution duration in milliseconds or seconds */
export function formatDurationMs(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || isNaN(ms)) return "—";
  if (ms >= 1000) {
    return `${(ms / 1000).toFixed(2)}s`;
  }
  return `${ms.toFixed(1)}ms`;
}

/** Formats 0-100 quantitative risk or trust score */
export function formatScore(score: number | null | undefined): string {
  if (score === null || score === undefined || isNaN(score)) return "—";
  return score.toFixed(1);
}

/** Formats ISO UTC timestamp to short date/time string */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "UTC",
      timeZoneName: "short",
    }).format(d);
  } catch {
    return iso;
  }
}

/** Formats ISO timestamp to short bucket label for charts (hour or day) */
export function formatBucketLabel(iso: string, granularity: "hour" | "day"): string {
  try {
    const d = new Date(iso);
    if (granularity === "hour") {
      return new Intl.DateTimeFormat("en-US", {
        hour: "numeric",
        minute: "numeric",
        hour12: false,
        timeZone: "UTC",
      }).format(d);
    }
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    }).format(d);
  } catch {
    return iso;
  }
}

/** CSS badge style classes for anomaly severities */
export function getSeverityStyle(severity: AnomalySeverity): {
  bg: string;
  text: string;
  border: string;
  badge: string;
} {
  switch (severity) {
    case "CRITICAL":
      return {
        bg: "bg-rose-500/10",
        text: "text-rose-400",
        border: "border-rose-500/20",
        badge: "bg-rose-500/15 text-rose-300 border-rose-500/30",
      };
    case "HIGH":
      return {
        bg: "bg-amber-500/10",
        text: "text-amber-400",
        border: "border-amber-500/20",
        badge: "bg-amber-500/15 text-amber-300 border-amber-500/30",
      };
    case "MEDIUM":
      return {
        bg: "bg-indigo-500/10",
        text: "text-indigo-400",
        border: "border-indigo-500/20",
        badge: "bg-indigo-500/15 text-indigo-300 border-indigo-500/30",
      };
    case "INFO":
    default:
      return {
        bg: "bg-cyan-500/10",
        text: "text-cyan-400",
        border: "border-cyan-500/20",
        badge: "bg-cyan-500/15 text-cyan-300 border-cyan-500/30",
      };
  }
}

/** CSS status badge style classes for anomaly detector rule status */
export function getStatusStyle(status: AnomalyStatus): {
  label: string;
  badge: string;
  dot: string;
} {
  switch (status) {
    case "TRIGGERED":
      return {
        label: "Anomaly Triggered",
        badge: "bg-rose-500/10 text-rose-400 border-rose-500/20",
        dot: "bg-rose-400 animate-pulse",
      };
    case "NORMAL":
      return {
        label: "Normal Behavior",
        badge: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
        dot: "bg-emerald-400",
      };
    case "INSUFFICIENT_DATA":
    default:
      return {
        label: "Insufficient Baseline Data",
        badge: "bg-gray-500/10 text-gray-400 border-gray-500/20",
        dot: "bg-gray-400",
      };
  }
}

