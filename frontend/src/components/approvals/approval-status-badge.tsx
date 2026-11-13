/**
 * Canonical Status Badge for VERIDEX Approvals (Phase 9.4).
 */

import React from "react";
import type { ApprovalStatus } from "@/types/approvals";
import { getApprovalStatusStyle } from "@/lib/approvals/approvals-formatters";

interface ApprovalStatusBadgeProps {
  status: ApprovalStatus;
  className?: string;
  showDot?: boolean;
}

export function ApprovalStatusBadge({
  status,
  className = "",
  showDot = true,
}: ApprovalStatusBadgeProps) {
  const style = getApprovalStatusStyle(status);

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border ${style.badge} ${className}`}
    >
      {showDot && <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />}
      {style.label}
    </span>
  );
}

