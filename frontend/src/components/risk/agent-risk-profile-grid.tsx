/**
 * Agent Risk Profiles & Trust Score Grid Component (Phase 9.5).
 *
 * Implements bounded-concurrency profile loading (max 4 concurrent),
 * independent partial-failure isolation, retry logic, and lazy drilldown.
 */

"use client";

import React from "react";
import type { AgentRiskProfileResponse, RiskAssessmentResponse } from "@/types/risk";
import type { AgentSummary } from "@/types/entities";
import { AgentHistoryStatusBadge, RiskLevelBadge } from "./risk-level-badge";

interface AgentRiskProfileGridProps {
  agents: AgentSummary[];
  total: number;
  totalPages: number;
  page: number;
  loading: boolean;
  profiles: Record<string, AgentRiskProfileResponse>;
  loadingStates: Record<string, boolean>;
  profileErrors: Record<string, string>;
  expandedAgentId: string | null;
  expandedAgentAssessments: RiskAssessmentResponse[];
  expandedAgentLoading: boolean;
  onPageChange: (page: number) => void;
  onExpandAgent: (agentId: string | null) => void;
  onRetryProfile: (agentId: string) => void;
  onRefresh: () => void;
}

export function AgentRiskProfileGrid({
  agents,
  total,
  totalPages,
  page,
  loading,
  profiles,
  loadingStates,
  profileErrors,
  expandedAgentId,
  expandedAgentAssessments,
  expandedAgentLoading,
  onPageChange,
  onExpandAgent,
  onRetryProfile,
  onRefresh,
}: AgentRiskProfileGridProps) {
  return (
    <div className="space-y-5">
      {/* Grid Banner */}
      <div className="p-4 rounded-xl bg-gray-900/60 border border-gray-800 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <span>Empirical Agent Risk & Trust Profiles</span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-gray-800 text-gray-300 font-mono">
              {total} Agents Registered
            </span>
          </h3>
          <p className="text-xs text-gray-400 mt-0.5">
            Sliding-window trust metrics, historical violation rates, and cold-start assessments loaded with bounded concurrency.
          </p>
        </div>

        <button
          type="button"
          onClick={onRefresh}
          className="text-xs px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white transition-colors"
        >
          ↻ Refresh Registry
        </button>
      </div>

      {/* Agents Card Grid */}
      {loading && agents.length === 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="p-5 rounded-2xl bg-gray-900/40 border border-gray-800 animate-pulse space-y-3">
              <div className="h-4 bg-gray-800 rounded w-2/3" />
              <div className="h-3 bg-gray-800/60 rounded w-1/2" />
              <div className="h-16 bg-gray-800/40 rounded mt-4" />
            </div>
          ))}
        </div>
      ) : agents.length === 0 ? (
        <div className="p-12 text-center rounded-2xl bg-gray-900/40 border border-gray-800 text-gray-500 text-xs">
          No AI agents currently registered in this organization.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {agents.map((agent) => {
            const profile = profiles[agent.id];
            const isProfileLoading = loadingStates[agent.id];
            const profileError = profileErrors[agent.id];
            const isExpanded = expandedAgentId === agent.id;

            return (
              <div
                key={agent.id}
                className={`p-5 rounded-2xl border transition-all flex flex-col justify-between space-y-4 ${
                  isExpanded
                    ? "bg-gray-900 border-indigo-500/60 shadow-lg"
                    : "bg-gray-900/70 border-gray-800 hover:border-gray-700"
                }`}
              >
                {/* Agent Header */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="text-sm font-bold text-white truncate" title={agent.name}>
                      {agent.name}
                    </h4>
                    <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-gray-800 text-gray-300">
                      {agent.environment}
                    </span>
                  </div>
                  <div className="text-[11px] font-mono text-gray-500 truncate">{agent.slug}</div>
                  <div className="text-[11px] text-gray-400">
                    Model: <span className="text-gray-300 font-medium">{agent.model_provider}/{agent.model_name}</span>
                  </div>
                </div>

                {/* Empirical Trust Profile Block */}
                <div className="p-3.5 rounded-xl bg-gray-950/80 border border-gray-800/80 space-y-2.5">
                  {isProfileLoading ? (
                    <div className="py-4 text-center space-y-1.5 animate-pulse">
                      <div className="text-xs text-indigo-400 font-medium">Loading Trust Profile...</div>
                      <div className="text-[10px] text-gray-500">Evaluating sliding window metrics</div>
                    </div>
                  ) : profileError ? (
                    <div className="py-2 text-center space-y-2">
                      <div className="text-xs text-amber-400 font-medium">Profile Loading Error</div>
                      <div className="text-[10px] text-gray-400">{profileError}</div>
                      <button
                        type="button"
                        onClick={() => onRetryProfile(agent.id)}
                        className="text-[11px] px-2.5 py-1 rounded bg-gray-800 hover:bg-gray-700 text-indigo-300 font-medium transition-colors border border-gray-700"
                      >
                        Retry Loading
                      </button>
                    </div>
                  ) : profile ? (
                    <div className="space-y-2.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-gray-300">Trust Score</span>
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`text-sm font-black font-mono ${
                              profile.calculated_trust_score >= 80
                                ? "text-emerald-400"
                                : profile.calculated_trust_score >= 50
                                ? "text-amber-400"
                                : "text-rose-400"
                            }`}
                          >
                            {Math.round(profile.calculated_trust_score)} / 100
                          </span>
                          <AgentHistoryStatusBadge status={profile.history_status} />
                        </div>
                      </div>

                      {/* Trust Progress Bar */}
                      <div className="w-full bg-gray-900 rounded-full h-1.5 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-700 ${
                            profile.calculated_trust_score >= 80
                              ? "bg-emerald-400"
                              : profile.calculated_trust_score >= 50
                              ? "bg-amber-400"
                              : "bg-rose-400"
                          }`}
                          style={{ width: `${Math.min(100, profile.calculated_trust_score)}%` }}
                        />
                      </div>

                      {/* Empirical Metrics */}
                      <div className="grid grid-cols-2 gap-2 pt-1 text-[11px] border-t border-gray-900 text-gray-400">
                        <div>
                          <span>Violations: </span>
                          <span className="font-mono text-gray-200 font-medium">
                            {profile.total_violations} / {profile.total_eligible_invocations}
                          </span>
                        </div>
                        <div className="text-right">
                          <span>Rate: </span>
                          <span
                            className={`font-mono font-medium ${
                              profile.violation_rate > 0.1 ? "text-rose-400" : "text-gray-200"
                            }`}
                          >
                            {(profile.violation_rate * 100).toFixed(1)}%
                          </span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="py-2 text-center text-xs text-gray-500">
                      No profile data available.
                    </div>
                  )}
                </div>

                {/* Drilldown Trigger */}
                <div className="pt-1">
                  <button
                    type="button"
                    onClick={() => onExpandAgent(isExpanded ? null : agent.id)}
                    className={`w-full py-1.5 rounded-lg text-xs font-medium transition-colors border ${
                      isExpanded
                        ? "bg-indigo-600 text-white border-indigo-500"
                        : "bg-gray-800 hover:bg-gray-700 text-gray-300 border-gray-700"
                    }`}
                  >
                    {isExpanded ? "Hide Recent Audits" : "View Recent Audits"}
                  </button>
                </div>

                {/* Lazy Inlined Audit Drawer */}
                {isExpanded && (
                  <div className="pt-3 border-t border-gray-800 space-y-2 animate-in fade-in duration-200">
                    <span className="text-[11px] font-bold text-gray-300 block">
                      Recent Invocations Audit:
                    </span>
                    {expandedAgentLoading ? (
                      <div className="py-3 text-center text-xs text-gray-500">
                        Loading agent assessments...
                      </div>
                    ) : expandedAgentAssessments.length === 0 ? (
                      <div className="py-2 text-center text-xs text-gray-500 italic">
                        No recent risk assessments recorded for this agent.
                      </div>
                    ) : (
                      <div className="space-y-1.5 max-h-48 overflow-y-auto">
                        {expandedAgentAssessments.map((a) => (
                          <div
                            key={a.id}
                            className="p-2 rounded-lg bg-gray-950 border border-gray-800 text-[11px] flex items-center justify-between"
                          >
                            <span className="font-mono text-gray-400">
                              {new Date(a.assessed_at).toLocaleDateString()}
                            </span>
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-bold text-gray-200">
                                Score: {a.risk_score}
                              </span>
                              <RiskLevelBadge level={a.risk_level} />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination Footer */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-2 text-xs text-gray-400">
        <div>
          Showing page {page} of {totalPages} ({total} total agents)
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
            className="px-3 py-1 rounded bg-gray-900 hover:bg-gray-800 text-gray-300 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Previous Page
          </button>
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => onPageChange(page + 1)}
            className="px-3 py-1 rounded bg-gray-900 hover:bg-gray-800 text-gray-300 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Next Page
          </button>
        </div>
      </div>
    </div>
  );
}

