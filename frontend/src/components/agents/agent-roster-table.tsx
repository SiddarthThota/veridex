"use client";

import React from "react";
import type { AgentResponse } from "@/types/agents";
import { AgentStatusBadge } from "./agent-status-badge";
import { formatDate, formatEnvironment, formatRiskTier } from "@/lib/agents/agents-formatters";
import { useAuth } from "@/components/auth/auth-context";
import { canManageAgents } from "@/lib/permissions";

interface AgentRosterTableProps {
  agents: AgentResponse[];
  isLoading: boolean;
  onSelectAgent: (agent: AgentResponse) => void;
  onActivate: (id: string) => Promise<unknown>;
  onSuspend: (id: string) => Promise<unknown>;
  onDeactivate: (id: string) => Promise<unknown>;
}

export function AgentRosterTable({
  agents,
  isLoading,
  onSelectAgent,
  onActivate,
  onSuspend,
  onDeactivate,
}: AgentRosterTableProps) {
  const { user } = useAuth();
  const canMutate = canManageAgents(user?.role);

  if (isLoading && agents.length === 0) {
    return (
      <div className="space-y-3">
        {[1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className="h-16 rounded-xl bg-gray-900/60 border border-gray-800 animate-pulse flex items-center px-6"
          />
        ))}
      </div>
    );
  }

  if (agents.length === 0) {
    return (
      <div className="p-12 text-center rounded-2xl bg-gray-900/40 border border-dashed border-gray-800">
        <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-cyan-500/10 text-cyan-400 flex items-center justify-center">
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        </div>
        <p className="text-sm font-medium text-gray-200">No AI agents found</p>
        <p className="text-xs text-gray-500 mt-1 max-w-sm mx-auto">
          No agent profiles match your current search or filter criteria. Register a new agent or adjust filters.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-gray-800/80 bg-gray-900/40 shadow-sm backdrop-blur-sm">
      <table className="w-full text-left text-xs text-gray-300">
        <thead className="bg-gray-950/60 text-gray-400 border-b border-gray-800 font-medium uppercase tracking-wider text-[10px]">
          <tr>
            <th className="py-3.5 px-4 sm:px-6">Agent Profile</th>
            <th className="py-3.5 px-4">Environment</th>
            <th className="py-3.5 px-4">Risk Tier</th>
            <th className="py-3.5 px-4">Active Model</th>
            <th className="py-3.5 px-4">Status</th>
            <th className="py-3.5 px-4">Last Updated</th>
            <th className="py-3.5 px-4 sm:px-6 text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-800/60">
          {agents.map((agent) => {
            const envConfig = formatEnvironment(agent.environment);
            const tierConfig = formatRiskTier(agent.risk_tier);

            return (
              <tr
                key={agent.id}
                onClick={() => onSelectAgent(agent)}
                className="group hover:bg-gray-800/40 cursor-pointer transition-colors"
              >
                {/* Agent Name & Slug */}
                <td className="py-4 px-4 sm:px-6">
                  <div className="font-semibold text-white group-hover:text-cyan-400 transition-colors">
                    {agent.name}
                  </div>
                  <div className="text-[11px] font-mono text-gray-500 mt-0.5">{agent.slug}</div>
                  {agent.description && (
                    <div className="text-[11px] text-gray-400 mt-1 line-clamp-1 max-w-xs">
                      {agent.description}
                    </div>
                  )}
                </td>

                {/* Environment */}
                <td className="py-4 px-4">
                  <span
                    className={`inline-block px-2 py-0.5 rounded text-[11px] font-medium border ${envConfig.badgeClass}`}
                  >
                    {envConfig.label}
                  </span>
                </td>

                {/* Risk Tier */}
                <td className="py-4 px-4">
                  <span
                    className={`inline-block px-2 py-0.5 rounded text-[11px] font-medium border ${tierConfig.badgeClass}`}
                  >
                    {tierConfig.label}
                  </span>
                </td>

                {/* Active Model */}
                <td className="py-4 px-4">
                  <div className="font-mono text-gray-200 text-xs">
                    {agent.model_provider} / {agent.model_name}
                  </div>
                </td>

                {/* Status */}
                <td className="py-4 px-4">
                  <AgentStatusBadge status={agent.status} size="sm" />
                </td>

                {/* Last Updated */}
                <td className="py-4 px-4 text-gray-400 text-[11px] whitespace-nowrap">
                  {formatDate(agent.updated_at)}
                </td>

                {/* Actions */}
                <td className="py-4 px-4 sm:px-6 text-right whitespace-nowrap">
                  <div className="flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      onClick={() => onSelectAgent(agent)}
                      className="py-1 px-2.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white text-xs font-medium transition-colors"
                    >
                      Inspect
                    </button>

                    {canMutate && agent.status === "DRAFT" && (
                      <button
                        type="button"
                        onClick={() => onActivate(agent.id)}
                        className="py-1 px-2 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 text-xs font-medium transition-colors"
                      >
                        Activate
                      </button>
                    )}

                    {canMutate && agent.status === "ACTIVE" && (
                      <button
                        type="button"
                        onClick={() => onSuspend(agent.id)}
                        className="py-1 px-2 rounded-lg bg-amber-600/20 hover:bg-amber-600/30 text-amber-300 border border-amber-500/30 text-xs font-medium transition-colors"
                      >
                        Suspend
                      </button>
                    )}

                    {canMutate && agent.status === "SUSPENDED" && (
                      <button
                        type="button"
                        onClick={() => onActivate(agent.id)}
                        className="py-1 px-2 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 text-xs font-medium transition-colors"
                      >
                        Reactivate
                      </button>
                    )}

                    {canMutate && agent.status !== "DEACTIVATED" && (
                      <button
                        type="button"
                        onClick={() => onDeactivate(agent.id)}
                        className="py-1 px-2 rounded-lg bg-rose-600/10 hover:bg-rose-600/20 text-rose-400 border border-rose-500/20 text-xs font-medium transition-colors"
                        title="Deactivate agent"
                      >
                        Deactivate
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
