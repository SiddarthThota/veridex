/**
 * Dark-first Skeleton Loaders for VERIDEX Approvals (Phase 9.4).
 */

import React from "react";

export function ApprovalTableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="divide-y divide-gray-800/80 animate-pulse">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="px-6 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4 flex-1">
            <div className="w-20 h-4 bg-gray-800 rounded" />
            <div className="w-24 h-6 bg-gray-800/60 rounded-md" />
            <div className="w-32 h-4 bg-gray-800/80 rounded" />
            <div className="w-28 h-4 bg-gray-800/70 rounded" />
            <div className="w-24 h-5 bg-gray-800/50 rounded" />
          </div>
          <div className="w-20 h-8 bg-gray-800 rounded-lg" />
        </div>
      ))}
    </div>
  );
}

export function ApprovalDetailSkeleton() {
  return (
    <div className="p-6 space-y-6 animate-pulse">
      <div className="flex items-center justify-between pb-4 border-b border-gray-800">
        <div className="space-y-2">
          <div className="w-48 h-6 bg-gray-800 rounded" />
          <div className="w-32 h-4 bg-gray-800/60 rounded" />
        </div>
        <div className="w-24 h-7 bg-gray-800 rounded-md" />
      </div>

      <div className="space-y-3">
        <div className="w-28 h-4 bg-gray-800 rounded" />
        <div className="grid grid-cols-2 gap-3">
          <div className="h-16 bg-gray-900/60 border border-gray-800 rounded-xl" />
          <div className="h-16 bg-gray-900/60 border border-gray-800 rounded-xl" />
        </div>
      </div>

      <div className="space-y-3">
        <div className="w-36 h-4 bg-gray-800 rounded" />
        <div className="h-32 bg-gray-900/60 border border-gray-800 rounded-xl" />
      </div>

      <div className="space-y-3">
        <div className="w-40 h-4 bg-gray-800 rounded" />
        <div className="h-40 bg-gray-950/80 border border-gray-800 rounded-xl" />
      </div>
    </div>
  );
}

