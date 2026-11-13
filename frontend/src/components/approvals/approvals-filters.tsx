/**
 * Status Filters and Pagination Controls for Approvals Queue (Phase 9.4).
 */

import React from "react";
import type { FilterStatus } from "@/lib/approvals/use-approvals";

interface ApprovalsFiltersProps {
  currentStatus: FilterStatus;
  onStatusChange: (status: FilterStatus) => void;
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
}

const STATUS_OPTIONS: { id: FilterStatus; label: string }[] = [
  { id: "PENDING", label: "Pending" },
  { id: "APPROVED", label: "Approved" },
  { id: "REJECTED", label: "Rejected" },
  { id: "EXPIRED", label: "Expired" },
  { id: "ALL", label: "All Requests" },
];

export function ApprovalsFilters({
  currentStatus,
  onStatusChange,
  page,
  pageSize,
  total,
  totalPages,
  onPageChange,
  onPageSizeChange,
}: ApprovalsFiltersProps) {
  const startItem = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const endItem = Math.min(page * pageSize, total);

  return (
    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 py-3">
      {/* Status Filter Tabs */}
      <div className="flex items-center gap-1.5 p-1 bg-gray-900/90 border border-gray-800 rounded-xl overflow-x-auto">
        {STATUS_OPTIONS.map((opt) => {
          const isActive = currentStatus === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => onStatusChange(opt.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                isActive
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "text-gray-400 hover:text-gray-200 hover:bg-gray-800/60"
              }`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>

      {/* Pagination & Count Controls */}
      <div className="flex items-center justify-between sm:justify-end gap-3 text-xs text-gray-400">
        <div className="flex items-center gap-1.5">
          <span>Show:</span>
          <select
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            className="bg-gray-900 border border-gray-800 rounded-lg px-2 py-1 text-gray-300 focus:outline-none"
            aria-label="Items per page"
          >
            <option value={10}>10</option>
            <option value={25}>25</option>
            <option value={50}>50</option>
          </select>
        </div>

        <span className="hidden sm:inline">
          {total === 0 ? "0 requests" : `${startItem}-${endItem} of ${total}`}
        </span>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 1}
            aria-label="Previous page"
            className="p-1.5 rounded-lg bg-gray-900 border border-gray-800 text-gray-400 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <span className="px-2 py-1 text-gray-400 font-mono text-xs">
            {page}/{totalPages}
          </span>
          <button
            type="button"
            onClick={() => onPageChange(page + 1)}
            disabled={page >= totalPages}
            aria-label="Next page"
            className="p-1.5 rounded-lg bg-gray-900 border border-gray-800 text-gray-400 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

