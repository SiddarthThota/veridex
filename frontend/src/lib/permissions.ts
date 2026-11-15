/**
 * Authoritative Five-Role Permission Configuration for VERIDEX (Phase 9.2).
 *
 * Implements granular navigation visibility, page access control, and functional
 * permission rules across the five canonical roles:
 * - ADMIN
 * - SECURITY_ANALYST
 * - AUDITOR
 * - AGENT_OPERATOR
 * - VIEWER
 *
 * Grounded in the audited v0.8.0 FastAPI backend endpoint permission matrix.
 */

import type { UserRole } from "@/types/auth";

export interface NavItemConfig {
  id: string;
  name: string;
  href: string;
  icon: string;
  description: string;
  allowedRoles: readonly UserRole[];
}

/**
 * Navigation registry matching Section 2.1 of the Audited Architecture Specification.
 */
export const NAVIGATION_ITEMS: readonly NavItemConfig[] = [
  {
    id: "dashboard",
    name: "Dashboard",
    href: "/dashboard",
    icon: "dashboard",
    description: "Security operations overview & governance analytics",
    allowedRoles: ["ADMIN", "SECURITY_ANALYST", "AUDITOR"],
  },
  {
    id: "approvals",
    name: "Approvals",
    href: "/approvals",
    icon: "approvals",
    description: "Human-in-the-loop review queue for gated tool executions",
    allowedRoles: ["ADMIN", "SECURITY_ANALYST", "AUDITOR", "AGENT_OPERATOR"],
  },
  {
    id: "runs",
    name: "Agent Runs",
    href: "/runs",
    icon: "runs",
    description: "Agent execution runs and tool invocation audit logs",
    allowedRoles: ["ADMIN", "SECURITY_ANALYST", "AUDITOR", "AGENT_OPERATOR"],
  },
  {
    id: "agents",
    name: "Agents",
    href: "/agents",
    icon: "agents",
    description: "Registered AI agents, risk tiers, and tool bindings",
    allowedRoles: ["ADMIN", "SECURITY_ANALYST", "AUDITOR", "AGENT_OPERATOR", "VIEWER"],
  },
  {
    id: "tools",
    name: "Tools",
    href: "/tools",
    icon: "tools",
    description: "Governed tools, risk classifications, and versions",
    allowedRoles: ["ADMIN", "SECURITY_ANALYST", "AUDITOR", "AGENT_OPERATOR", "VIEWER"],
  },
  {
    id: "policies",
    name: "Policies",
    href: "/policies",
    icon: "policies",
    description: "Declarative governance rules, condition trees, and simulations",
    allowedRoles: ["ADMIN", "SECURITY_ANALYST", "AUDITOR", "AGENT_OPERATOR", "VIEWER"],
  },
  {
    id: "risk",
    name: "Risk Engine",
    href: "/risk",
    icon: "risk",
    description: "Multi-dimensional risk scoring, thresholds, and profiles",
    allowedRoles: ["ADMIN", "SECURITY_ANALYST", "AUDITOR", "AGENT_OPERATOR", "VIEWER"],
  },
  {
    id: "organization",
    name: "Organization & Users",
    href: "/organization",
    icon: "organization",
    description: "Tenant profile and user directory",
    allowedRoles: ["ADMIN", "SECURITY_ANALYST", "AUDITOR"],
  },
] as const;

/**
 * Route-to-allowed-roles mapping for page-level access control.
 */
export const ROUTE_PERMISSIONS: Record<string, readonly UserRole[]> = {
  "/": ["ADMIN", "SECURITY_ANALYST", "AUDITOR", "AGENT_OPERATOR", "VIEWER"],
  "/dashboard": ["ADMIN", "SECURITY_ANALYST", "AUDITOR"],
  "/approvals": ["ADMIN", "SECURITY_ANALYST", "AUDITOR", "AGENT_OPERATOR"],
  "/runs": ["ADMIN", "SECURITY_ANALYST", "AUDITOR", "AGENT_OPERATOR"],
  "/agents": ["ADMIN", "SECURITY_ANALYST", "AUDITOR", "AGENT_OPERATOR", "VIEWER"],
  "/tools": ["ADMIN", "SECURITY_ANALYST", "AUDITOR", "AGENT_OPERATOR", "VIEWER"],
  "/policies": ["ADMIN", "SECURITY_ANALYST", "AUDITOR", "AGENT_OPERATOR", "VIEWER"],
  "/risk": ["ADMIN", "SECURITY_ANALYST", "AUDITOR", "AGENT_OPERATOR", "VIEWER"],
  "/organization": ["ADMIN", "SECURITY_ANALYST", "AUDITOR"],
};

/**
 * Safely decodes and normalizes URL path segments, resolving traversal (.. and .),
 * stripping query/hash strings, and rejecting malformed or backslash-tainted inputs.
 */
