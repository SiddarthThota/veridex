/**
 * Client-Side Version Structural Diff Modal (Phase 9.5).
 *
 * Compares two PolicyVersion rule sets and visualizes added, removed,
 * and modified rules without requiring a backend diff endpoint.
 */

"use client";

import React, { useMemo } from "react";
import type { PolicyVersionResponse } from "@/types/policies";
import { computeVersionDiff } from "@/lib/policies/policies-formatters";

interface PolicyVersionDiffModalProps {
  versionA: PolicyVersionResponse;
  versionB: PolicyVersionResponse;
  onClose: () => void;
}

export function PolicyVersionDiffModal({
  versionA,
  versionB,
  onClose,
}: PolicyVersionDiffModalProps) {
  const diffs = useMemo(() => {
    return computeVersionDiff(versionA, versionB);
  }, [versionA, versionB]);

  const addedCount = diffs.filter((d) => d.type === "ADDED").length;
  const removedCount = diffs.filter((d) => d.type === "REMOVED").length;
  const modifiedCount = diffs.filter((d) => d.type === "MODIFIED").length;
  const unchangedCount = diffs.filter((d) => d.type === "UNCHANGED").length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
      <div className="w-full max-w-3xl max-h-[85vh] rounded-2xl bg-gray-900 border border-gray-800 shadow-2xl flex flex-col overflow-hidden">
        {/* Modal Header */}
        <div className="p-5 border-b border-gray-800 flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <span>Version Comparison:</span>
              <span className="font-mono text-indigo-400">v{versionA.version_number}</span>
              <span className="text-gray-500">→</span>
              <span className="font-mono text-emerald-400">v{versionB.version_number}</span>
            </h3>
            <p className="text-xs text-gray-400 mt-1">
              Client-side structural comparison of rule configurations and condition trees.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-white p-1 rounded-lg hover:bg-gray-800"
          >
            ✕
          </button>
        </div>

        {/* Diff Summary Bar */}
        <div className="flex items-center gap-3 px-5 py-2.5 bg-gray-950/60 border-b border-gray-800 text-xs">
          <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">
            +{addedCount} Added
          </span>
          <span className="px-2 py-0.5 rounded bg-rose-500/10 text-rose-400 border border-rose-500/20 font-medium">
            -{removedCount} Removed
          </span>
          <span className="px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 font-medium">
            ~{modifiedCount} Modified
          </span>
          <span className="px-2 py-0.5 rounded bg-gray-800 text-gray-400 font-medium">
            ={unchangedCount} Unchanged
          </span>
        </div>

        {/* Diff Item List */}
        <div className="p-5 overflow-y-auto space-y-3 flex-1">
          {diffs.map((diff, index) => (
            <div
              key={index}
              className={`p-3.5 rounded-xl border text-xs space-y-2 ${
                diff.type === "ADDED"
                  ? "bg-emerald-950/20 border-emerald-800/40"
                  : diff.type === "REMOVED"
                  ? "bg-rose-950/20 border-rose-800/40"
                  : diff.type === "MODIFIED"
                  ? "bg-amber-950/20 border-amber-800/40"
                  : "bg-gray-950/40 border-gray-800/60 opacity-60"
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 font-semibold text-white">
                  <span
                    className={`px-1.5 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider ${
                      diff.type === "ADDED"
                        ? "bg-emerald-500/20 text-emerald-400"
                        : diff.type === "REMOVED"
                        ? "bg-rose-500/20 text-rose-400"
                        : diff.type === "MODIFIED"
                        ? "bg-amber-500/20 text-amber-400"
                        : "bg-gray-800 text-gray-400"
                    }`}
                  >
                    {diff.type}
                  </span>
                  <span>{diff.ruleName}</span>
                </div>
                <span className="text-gray-400 text-[11px]">{diff.details}</span>
              </div>

              {diff.type === "MODIFIED" && diff.vA && diff.vB && (
                <div className="grid grid-cols-2 gap-3 pt-2 border-t border-gray-800/80 font-mono text-[11px]">
                  <div className="p-2 rounded bg-gray-950 text-rose-300">
                    <span className="text-[10px] text-gray-500 block mb-1">v{versionA.version_number} Original:</span>
                    <div>Action: {diff.vA.action}</div>
                    <div>Order: #{diff.vA.rule_order}</div>
                    <div>Violation: {diff.vA.violation_code}</div>
                  </div>
                  <div className="p-2 rounded bg-gray-950 text-emerald-300">
                    <span className="text-[10px] text-gray-500 block mb-1">v{versionB.version_number} New:</span>
                    <div>Action: {diff.vB.action}</div>
                    <div>Order: #{diff.vB.rule_order}</div>
                    <div>Violation: {diff.vB.violation_code}</div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-gray-800 bg-gray-950/60 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-200 text-xs font-medium transition-colors"
          >
            Close Comparison
          </button>
        </div>
      </div>
    </div>
  );
}

