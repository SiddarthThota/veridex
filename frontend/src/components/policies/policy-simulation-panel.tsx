/**
 * Policy Dry-Run Simulation Studio (Phase 9.5).
 *
 * Simulates policy evaluation against hypothetical invocations without side effects:
 * - Registered Agent, Tool, Version, and Environment selectors
 * - Zero-dependency JSON argument editor with format and schema template loader
 * - Detailed telemetry trace viewer (decision, violation codes, remediation, matched rules)
 * - Strict role gating: VIEWER is forbidden by backend (HTTP 403 prevention)
 */

"use client";

import React, { useEffect, useState } from "react";
import type { PolicySimulateRequest, PolicySimulateResponse } from "@/types/policies";
import type { AgentSummary, ToolSummary, ToolVersionSummary } from "@/types/entities";
import { JsonArgumentEditor } from "@/components/common/json-argument-editor";
import { PolicyActionBadge } from "./policy-status-badge";
import { RoleGuard } from "@/components/auth/role-guard";
import { canSimulatePolicies } from "@/lib/permissions";
import { fetchAgentsList, fetchToolsList, fetchToolVersionsList } from "@/lib/risk/risk-api";

interface PolicySimulationPanelProps {
  onSimulate: (payload: PolicySimulateRequest) => Promise<PolicySimulateResponse | null>;
  simulating?: boolean;
  result?: PolicySimulateResponse | null;
  error?: string | null;
  onClear: () => void;
}