export function normalizePath(rawPath: string | null | undefined): string {
  if (!rawPath || typeof rawPath !== "string") return "";

  let decoded: string;
  try {
    decoded = decodeURIComponent(rawPath);
  } catch {
    return "";
  }

  // Reject backslashes to prevent open-redirect or path delimiter confusion
  if (decoded.includes("\\")) {
    return "";
  }

  // Strip query string and fragments for path resolution
  const pathWithoutQuery = decoded.split(/[?#]/)[0];

  // Resolve path segments (. and .. POSIX normalization)
  const segments = pathWithoutQuery.split("/").filter(Boolean);
  const resolved: string[] = [];

  for (const seg of segments) {
    if (seg === ".") continue;
    if (seg === "..") {
      if (resolved.length > 0) {
        resolved.pop();
      }
    } else {
      resolved.push(seg);
    }
  }

  return "/" + resolved.join("/");
}

/**
 * Check if a role has access to view a specific navigation route.
 */
export function canAccessPage(role: UserRole | undefined, pathname: string): boolean {
  if (!role) return false;

  const normalized = normalizePath(pathname);
  if (!normalized) return false;

  // Root path handling
  if (normalized === "/") {
    return true;
  }

  // Find matching route config
  for (const [routePath, allowed] of Object.entries(ROUTE_PERMISSIONS)) {
    if (routePath !== "/" && (normalized === routePath || normalized.startsWith(`${routePath}/`))) {
      return allowed.includes(role);
    }
  }

  // Unlisted internal routes default to false
  return false;
}

/**
 * Filter navigation items visible to a given user role.
 */
export function getPermittedNavItems(role: UserRole | undefined): readonly NavItemConfig[] {
  if (!role) return [];
  return NAVIGATION_ITEMS.filter((item) => item.allowedRoles.includes(role));
}

/**
 * Determine the safe default landing route after login based on role.
 * Prevents 403 redirect loops for roles blocked from the Analytics Dashboard.
 */
export function getDefaultLandingRoute(role: UserRole | undefined): string {
  switch (role) {
    case "ADMIN":
    case "SECURITY_ANALYST":
    case "AUDITOR":
      return "/dashboard";
    case "AGENT_OPERATOR":
      return "/runs";
    case "VIEWER":
      return "/agents";
    default:
      return "/login";
  }
}

// =========================================================================
// Functional & Mutation Permission Checks (aligned with v0.8.0 API)
// =========================================================================

/** Can view governance analytics endpoints (/api/v1/analytics/*) */
export function canReadAnalytics(role: UserRole | undefined): boolean {
  return role === "ADMIN" || role === "SECURITY_ANALYST" || role === "AUDITOR";
}

/** Can decide human approval requests (/api/v1/governance/approvals/{id}/decide) */
export function canDecideApproval(role: UserRole | undefined): boolean {
  return role === "ADMIN" || role === "SECURITY_ANALYST";
}

/** Can trigger dry-run policy evaluation (/api/v1/governance/evaluate) */
export function canDryRunEvaluate(role: UserRole | undefined): boolean {
  return role === "ADMIN" || role === "SECURITY_ANALYST" || role === "AGENT_OPERATOR";
}

/** Can create or update agent runs and invoke tools (/api/v1/runs/*) */
export function canManageRuns(role: UserRole | undefined): boolean {
  return role === "ADMIN" || role === "AGENT_OPERATOR";
}

/** Can register, update, and manage agent lifecycles (/api/v1/agents/*) */
export function canManageAgents(role: UserRole | undefined): boolean {
  return role === "ADMIN" || role === "AGENT_OPERATOR";
}

/** Can register, update, and publish tool definitions (/api/v1/tools/*) */
export function canManageTools(role: UserRole | undefined): boolean {
  return role === "ADMIN" || role === "SECURITY_ANALYST";
}

/** Can create, edit, and publish governance policies and rules (/api/v1/policies/*) */
export function canManagePolicies(role: UserRole | undefined): boolean {
  return role === "ADMIN" || role === "SECURITY_ANALYST";
}

/** Can create and publish new risk configuration versions (/api/v1/risk/config/versions) */
export function canManageRiskConfig(role: UserRole | undefined): boolean {
  return role === "ADMIN" || role === "SECURITY_ANALYST";
}

/** Can simulate policy rules against test invocations (/api/v1/policies/simulate) */
export function canSimulatePolicies(role: UserRole | undefined): boolean {
  return role === "ADMIN" || role === "SECURITY_ANALYST" || role === "AUDITOR" || role === "AGENT_OPERATOR";
}

/** Can view organization users list (/api/v1/users) */
export function canReadUsers(role: UserRole | undefined): boolean {
  return role === "ADMIN" || role === "SECURITY_ANALYST" || role === "AUDITOR";
}

/** Can reveal unmasked arguments and raw execution outputs in forensics inspection */
export function canRevealSensitiveData(role: UserRole | undefined): boolean {
  return role === "ADMIN" || role === "SECURITY_ANALYST";
}


