"use client";

/**
 * Empty & Error State Displays for VERIDEX SecOps Dashboard (Phase 9.3).
 */

import React from "react";

export function DashboardEmptyState({
  title = "No activity in selected interval",
  message = "No governance events, tool executions, or evaluations were recorded within the current time window.",
  className = "",
}: {
  title?: string;
  message?: string;
  className?: string;
}) {
  return (
    <div
      className={`p-8 text-center rounded-2xl bg-gray-950/40 border border-dashed border-gray-800 flex flex-col items-center justify-center ${className}`}
    >
      <div className="w-10 h-10 rounded-xl bg-gray-900 border border-gray-800 flex items-center justify-center text-gray-500 mb-3">
        <svg
          className="w-5 h-5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.5"
            d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
          />
        </svg>
      </div>
      <p className="text-xs font-semibold text-gray-300">{title}</p>
      <p className="text-[11px] text-gray-500 max-w-sm mt-1 leading-relaxed">{message}</p>
    </div>
  );
}

export function DashboardErrorCard({
  title = "Failed to load telemetry",
  error,
  onRetry,
}: {
  title?: string;
  error?: string | null;
  onRetry?: () => void;
}) {
  return (
    <div className="p-6 rounded-2xl bg-rose-500/5 border border-rose-500/20 text-rose-300 flex flex-col items-center text-center justify-center">
      <div className="w-10 h-10 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400 mb-3">
        <span className="text-base">⚠️</span>
      </div>
      <p className="text-xs font-semibold text-rose-200">{title}</p>
      {error && <p className="text-[11px] text-rose-400/80 font-mono mt-1 max-w-md">{error}</p>}
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-3 px-3 py-1.5 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 text-xs font-medium transition-colors border border-rose-500/30"
        >
          Retry Request
        </button>
      )}
    </div>
  );
}

