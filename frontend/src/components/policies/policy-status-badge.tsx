/**
 * Badge Components for Policy Status, Type, and Actions (Phase 9.5).
 */

import React from "react";
import type { PolicyAction, PolicyStatus, PolicyType, PolicyVersionStatus } from "@/types/policies";
import {
  getActionStyle,
  getPolicyStatusStyle,
  getPolicyTypeStyle,
} from "@/lib/policies/policies-formatters";

interface PolicyStatusBadgeProps {
  status: PolicyStatus;
}

export function PolicyStatusBadge({ status }: PolicyStatusBadgeProps) {
  const style = getPolicyStatusStyle(status);

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border ${style.bg} ${style.text} ${style.border}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
      {style.label}
    </span>
  );
}

interface PolicyTypeBadgeProps {
  type: PolicyType;
}

export function PolicyTypeBadge({ type }: PolicyTypeBadgeProps) {
  const style = getPolicyTypeStyle(type);

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium border ${style.badge}`}
    >
      {style.label}
    </span>
  );
}

interface PolicyActionBadgeProps {
  action: PolicyAction;
}

export function PolicyActionBadge({ action }: PolicyActionBadgeProps) {
  const style = getActionStyle(action);

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold tracking-wider border ${style.badge}`}
    >
      {style.label}
    </span>
  );
}

interface PolicyVersionStatusBadgeProps {
  status: PolicyVersionStatus;
}

export function PolicyVersionStatusBadge({ status }: PolicyVersionStatusBadgeProps) {
  switch (status) {
    case "PUBLISHED":
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
          Published (Immutable)
        </span>
      );
    case "DRAFT":
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
          Draft (Mutable)
        </span>
      );
    case "RETIRED":
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-gray-500/10 text-gray-400 border border-gray-500/20">
          <span className="w-1.5 h-1.5 rounded-full bg-gray-400" />
          Retired
        </span>
      );
  }
}