export function PolicySimulationPanel({
  onSimulate,
  simulating = false,
  result,
  error,
  onClear,
}: PolicySimulationPanelProps) {
  // Selectors State
  const [agents, setAgents] = useState<AgentSummary[]>([]);
  const [tools, setTools] = useState<ToolSummary[]>([]);
  const [toolVersions, setToolVersions] = useState<ToolVersionSummary[]>([]);
  const [loadingSelectors, setLoadingSelectors] = useState(true);

  // Form State
  const [selectedAgentId, setSelectedAgentId] = useState<string>("");
  const [selectedToolId, setSelectedToolId] = useState<string>("");
  const [selectedToolVersionId, setSelectedToolVersionId] = useState<string>("");
  const [environment, setEnvironment] = useState<string>("DEVELOPMENT");
  const [argumentsJson, setArgumentsJson] = useState<string>("{\n  \"query\": \"SELECT * FROM users;\"\n}");

  // Selected tool version metadata (for schema loading)
  const activeToolVersion = toolVersions.find((v) => v.id === selectedToolVersionId);

  // Load agents and tools
  useEffect(() => {
    async function loadData() {
      setLoadingSelectors(true);
      try {
        const [agentsRes, toolsRes] = await Promise.all([
          fetchAgentsList(0, 100),
          fetchToolsList(0, 100),
        ]);
        setAgents(agentsRes.items);
        setTools(toolsRes.items);

        if (agentsRes.items.length > 0) {
          setSelectedAgentId(agentsRes.items[0].id);
        }
        if (toolsRes.items.length > 0) {
          const firstTool = toolsRes.items[0];
          setSelectedToolId(firstTool.id);
          const versions = await fetchToolVersionsList(firstTool.id);
          setToolVersions(versions);
          if (versions.length > 0) {
            setSelectedToolVersionId(versions[0].id);
          }
        }
      } catch {
        // Ignored
      } finally {
        setLoadingSelectors(false);
      }
    }
    loadData();
  }, []);

  // When selected tool changes, fetch its versions
  const handleToolChange = async (toolId: string) => {
    setSelectedToolId(toolId);
    try {
      const versions = await fetchToolVersionsList(toolId);
      setToolVersions(versions);
      if (versions.length > 0) {
        setSelectedToolVersionId(versions[0].id);
      } else {
        setSelectedToolVersionId("");
      }
    } catch {
      setToolVersions([]);
      setSelectedToolVersionId("");
    }
  };

  const handleRunSimulation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAgentId || !selectedToolId || !selectedToolVersionId) return;

    let parsedArgs: Record<string, unknown> = {};
    if (argumentsJson.trim()) {
      try {
        parsedArgs = JSON.parse(argumentsJson);
      } catch {
        return; // Validation prevents run
      }
    }

    await onSimulate({
      agent_id: selectedAgentId,
      tool_id: selectedToolId,
      tool_version_id: selectedToolVersionId,
      arguments: parsedArgs,
      environment,
    });
  };

  return (
    <div className="space-y-6">
      {/* Simulation Header */}
      <div className="p-6 rounded-2xl bg-gray-900 border border-gray-800 space-y-1">
        <h3 className="text-base font-bold text-white flex items-center gap-2">
          <span>Policy Simulation Studio</span>
          <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
            Offline Dry-Run
          </span>
        </h3>
        <p className="text-xs text-gray-400">
          Execute hypothetical tool invocations against active published policies to test rule matches, violation codes, and enforcement outcomes without side effects.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Invocation Input Parameters */}
        <div className="lg:col-span-5 space-y-5">
          <form onSubmit={handleRunSimulation} className="p-5 rounded-2xl bg-gray-900/60 border border-gray-800 space-y-4">
            <h4 className="text-xs font-bold uppercase tracking-wider text-gray-400">
              Hypothetical Invocation
            </h4>

            {/* Agent Selector */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-gray-300">Executing Agent *</label>
              <select
                required
                disabled={loadingSelectors || simulating}
                value={selectedAgentId}
                onChange={(e) => setSelectedAgentId(e.target.value)}
                className="w-full bg-gray-950 border border-gray-800 text-gray-200 text-xs rounded-lg px-3 py-2 focus:border-indigo-500 focus:outline-none"
              >
                {agents.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({a.risk_tier} • {a.environment})
                  </option>
                ))}
              </select>
            </div>

            {/* Tool Selector */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-gray-300">Target Tool *</label>
              <select
                required
                disabled={loadingSelectors || simulating}
                value={selectedToolId}
                onChange={(e) => handleToolChange(e.target.value)}
                className="w-full bg-gray-950 border border-gray-800 text-gray-200 text-xs rounded-lg px-3 py-2 focus:border-indigo-500 focus:outline-none"
              >
                {tools.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.slug} • {t.risk_level})
                  </option>
                ))}
              </select>
            </div>

            {/* Tool Version Selector */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-gray-300">Tool Version *</label>
              <select
                required
                disabled={loadingSelectors || simulating || toolVersions.length === 0}
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
              <label className="text-xs font-semibold text-gray-300">Runtime Environment</label>
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

            {/* Run Action with RBAC Guard */}
            <div className="pt-2">
              <RoleGuard
                check={canSimulatePolicies}
                disabled
                disabledMessage="VIEWER role is not authorized to simulate policies (HTTP 403)"
              >
                <button
                  type="submit"
                  disabled={simulating || loadingSelectors || !selectedToolVersionId}
                  className="w-full py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs transition-colors shadow-sm shadow-indigo-600/30 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {simulating ? "Evaluating Policies..." : "Run Policy Simulation"}
                </button>
              </RoleGuard>
            </div>
          </form>
        </div>

        {/* Right Column: Execution Trace and Decision Output */}
        <div className="lg:col-span-7 space-y-4">
          {error && (
            <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs">
              <strong className="block mb-1">Simulation Error:</strong>
              {error}
            </div>
          )}

          {result ? (
            <div className="p-6 rounded-2xl bg-gray-900/80 border border-gray-800 shadow-sm space-y-5">
              <div className="flex items-center justify-between pb-4 border-b border-gray-800">
                <div className="flex items-center gap-3">
                  <h4 className="text-base font-bold text-white">Evaluation Outcome:</h4>
                  <PolicyActionBadge action={result.decision} />
                </div>
                <button
                  type="button"
                  onClick={onClear}
                  className="text-xs text-gray-400 hover:text-white"
                >
                  Clear Results
                </button>
              </div>

              {/* Violations & Remediation */}
              {result.violation_codes.length > 0 && (
                <div className="space-y-2">
                  <span className="text-xs font-semibold text-rose-400">Violations Triggered:</span>
                  <div className="space-y-1.5">
                    {result.violation_codes.map((code, idx) => (
                      <div
                        key={idx}
                        className="p-3 rounded-lg bg-rose-950/30 border border-rose-800/40 text-xs text-rose-200 font-mono"
                      >
                        <div>Violation: {code}</div>
                        {result.remediation_messages[idx] && (
                          <div className="text-gray-300 font-sans mt-1">
                            Remediation: {result.remediation_messages[idx]}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Matched Policies & Rules Trace */}
              <div className="space-y-2">
                <span className="text-xs font-semibold text-gray-300">
                  Matched Policy Rules Trace ({result.matched_policies.length} Policies Matched):
                </span>
                {result.matched_policies.length === 0 ? (
                  <div className="p-4 rounded-lg bg-gray-950/60 border border-gray-800 text-xs text-gray-400">
                    No declarative policies matched this invocation context. Default fallback action applied.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {result.matched_policies.map((p) => (
                      <div
                        key={p.policy_id}
                        className="p-3.5 rounded-xl bg-gray-950/80 border border-gray-800 space-y-2 text-xs"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-white">Policy: {p.policy_slug}</span>
                          <span className="font-mono text-gray-400">v{p.version_number}</span>
                        </div>

                        <div className="space-y-1 pl-2 border-l-2 border-indigo-500/40">
                          {p.matched_rules.map((r) => (
                            <div key={r.rule_id} className="flex items-center justify-between py-1">
                              <span className="text-gray-300">{r.rule_name}</span>
                              <div className="flex items-center gap-2">
                                <span className="font-mono text-[11px] text-gray-500">{r.violation_code}</span>
                                <PolicyActionBadge action={r.action} />
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="text-[11px] text-gray-500 pt-2 border-t border-gray-800">
                Simulated at: {new Date(result.simulated_at).toLocaleString()}
              </div>
            </div>
          ) : (
            <div className="p-12 text-center rounded-2xl bg-gray-900/40 border border-gray-800 text-gray-500 text-xs space-y-2">
              <div className="text-2xl">⚡</div>
              <p>Configure agent, tool, and argument payload on the left to dry-run evaluation.</p>
              <p className="text-[11px] text-gray-600">Simulations are executed safely in-memory without side effects or logging persistence.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

