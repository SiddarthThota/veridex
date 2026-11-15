"use client";

import React from "react";
import type { RunStatus } from "@/types/runs";
import { formatRunStatus } from "@/lib/runs/runs-formatters";

interface RunStatusBadgeProps {
  status: RunStatus;
  size?: "sm" | "md";
}

export function RunStatusBadge({ status, size = "md" }: RunStatusBadgeProps) {
  const config = formatRunStatus(status);
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
