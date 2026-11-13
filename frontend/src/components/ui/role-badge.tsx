/**
 * User Role Badge component for VERIDEX (Phase 9.2).
 * Visually distinguishes the five canonical roles using a dark enterprise palette.
 */

import React from "react";
import type { UserRole } from "@/types/auth";

interface RoleBadgeProps {
  role: UserRole | string;
  className?: string;
  size?: "sm" | "md";
}

const ROLE_STYLES: Record<string, { label: string; classes: string }> = {
  ADMIN: {
    label: "Admin",
    classes: "bg-rose-500/10 text-rose-400 border-rose-500/20",
  },
  SECURITY_ANALYST: {
    label: "Security Analyst",
    classes: "bg-indigo-500/10 text-indigo-400 border-indigo-500/20",
  },
  AUDITOR: {
    label: "Auditor",
    classes: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20",
  },
  AGENT_OPERATOR: {
    label: "Agent Operator",
    classes: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  },
  VIEWER: {
    label: "Viewer",
    classes: "bg-gray-500/10 text-gray-400 border-gray-500/20",
  },
};

export function RoleBadge({ role, className = "", size = "md" }: RoleBadgeProps) {
  const config = ROLE_STYLES[role] || {
    label: role,
    classes: "bg-gray-500/10 text-gray-400 border-gray-500/20",
  };

  const sizeClasses = size === "sm" ? "px-2 py-0.5 text-xs" : "px-2.5 py-1 text-xs";

  return (
    <span
      className={`inline-flex items-center font-medium rounded-full border ${sizeClasses} ${config.classes} ${className}`}
      data-role={role}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-current mr-1.5 opacity-70" />
      {config.label}
    </span>
  );
}

