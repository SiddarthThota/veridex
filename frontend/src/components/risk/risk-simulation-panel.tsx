/**
 * Quantitative Risk Evaluation & Dry-Run Simulation Studio (Phase 9.5).
 *
 * Implements real-time simulation without database persistence:
 * - Registered Agent, Tool, and Version selectors
 * - Zero-dependency JSON argument editor
 * - 4-vector decomposition with SVG radar & progress meters
 * - Matched heuristic breakdown and explanation
 * - Accessible to all 5 roles
 */

"use client";

import React, { useEffect, useState } from "react";
import type { RiskEvaluateRequest, RiskEvaluateResponse } from "@/types/risk";
import type { AgentSummary, ToolSummary, ToolVersionSummary } from "@/types/entities";
import { JsonArgumentEditor } from "@/components/common/json-argument-editor";
import { getRiskLevelStyle } from "@/lib/risk/risk-formatters";
import { RiskLevelBadge } from "./risk-level-badge";
import { RiskVectorBreakdown } from "./risk-vector-breakdown";

interface RiskSimulationPanelProps {
  agents: AgentSummary[];
  tools: ToolSummary[];
  loadToolVersions: (toolId: string) => Promise<ToolVersionSummary[]>;
  onEvaluate: (payload: RiskEvaluateRequest) => Promise<RiskEvaluateResponse | null>;
  loading?: boolean;
  result: RiskEvaluateResponse | null;
  error: string | null;
  onClear: () => void;
}

