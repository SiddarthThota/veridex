/**
 * Risk Assessment Deep-Dive Detail Drawer Component (Phase 9.5).
 *
 * Implements thorough inspection of immutable assessment records:
 * - 4-vector decomposition with SVG radar & linear progress bars
 * - Factor breakdown JSON inspector
 * - Matched argument heuristics table
 * - Explanation and configuration snapshot
 * - "Load as Config Template" action
 */

"use client";

import React, { useState } from "react";
import type { RiskAssessmentResponse } from "@/types/risk";
import { getRiskLevelStyle } from "@/lib/risk/risk-formatters";
import { RiskLevelBadge } from "./risk-level-badge";
import { RiskVectorBreakdown } from "./risk-vector-breakdown";

interface RiskAssessmentDrawerProps {
  assessment: RiskAssessmentResponse | null;
  loading?: boolean;
  onClose: () => void;
  onLoadAsTemplate?: (snapshot: Record<string, unknown>) => void;
}

export function RiskAssessmentDrawer({
  assessment,
  loading = false,
  onClose,
  onLoadAsTemplate,
}: RiskAssessmentDrawerProps) {
  const [activeTab, setActiveTab] = useState<"vectors" | "factors" | "heuristics" | "config">("vectors");

  if (!assessment) return null;

  const levelStyle = getRiskLevelStyle(assessment.risk_level);
  const subscores = {
    tool: assessment.subscore_tool,
    data: assessment.subscore_data,
    agent: assessment.subscore_agent,
    context: assessment.subscore_context,
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-xs">
      <div className="w-full max-w-2xl h-full bg-gray-900 border-l border-gray-800 shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-right duration-300">
        {/* Drawer Header */}
        <div className="p-5 border-b border-gray-800 flex items-center justify-between bg-gray-950/60">
          <div>
            <div className="flex items-center gap-2.5">
              <h3 className="text-base font-bold text-white">Risk Assessment Audit</h3>
              <RiskLevelBadge level={assessment.risk_level} />
              {loading && (
                <span className="text-xs text-brand-400 animate-pulse font-mono">
                  Loading...
                </span>
              )}
            </div>
            <p className="text-xs text-gray-400 mt-1 font-mono">
              ID: {assessment.id}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-white p-1.5 rounded-lg hover:bg-gray-800 transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Core Metric Banner */}
        <div className="p-5 bg-gray-950/40 border-b border-gray-800 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex flex-col items-center justify-center w-16 h-16 rounded-2xl bg-gray-900 border border-gray-800">
              <span className={`text-2xl font-black font-mono ${levelStyle.text}`}>
                {assessment.risk_score}
              </span>
              <span className="text-[10px] uppercase font-semibold text-gray-500">Score</span>
            </div>
            <div>
              <span className={`text-sm font-bold ${levelStyle.text}`}>{levelStyle.label}</span>
              <p className="text-xs text-gray-400 mt-0.5">
                Algorithm: <span className="font-mono text-gray-300">v{assessment.scoring_algorithm_version}</span> • Assessed: {new Date(assessment.assessed_at).toLocaleString()}
              </p>
            </div>
          </div>

          {onLoadAsTemplate && assessment.config_snapshot && Object.keys(assessment.config_snapshot).length > 0 && (
            <button
              type="button"
              onClick={() => onLoadAsTemplate(assessment.config_snapshot)}
              className="text-xs px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-indigo-300 hover:text-indigo-200 transition-colors border border-gray-700 font-medium"
              title="Pre-populate Risk Config Publisher with this assessment's scoring parameters"
            >
              Use as Config Template
            </button>
          )}
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-1 px-5 pt-3 border-b border-gray-800 bg-gray-950/20 text-xs">
          <button
            type="button"
            onClick={() => setActiveTab("vectors")}
            className={`pb-2.5 px-3 font-semibold transition-colors border-b-2 ${
              activeTab === "vectors"
                ? "border-indigo-500 text-white"
                : "border-transparent text-gray-400 hover:text-gray-200"
            }`}
          >
            4-Vector Breakdown
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("heuristics")}
            className={`pb-2.5 px-3 font-semibold transition-colors border-b-2 ${
              activeTab === "heuristics"
                ? "border-indigo-500 text-white"
                : "border-transparent text-gray-400 hover:text-gray-200"
            }`}
          >
            Heuristics ({assessment.heuristics_matched?.length || 0})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("factors")}
            className={`pb-2.5 px-3 font-semibold transition-colors border-b-2 ${
              activeTab === "factors"
                ? "border-indigo-500 text-white"
                : "border-transparent text-gray-400 hover:text-gray-200"
            }`}
          >
            Factor Breakdown
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("config")}
            className={`pb-2.5 px-3 font-semibold transition-colors border-b-2 ${
              activeTab === "config"
                ? "border-indigo-500 text-white"
                : "border-transparent text-gray-400 hover:text-gray-200"
            }`}
          >
            Config Snapshot
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 overflow-y-auto space-y-5 flex-1">
          {/* Explanation Text */}
          {assessment.explanation && (
            <div className="p-3.5 rounded-xl bg-gray-950 border border-gray-800 text-xs text-gray-300 space-y-1">
              <span className="font-semibold text-gray-400 block text-[11px] uppercase tracking-wider">
                Scoring Explanation:
              </span>
              <p className="leading-relaxed">{assessment.explanation}</p>
            </div>
          )}

          {/* Tab 1: 4-Vector Breakdown */}
          {activeTab === "vectors" && (
            <div className="space-y-4">
              <RiskVectorBreakdown subscores={subscores} />

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="p-3 rounded-xl bg-gray-950/60 border border-gray-800 space-y-1">
                  <span className="text-[11px] text-gray-500">Agent ID</span>
                  <div className="font-mono text-gray-300 truncate" title={assessment.agent_id}>
                    {assessment.agent_id}
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-gray-950/60 border border-gray-800 space-y-1">
                  <span className="text-[11px] text-gray-500">Tool ID & Version</span>
                  <div className="font-mono text-gray-300 truncate" title={`${assessment.tool_id} (v${assessment.tool_version_id})`}>
                    {assessment.tool_id}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Tab 2: Matched Heuristics */}
          {activeTab === "heuristics" && (
            <div className="space-y-3">
              {(!assessment.heuristics_matched || assessment.heuristics_matched.length === 0) ? (
                <div className="p-8 text-center text-xs text-gray-500 border border-dashed border-gray-800 rounded-xl">
                  No argument pattern heuristic rules triggered for this execution.
                </div>
              ) : (
                assessment.heuristics_matched.map((h, i) => (
                  <div
                    key={i}
                    className="p-3.5 rounded-xl bg-rose-950/20 border border-rose-800/40 text-xs space-y-1.5"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-bold text-rose-300">{h.rule_id}</span>
                      <span className="px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 font-bold text-[10px]">
                        +{h.score_contribution} pts
                      </span>
                    </div>
                    <div className="text-gray-400 flex items-center gap-2">
                      <span>Path:</span>
                      <span className="font-mono text-gray-300">{h.path}</span>
                    </div>
                    <div className="text-[11px] text-rose-400">Severity: {h.severity}</div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* Tab 3: Factor Breakdown JSON */}
          {activeTab === "factors" && (
            <div className="p-3.5 rounded-xl bg-gray-950 border border-gray-800 overflow-x-auto font-mono text-xs text-emerald-400">
              <pre>{JSON.stringify(assessment.factor_breakdown || {}, null, 2)}</pre>
            </div>
          )}

          {/* Tab 4: Config Snapshot JSON */}
          {activeTab === "config" && (
            <div className="p-3.5 rounded-xl bg-gray-950 border border-gray-800 overflow-x-auto font-mono text-xs text-indigo-300">
              <pre>{JSON.stringify(assessment.config_snapshot || {}, null, 2)}</pre>
            </div>
          )}
        </div>

        {/* Drawer Footer */}
        <div className="p-4 border-t border-gray-800 bg-gray-950/60 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-200 text-xs font-medium transition-colors"
          >
            Close Drawer
          </button>
        </div>
      </div>
    </div>
  );
}

