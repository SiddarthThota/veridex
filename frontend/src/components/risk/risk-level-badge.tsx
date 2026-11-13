/**
 * Badge Components for Risk Levels and Agent History Status (Phase 9.5).
 */

import React from "react";
import type { AgentHistoryStatus, RiskLevel } from "@/types/risk";
import { getHistoryStatusStyle, getRiskLevelStyle } from "@/lib/risk/risk-formatters";

interface RiskLevelBadgeProps {
  level: RiskLevel;
}

export function RiskLevelBadge({ level }: RiskLevelBadgeProps) {
  const style = getRiskLevelStyle(level);

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold tracking-wider border ${style.badge}`}
    >
      {level}
    </span>
  );
}

interface AgentHistoryStatusBadgeProps {
  status: AgentHistoryStatus;
}

export function AgentHistoryStatusBadge({ status }: AgentHistoryStatusBadgeProps) {
  const style = getHistoryStatusStyle(status);

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold tracking-wide border ${style.badge}`}
      title={style.description}
    >
      {style.label}
    </span>
  );
}