export function RiskSimulationPanel({
  agents,
  tools,
  loadToolVersions,
  onEvaluate,
  loading = false,
  result,
  error,
  onClear,
}: RiskSimulationPanelProps) {
  const [selectedAgentId, setSelectedAgentId] = useState("");
  const [selectedToolId, setSelectedToolId] = useState("");
  const [selectedToolVersionId, setSelectedToolVersionId] = useState("");
  const [toolVersions, setToolVersions] = useState<ToolVersionSummary[]>([]);
  const [environment, setEnvironment] = useState("DEVELOPMENT");
  const [argumentsJson, setArgumentsJson] = useState("{\n  \"command\": \"status\",\n  \"target\": \"production-db\"\n}");

  const currentAgentId = selectedAgentId || agents[0]?.id || "";
  const currentToolId = selectedToolId || tools[0]?.id || "";

  useEffect(() => {
    let isMounted = true;
    if (!currentToolId) return;
    (async () => {
      const v = await loadToolVersions(currentToolId);
      if (!isMounted) return;
      setToolVersions(v);
      if (v.length > 0 && !selectedToolVersionId) {
        setSelectedToolVersionId(v[0].id);
      }
    })();
    return () => {
      isMounted = false;
    };
  }, [currentToolId, loadToolVersions, selectedToolVersionId]);

  const handleToolChange = async (toolId: string) => {
    setSelectedToolId(toolId);
    const v = await loadToolVersions(toolId);
    setToolVersions(v);
    if (v.length > 0) setSelectedToolVersionId(v[0].id);
    else setSelectedToolVersionId("");
  };

  const activeToolVersion = toolVersions.find((v) => v.id === selectedToolVersionId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const effectiveAgentId = currentAgentId;
    const effectiveToolId = currentToolId;
    const effectiveVersionId = selectedToolVersionId || toolVersions[0]?.id;
    if (!effectiveAgentId || !effectiveToolId || !effectiveVersionId) return;

    let parsedArgs: Record<string, unknown> = {};
    if (argumentsJson.trim()) {
      try {
        parsedArgs = JSON.parse(argumentsJson);
      } catch {
        return;
      }
    }

    await onEvaluate({
      agent_id: effectiveAgentId,
      tool_id: effectiveToolId,
      tool_version_id: effectiveVersionId,
      arguments: parsedArgs,
      environment,
    });
  };

  const levelStyle = result ? getRiskLevelStyle(result.risk_level) : null;

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="p-6 rounded-2xl bg-gray-900 border border-gray-800 space-y-1">
        <h3 className="text-base font-bold text-white flex items-center gap-2">
          <span>Quantitative Risk Simulation Studio</span>
          <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-sky-500/10 text-sky-400 border border-sky-500/20">
            Dry-Run Playground
          </span>
        </h3>
        <p className="text-xs text-gray-400">
          Compute composite risk scores, 4-vector weight contributions, and argument heuristic matches for hypothetical invocations without persisting audit logs.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Input Form */}
        <div className="lg:col-span-5 space-y-4">
          <form onSubmit={handleSubmit} className="p-5 rounded-2xl bg-gray-900/60 border border-gray-800 space-y-4">
            <h4 className="text-xs font-bold uppercase tracking-wider text-gray-400">
              Simulation Parameters
            </h4>

            {/* Agent Selector */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-gray-300">Agent *</label>
              <select
                required
                disabled={loading || agents.length === 0}
                value={currentAgentId}
                onChange={(e) => setSelectedAgentId(e.target.value)}
                className="w-full bg-gray-950 border border-gray-800 text-gray-200 text-xs rounded-lg px-3 py-2 focus:border-indigo-500 focus:outline-none"
              >
                {agents.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({a.risk_tier})
                  </option>
                ))}
              </select>
            </div>

            {/* Tool Selector */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-gray-300">Tool *</label>
              <select
                required
                disabled={loading || tools.length === 0}
                value={currentToolId}
                onChange={(e) => handleToolChange(e.target.value)}
                className="w-full bg-gray-950 border border-gray-800 text-gray-200 text-xs rounded-lg px-3 py-2 focus:border-indigo-500 focus:outline-none"
              >
                {tools.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.risk_level})
                  </option>
                ))}
              </select>
            </div>

            {/* Version Selector */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-gray-300">Version *</label>
              <select
                required
                disabled={loading || toolVersions.length === 0}
                value={selectedToolVersionId}
                onChange={(e) => setSelectedToolVersionId(e.target.value)}
                className="w-full bg-gray-950 border border-gray-800 text-gray-200 text-xs rounded-lg px-3 py-2 font-mono focus:border-indigo-500 focus:outline-none"
              >
                {toolVersions.map((v) => (
                  <option key={v.id} value={v.id}>
                    v{v.version} ({v.status})
                  </option>
                ))}
              </select>
            </div>

            {/* Environment */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-gray-300">Environment</label>
              <select
                value={environment}
                onChange={(e) => setEnvironment(e.target.value)}
                className="w-full bg-gray-950 border border-gray-800 text-gray-200 text-xs rounded-lg px-3 py-2 focus:border-indigo-500 focus:outline-none"
              >
                <option value="DEVELOPMENT">DEVELOPMENT</option>
                <option value="STAGING">STAGING</option>
                <option value="PRODUCTION">PRODUCTION</option>
              </select>
            </div>

            {/* JSON Arguments Editor */}
            <JsonArgumentEditor
              value={argumentsJson}
              onChange={setArgumentsJson}
              inputSchema={activeToolVersion?.input_schema}
              minHeight="min-h-[140px]"
            />

            <button
              type="submit"
              disabled={loading || !selectedToolVersionId}
              className="w-full py-2.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-semibold text-xs transition-colors shadow-sm shadow-sky-600/30 disabled:opacity-50"
            >
              {loading ? "Computing Risk Score..." : "Evaluate Risk"}
            </button>
          </form>
        </div>

        {/* Right Column: Risk Output */}
        <div className="lg:col-span-7 space-y-4">
          {error && (
            <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs">
              <strong className="block mb-1">Evaluation Error:</strong>
              {error}
            </div>
          )}

          {result && levelStyle ? (
            <div className="p-6 rounded-2xl bg-gray-900/80 border border-gray-800 shadow-sm space-y-5">
              <div className="flex items-center justify-between pb-4 border-b border-gray-800">
                <div className="flex items-center gap-4">
                  <div className="flex flex-col items-center justify-center w-16 h-16 rounded-2xl bg-gray-950 border border-gray-800">
                    <span className={`text-2xl font-black font-mono ${levelStyle.text}`}>
                      {result.risk_score}
                    </span>
                    <span className="text-[10px] uppercase font-semibold text-gray-500">Score</span>
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className={`text-base font-bold ${levelStyle.text}`}>{levelStyle.label}</span>
                      <RiskLevelBadge level={result.risk_level} />
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">
                      Algorithm: <span className="font-mono text-gray-300">v{result.scoring_algorithm_version}</span>
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={onClear}
                  className="text-xs text-gray-400 hover:text-white"
                >
                  Clear Results
                </button>
              </div>

              {/* 4-Vector Breakdown */}
              <div className="space-y-2">
                <span className="text-xs font-semibold text-gray-300 block">
                  Multi-Dimensional Factor Decomposition:
                </span>
                <RiskVectorBreakdown subscores={result.subscores} />
              </div>

              {/* Explanation */}
              {result.explanation && (
                <div className="p-3.5 rounded-xl bg-gray-950 border border-gray-800 text-xs text-gray-300 space-y-1">
                  <span className="font-semibold text-gray-400 block text-[11px] uppercase tracking-wider">
                    Scoring Explanation:
                  </span>
                  <p className="leading-relaxed">{result.explanation}</p>
                </div>
              )}

              {/* Matched Heuristics */}
              <div className="space-y-2">
                <span className="text-xs font-semibold text-gray-300 block">
                  Matched Argument Heuristics ({result.heuristics_matched?.length || 0}):
                </span>
                {(!result.heuristics_matched || result.heuristics_matched.length === 0) ? (
                  <div className="p-3.5 rounded-xl bg-gray-950/60 border border-gray-800 text-xs text-gray-400">
                    No argument pattern heuristics matched this payload.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {result.heuristics_matched.map((h, idx) => (
                      <div
                        key={idx}
                        className="p-3 rounded-lg bg-rose-950/20 border border-rose-800/40 text-xs flex items-center justify-between"
                      >
                        <div>
                          <span className="font-mono font-semibold text-rose-300">{h.rule_id}</span>
                          <span className="text-gray-400 ml-2 font-mono">({h.path})</span>
                        </div>
                        <span className="font-mono font-bold text-rose-400">+{h.score_contribution} pts</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="p-12 text-center rounded-2xl bg-gray-900/40 border border-gray-800 text-gray-500 text-xs space-y-2">
              <div className="text-2xl">🎯</div>
              <p>Configure simulation inputs on the left to evaluate quantitative risk.</p>
              <p className="text-[11px] text-gray-600">Scores are computed in real time using the organization&apos;s active 4-vector weight model.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

