/**
 * Empty and Error States for Approvals Queue (Phase 9.4).
 */

import React from "react";
import { ApprovalsIcon } from "@/components/ui/icons";

interface ApprovalEmptyStateProps {
  statusFilter?: string;
  onResetFilter?: () => void;
}

export function ApprovalEmptyState({ statusFilter, onResetFilter }: ApprovalEmptyStateProps) {
  const isFiltered = statusFilter && statusFilter !== "ALL";

  return (
    <div className="py-16 px-6 text-center">
      <div className="inline-flex p-3 rounded-2xl bg-gray-900 border border-gray-800 text-gray-500 mb-4">
        <ApprovalsIcon className="w-8 h-8" />
      </div>
      <h4 className="text-sm font-semibold text-gray-200">
        {isFiltered ? `No ${statusFilter.toLowerCase()} approval requests` : "Approval queue is clear"}
      </h4>
      <p className="text-xs text-gray-400 mt-1.5 max-w-md mx-auto">
        {isFiltered
          ? `There are currently no requests matching the '${statusFilter}' status filter.`
          : "When an AI agent requests an action subject to human-in-the-loop governance policies, requests will appear here for review."}
      </p>
      {isFiltered && onResetFilter && (
        <button
          type="button"
          onClick={onResetFilter}
          className="mt-4 px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-xs font-medium text-gray-300 transition-colors"
        >
          View all requests
        </button>
      )}
    </div>
  );
}

interface ApprovalErrorCardProps {
  message: string;
  onRetry: () => void;
}

export function ApprovalErrorCard({ message, onRetry }: ApprovalErrorCardProps) {
  return (
    <div className="p-6 rounded-xl bg-rose-500/10 border border-rose-500/20 text-center my-4">
      <p className="text-sm font-medium text-rose-300">Unable to load approvals</p>
      <p className="text-xs text-rose-400/80 mt-1 max-w-md mx-auto">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-4 px-4 py-1.5 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/30 text-xs font-medium transition-colors"
      >
        Retry
      </button>
    </div>
  );
}

