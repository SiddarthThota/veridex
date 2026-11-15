/**
 * UI Formatters and presentation helpers for Governed Tool Catalog (Phase 9.6).
 */

import type {
  ToolAccessType,
  ToolApprovalRequirement,
  ToolDataClassification,
  ToolReversibility,
  ToolRiskLevel,
  ToolStatus,
  ToolVersionStatus,
} from "@/types/tools";

export interface StatusBadgeConfig {
  label: string;
  badgeClass: string;
  dotClass: string;
}

export function formatToolStatus(status: ToolStatus): StatusBadgeConfig {
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

export function formatToolVersionStatus(status: ToolVersionStatus): StatusBadgeConfig {
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

export function formatToolRiskLevel(riskLevel: ToolRiskLevel): { label: string; badgeClass: string } {
  switch (riskLevel) {
    case "CRITICAL":
      return {
        label: "Critical Risk",
        badgeClass: "bg-rose-500/10 text-rose-400 border-rose-500/20",
      };
    case "HIGH":
      return {
        label: "High Risk",
        badgeClass: "bg-amber-500/10 text-amber-400 border-amber-500/20",
      };
    case "MEDIUM":
      return {
        label: "Medium Risk",
        badgeClass: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
      };
    case "LOW":
    default:
      return {
        label: "Low Risk",
        badgeClass: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
      };
  }
}

export function formatAccessType(accessType: ToolAccessType): { label: string; badgeClass: string } {
  switch (accessType) {
    case "WRITE":
      return {
        label: "Write (Mutating)",
        badgeClass: "bg-rose-500/10 text-rose-400 border-rose-500/20",
      };
    case "READ":
    default:
      return {
        label: "Read Only",
        badgeClass: "bg-blue-500/10 text-blue-400 border-blue-500/20",
      };
  }
}

export function formatReversibility(reversibility: ToolReversibility): { label: string; badgeClass: string } {
  switch (reversibility) {
    case "IRREVERSIBLE":
      return {
        label: "Irreversible",
        badgeClass: "bg-rose-500/10 text-rose-400 border-rose-500/20",
      };
    case "REVERSIBLE":
    default:
      return {
        label: "Reversible",
        badgeClass: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
      };
  }
}

export function formatDataClassification(classification: ToolDataClassification): { label: string; badgeClass: string } {
  switch (classification) {
    case "RESTRICTED":
      return {
        label: "Restricted",
        badgeClass: "bg-rose-500/10 text-rose-400 border-rose-500/20",
      };
    case "CONFIDENTIAL":
      return {
        label: "Confidential",
        badgeClass: "bg-amber-500/10 text-amber-400 border-amber-500/20",
      };
    case "INTERNAL":
      return {
        label: "Internal",
        badgeClass: "bg-blue-500/10 text-blue-400 border-blue-500/20",
      };
    case "PUBLIC":
    default:
      return {
        label: "Public",
        badgeClass: "bg-gray-500/10 text-gray-400 border-gray-500/20",
      };
  }
}

export function formatApprovalRequirement(requirement: ToolApprovalRequirement): { label: string; badgeClass: string } {
  switch (requirement) {
    case "REQUIRED":
      return {
        label: "Mandatory Approval",
        badgeClass: "bg-rose-500/10 text-rose-400 border-rose-500/20",
      };
    case "OPTIONAL":
      return {
        label: "Optional Approval",
        badgeClass: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
      };
    case "NOT_REQUIRED":
    default:
      return {
        label: "No Approval Required",
        badgeClass: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
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

