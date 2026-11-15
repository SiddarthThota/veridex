"use client";

import React from "react";
import type { AgentStatus } from "@/types/agents";
import { formatAgentStatus } from "@/lib/agents/agents-formatters";

interface AgentStatusBadgeProps {
  status: AgentStatus;
  size?: "sm" | "md";
}

export function AgentStatusBadge({ status, size = "md" }: AgentStatusBadgeProps) {
  const config = formatAgentStatus(status);
  const sizeClasses = size === "sm" ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-1 text-xs";

  return (
    <span
      className={`inline-flex items-center gap-1.5 font-medium rounded-full border ${config.badgeClass} ${sizeClasses}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${config.dotClass}`} />
      {config.label}
    </span>
  );
}
