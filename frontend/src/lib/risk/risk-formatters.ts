/**
 * Formatting and Calculation Helpers for VERIDEX Risk Engine (Phase 9.5).
 */

import type { AgentHistoryStatus, RiskLevel } from "@/types/risk";

export function getRiskLevelStyle(level: RiskLevel) {
  switch (level) {
    case "LOW":
      return {
        badge: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
        bar: "bg-emerald-500",
        text: "text-emerald-400",
        label: "Low Risk",
      };
    case "MEDIUM":
      return {
        badge: "bg-sky-500/10 text-sky-400 border-sky-500/20",
        bar: "bg-sky-500",
        text: "text-sky-400",
        label: "Medium Risk",
      };
    case "HIGH":
      return {
        badge: "bg-amber-500/10 text-amber-400 border-amber-500/20",
        bar: "bg-amber-500",
        text: "text-amber-400",
        label: "High Risk",
      };
    case "CRITICAL":
      return {
        badge: "bg-rose-500/10 text-rose-400 border-rose-500/20",
        bar: "bg-rose-500",
        text: "text-rose-400",
        label: "Critical Risk",
      };
  }
}

export function getScoreBand(score: number): { level: RiskLevel; label: string; color: string } {
  if (score < 30) return { level: "LOW", label: "Low Risk", color: "text-emerald-400" };
  if (score < 60) return { level: "MEDIUM", label: "Medium Risk", color: "text-sky-400" };
  if (score < 85) return { level: "HIGH", label: "High Risk", color: "text-amber-400" };
  return { level: "CRITICAL", label: "Critical Risk", color: "text-rose-400" };
}

export function getHistoryStatusStyle(status: AgentHistoryStatus) {
  switch (status) {
    case "VALID":
      return {
        badge: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
        label: "Valid History",
        description: "Sufficient historical executions for empirical scoring.",
      };
    case "INSUFFICIENT_DATA":
      return {
        badge: "bg-amber-500/10 text-amber-400 border-amber-500/20",
        label: "Insufficient Data",
        description: "Limited sample size (<5 invocations); conservative baseline applied.",
      };
  }
}

export function getVectorDescription(vector: "tool" | "data" | "agent" | "context"): {
  title: string;
  description: string;
} {
  switch (vector) {
    case "tool":
      return {
        title: "Tool Blast Radius",
        description: "Inherent capability, reversibility, access type, and destructive potential.",
      };
    case "data":
      return {
        title: "Data Classification",
        description: "Sensitivity of targeted payloads (PUBLIC, INTERNAL, CONFIDENTIAL, RESTRICTED).",
      };
    case "agent":
      return {
        title: "Agent Trust & Tier",
        description: "Assigned risk tier combined with empirical historical violation rate.",
      };
    case "context":
      return {
        title: "Runtime Context",
        description: "Environment (Production vs Dev) and argument pattern heuristic rules.",
      };
  }
}

/**
 * Validates that the 4 risk weights sum to 1.0 (with 0.001 tolerance).
 */
export function validateRiskWeights(
  wTool: number,
  wData: number,
  wAgent: number,
  wContext: number
): { valid: boolean; sum: number; error?: string } {
  const sum = Number((wTool + wData + wAgent + wContext).toFixed(3));
  if (Math.abs(sum - 1.0) > 0.001) {
    return {
      valid: false,
      sum,
      error: `Weights must sum exactly to 1.00 (Current: ${sum.toFixed(2)})`,
    };
  }
  return { valid: true, sum: 1.0 };
}

/**
 * Validates threshold ordering and bounds against FastAPI v0.8.0 rules:
 * - 0 <= threshold_medium <= threshold_high <= threshold_critical <= 100
 * - 0 <= approval_threshold <= deny_threshold <= 100
 */
export function validateThresholds(
  tMed: number,
  tHigh: number,
  tCrit: number,
  tAppr: number,
  tDeny: number
): { valid: boolean; error?: string } {
  if (tMed < 0 || tCrit > 100) {
    return { valid: false, error: "Classification thresholds must be in the range [0, 100]." };
  }
  if (tMed > tHigh || tHigh > tCrit) {
    return {
      valid: false,
      error: "Classification thresholds must satisfy: 0 <= medium <= high <= critical <= 100.",
    };
  }
  if (tAppr < 0 || tDeny > 100) {
    return { valid: false, error: "Action thresholds must be in the range [0, 100]." };
  }
  if (tAppr > tDeny) {
    return {
      valid: false,
      error: "Action thresholds must satisfy: 0 <= approval_threshold <= deny_threshold <= 100.",
    };
  }
  return { valid: true };
}

