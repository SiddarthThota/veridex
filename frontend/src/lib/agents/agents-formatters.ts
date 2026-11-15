/**
 * UI Formatters and presentation helpers for Agent Fleet Registry (Phase 9.6).
 */

import type { AgentEnvironment, AgentRiskTier, AgentStatus, AgentVersionStatus } from "@/types/agents";

export interface StatusBadgeConfig {
  label: string;
  badgeClass: string;
  dotClass: string;
}

export function formatAgentStatus(status: AgentStatus): StatusBadgeConfig {
  switch (status) {
    case "ACTIVE":
      return {
        label: "Active",
        badgeClass: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
        dotClass: "bg-emerald-400",
      };
    case "SUSPENDED":
      return {
        label: "Suspended",
        badgeClass: "bg-amber-500/10 text-amber-400 border-amber-500/20",
        dotClass: "bg-amber-400",
      };
    case "DEACTIVATED":
      return {
        label: "Deactivated",
        badgeClass: "bg-rose-500/10 text-rose-400 border-rose-500/20",
        dotClass: "bg-rose-400",
      };
    case "DRAFT":
    default:
      return {
        label: "Draft",
        badgeClass: "bg-gray-500/10 text-gray-400 border-gray-500/20",
        dotClass: "bg-gray-400",
      };
  }
}

export function formatAgentVersionStatus(status: AgentVersionStatus): StatusBadgeConfig {
  switch (status) {
    case "PUBLISHED":
      return {
        label: "Published",
        badgeClass: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
        dotClass: "bg-emerald-400",
      };
    case "RETIRED":
      return {
        label: "Retired",
        badgeClass: "bg-rose-500/10 text-rose-400 border-rose-500/20",
        dotClass: "bg-rose-400",
      };
    case "DRAFT":
    default:
      return {
        label: "Draft",
        badgeClass: "bg-blue-500/10 text-blue-400 border-blue-500/20",
        dotClass: "bg-blue-400",
      };
  }
}

export function formatRiskTier(tier: AgentRiskTier): { label: string; badgeClass: string } {
  switch (tier) {
    case "TIER_4":
      return {
        label: "Tier 4 (Critical)",
        badgeClass: "bg-rose-500/10 text-rose-400 border-rose-500/20",
      };
    case "TIER_3":
      return {
        label: "Tier 3 (High)",
        badgeClass: "bg-amber-500/10 text-amber-400 border-amber-500/20",
      };
    case "TIER_2":
      return {
        label: "Tier 2 (Moderate)",
        badgeClass: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20",
      };
    case "TIER_1":
    default:
      return {
        label: "Tier 1 (Low)",
        badgeClass: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
      };
  }
}

export function formatEnvironment(env: AgentEnvironment | string): { label: string; badgeClass: string } {
  const normalized = env.toUpperCase();
  switch (normalized) {
    case "PRODUCTION":
      return {
        label: "Production",
        badgeClass: "bg-purple-500/10 text-purple-400 border-purple-500/20",
      };
    case "STAGING":
      return {
        label: "Staging",
        badgeClass: "bg-amber-500/10 text-amber-400 border-amber-500/20",
      };
    case "DEVELOPMENT":
    default:
      return {
        label: "Development",
        badgeClass: "bg-blue-500/10 text-blue-400 border-blue-500/20",
      };
  }
}

export function formatDate(isoString: string | null | undefined): string {
  if (!isoString) return "—";
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return "—";
    return d.toLocaleString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
  } catch {
    return "—";
  }
}
