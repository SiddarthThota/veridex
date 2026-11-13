/**
 * Table Component for Approvals Queue (Phase 9.4).
 */

import React from "react";
import type { ApprovalRequestResponse } from "@/types/approvals";
import { ApprovalRow } from "./approval-row";
import { ApprovalTableSkeleton } from "./approval-skeleton";
import { ApprovalEmptyState, ApprovalErrorCard } from "./approval-empty-state";

interface ApprovalsQueueTableProps {
  items: ApprovalRequestResponse[];
  loading: boolean;
  error: string | null;
  statusFilter: string;
  selectedApprovalId?: string | null;
  onSelectApproval: (approval: ApprovalRequestResponse) => void;
  onResetFilter?: () => void;
  onRetry: () => void;
}

export function ApprovalsQueueTable({
  items,
  loading,
  error,
  statusFilter,
  selectedApprovalId,
  onSelectApproval,
  onResetFilter,
  onRetry,
}: ApprovalsQueueTableProps) {
  if (error) {
    return <ApprovalErrorCard message={error} onRetry={onRetry} />;
  }

  return (
    <div className="rounded-2xl border border-gray-800 bg-gray-950/60 overflow-hidden shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-gray-800 bg-gray-900/50 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
              <th className="px-6 py-3">Created</th>
              <th className="px-6 py-3">Status</th>
              <th className="px-6 py-3">Agent</th>
              <th className="px-6 py-3">Tool</th>
              <th className="px-6 py-3">Policy Triggers</th>
              <th className="px-6 py-3 text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {loading && items.length === 0 ? (
              <tr>
                <td colSpan={6} className="p-0">
                  <ApprovalTableSkeleton rows={6} />
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={6} className="p-0">
                  <ApprovalEmptyState statusFilter={statusFilter} onResetFilter={onResetFilter} />
                </td>
              </tr>
            ) : (
              items.map((approval) => (
                <ApprovalRow
                  key={approval.id}
                  approval={approval}
                  isSelected={selectedApprovalId === approval.id}
                  onSelect={onSelectApproval}
                />
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

