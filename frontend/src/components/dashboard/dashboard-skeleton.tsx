"use client";

/**
 * Loading Skeletons and Empty State Display for VERIDEX SecOps Dashboard (Phase 9.3).
 * Zero external dependencies, styled with Tailwind CSS dark enterprise theme.
 */

import React from "react";

export function KpiCardSkeleton() {
  return (
    <div className="p-5 rounded-2xl bg-gray-900/60 border border-gray-800/80 animate-pulse">
      <div className="flex items-center justify-between mb-3">
        <div className="h-3 w-28 bg-gray-800 rounded-sm" />
        <div className="h-5 w-12 bg-gray-800 rounded-full" />
      </div>
      <div className="h-8 w-24 bg-gray-800 rounded-md my-2" />
      <div className="h-3 w-36 bg-gray-800/60 rounded-sm mt-3" />
    </div>
  );
}

export function ChartSkeleton({ height = "h-72" }: { height?: string }) {
  return (
    <div className={`p-6 rounded-2xl bg-gray-900/60 border border-gray-800/80 animate-pulse ${height} flex flex-col justify-between`}>
      <div className="flex items-center justify-between">
        <div className="h-4 w-36 bg-gray-800 rounded-sm" />
        <div className="h-3 w-24 bg-gray-800/60 rounded-sm" />
      </div>
      <div className="flex-1 flex items-end gap-3 pt-6 pb-2">
        <div className="h-1/3 flex-1 bg-gray-800/50 rounded-t-sm" />
        <div className="h-2/3 flex-1 bg-gray-800/50 rounded-t-sm" />
        <div className="h-1/2 flex-1 bg-gray-800/50 rounded-t-sm" />
        <div className="h-3/4 flex-1 bg-gray-800/50 rounded-t-sm" />
        <div className="h-2/5 flex-1 bg-gray-800/50 rounded-t-sm" />
        <div className="h-4/5 flex-1 bg-gray-800/50 rounded-t-sm" />
      </div>
      <div className="h-3 w-full bg-gray-800/40 rounded-sm" />
    </div>
  );
}

export function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="p-6 rounded-2xl bg-gray-900/60 border border-gray-800/80 animate-pulse">
      <div className="h-4 w-40 bg-gray-800 rounded-sm mb-4" />
      <div className="space-y-3">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="h-10 bg-gray-950/60 rounded-lg flex items-center px-4 gap-4">
            <div className="h-3 w-32 bg-gray-800 rounded-sm" />
            <div className="h-3 w-20 bg-gray-800/60 rounded-sm" />
            <div className="h-3 w-16 bg-gray-800/40 rounded-sm ml-auto" />
          </div>
        ))}
      </div>
    </div>
  );
}

