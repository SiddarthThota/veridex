"use client";

/**
 * Global Dashboard Filters Bar for VERIDEX SecOps Dashboard (Phase 9.3).
 *
 * Implements:
 * - Quick-select date presets: 24h, 7d (default), 30d.
 * - Custom date range input adhering to backend maximum 90-day interval boundary.
 * - Granularity toggle (hourly vs daily) with automatic fallback when range > 7 days.
 * - UTC half-open interval status display [start_time, end_time).
 */

import React, { useState } from "react";
import type { Granularity } from "@/types/analytics";
import type { DateRangeState } from "@/lib/analytics/use-analytics";
import { formatDateTime } from "@/lib/analytics/analytics-formatters";

interface DashboardFiltersProps {
  range: DateRangeState;
  onSetPreset: (preset: "24h" | "7d" | "30d") => void;
  onSetCustomRange: (startIso: string, endIso: string) => void;
  onSetGranularity: (granularity: Granularity) => void;
}

export function DashboardFilters({
  range,
  onSetPreset,
  onSetCustomRange,
  onSetGranularity,
}: DashboardFiltersProps) {
  const [showCustomModal, setShowCustomModal] = useState(false);
  const [customStart, setCustomStart] = useState(range.startTime.slice(0, 10));
  const [customEnd, setCustomEnd] = useState(range.endTime.slice(0, 10));
  const [customError, setCustomError] = useState<string | null>(null);

  // Calculate day difference to determine if hourly granularity is allowed (<= 7 days)
  const startMs = new Date(range.startTime).getTime();
  const endMs = new Date(range.endTime).getTime();
  const durationDays = (endMs - startMs) / (1000 * 60 * 60 * 24);
  const canUseHourly = durationDays <= 7.05; // Small margin for 7-day bounds

  const handleApplyCustom = (e: React.FormEvent) => {
    e.preventDefault();
    setCustomError(null);

    const s = new Date(`${customStart}T00:00:00Z`).getTime();
    const eTime = new Date(`${customEnd}T23:59:59Z`).getTime();

    if (isNaN(s) || isNaN(eTime)) {
      setCustomError("Please enter valid start and end dates.");
      return;
    }

    if (s >= eTime) {
      setCustomError("Start date must precede end date.");
      return;
    }

    const diffDays = (eTime - s) / (1000 * 60 * 60 * 24);
    if (diffDays > 90) {
      setCustomError("Date range cannot exceed the 90-day backend limit.");
      return;
    }

    onSetCustomRange(new Date(s).toISOString(), new Date(eTime).toISOString());
    setShowCustomModal(false);
  };

  return (
    <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 p-4 rounded-xl bg-gray-900/60 border border-gray-800/80">
      {/* Left: Presets + Custom Range Button */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-gray-400 font-medium mr-1">Time Horizon:</span>
        <button
          type="button"
          onClick={() => onSetPreset("24h")}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            range.preset === "24h"
              ? "bg-indigo-600 text-white shadow-xs"
              : "bg-gray-950 text-gray-300 hover:bg-gray-800 border border-gray-800"
          }`}
        >
          Last 24 Hours
        </button>
        <button
          type="button"
          onClick={() => onSetPreset("7d")}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            range.preset === "7d"
              ? "bg-indigo-600 text-white shadow-xs"
              : "bg-gray-950 text-gray-300 hover:bg-gray-800 border border-gray-800"
          }`}
        >
          Last 7 Days
        </button>
        <button
          type="button"
          onClick={() => onSetPreset("30d")}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            range.preset === "30d"
              ? "bg-indigo-600 text-white shadow-xs"
              : "bg-gray-950 text-gray-300 hover:bg-gray-800 border border-gray-800"
          }`}
        >
          Last 30 Days
        </button>
        <button
          type="button"
          onClick={() => setShowCustomModal(true)}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            range.preset === "custom"
              ? "bg-indigo-600 text-white shadow-xs"
              : "bg-gray-950 text-gray-300 hover:bg-gray-800 border border-gray-800"
          }`}
        >
          Custom Range...
        </button>
      </div>

      {/* Right: Granularity selector + UTC half-open interval badge */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Granularity Toggle */}
        <div className="flex items-center p-0.5 rounded-lg bg-gray-950 border border-gray-800">
          <button
            type="button"
            disabled={!canUseHourly}
            onClick={() => onSetGranularity("hour")}
            title={!canUseHourly ? "Hourly granularity is only supported for intervals <= 7 days" : undefined}
            className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
              range.granularity === "hour"
                ? "bg-gray-800 text-indigo-300 font-semibold"
                : "text-gray-400 hover:text-gray-200 disabled:opacity-40 disabled:cursor-not-allowed"
            }`}
          >
            Hourly
          </button>
          <button
            type="button"
            onClick={() => onSetGranularity("day")}
            className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
              range.granularity === "day"
                ? "bg-gray-800 text-indigo-300 font-semibold"
                : "text-gray-400 hover:text-gray-200"
            }`}
          >
            Daily
          </button>
        </div>

        {/* Current UTC interval display */}
        <div className="hidden sm:inline-flex items-center px-2.5 py-1 rounded-md text-[11px] font-mono text-gray-400 bg-gray-950 border border-gray-800">
          <span className="text-gray-500 mr-1.5">[</span>
          <span>{formatDateTime(range.startTime)}</span>
          <span className="text-gray-500 mx-1.5">→</span>
          <span>{formatDateTime(range.endTime)}</span>
          <span className="text-gray-500 ml-1.5">)</span>
        </div>
      </div>

      {/* Custom Date Range Modal Dialog */}
      {showCustomModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
          aria-labelledby="custom-range-title"
        >
          <div className="w-full max-w-sm p-6 bg-gray-900 border border-gray-800 rounded-2xl shadow-2xl">
            <h3 id="custom-range-title" className="text-sm font-semibold text-white mb-1">
              Select Custom UTC Interval
            </h3>
            <p className="text-xs text-gray-400 mb-4">
              Maximum allowable window is 90 days. Range is evaluated as [start, end).
            </p>

            {customError && (
              <div className="mb-4 p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs">
                {customError}
              </div>
            )}

            <form onSubmit={handleApplyCustom} className="space-y-3">
              <div>
                <label htmlFor="custom-start" className="block text-xs text-gray-400 mb-1">
                  Start Date (UTC)
                </label>
                <input
                  id="custom-start"
                  type="date"
                  required
                  value={customStart}
                  onChange={(e) => setCustomStart(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-950 border border-gray-800 rounded-lg text-xs text-gray-100 focus:outline-hidden focus:border-indigo-500"
                />
              </div>

              <div>
                <label htmlFor="custom-end" className="block text-xs text-gray-400 mb-1">
                  End Date (UTC)
                </label>
                <input
                  id="custom-end"
                  type="date"
                  required
                  value={customEnd}
                  onChange={(e) => setCustomEnd(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-950 border border-gray-800 rounded-lg text-xs text-gray-100 focus:outline-hidden focus:border-indigo-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setShowCustomModal(false)}
                  className="px-3 py-1.5 rounded-lg text-xs text-gray-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium transition-colors"
                >
                  Apply Range
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

