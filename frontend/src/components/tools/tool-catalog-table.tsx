"use client";

import React from "react";
import type { ToolResponse } from "@/types/tools";
import { ToolStatusBadge } from "./tool-status-badge";
import {
  formatAccessType,
  formatApprovalRequirement,
  formatDataClassification,
  formatReversibility,
  formatToolRiskLevel,
} from "@/lib/tools/tools-formatters";
import { useAuth } from "@/components/auth/auth-context";
import { canManageTools } from "@/lib/permissions";

interface ToolCatalogTableProps {
  tools: ToolResponse[];
  isLoading: boolean;
  onSelectTool: (tool: ToolResponse) => void;
  onActivate: (id: string) => Promise<unknown>;
  onSuspend: (id: string) => Promise<unknown>;
  onDeactivate: (id: string) => Promise<unknown>;
}

export function ToolCatalogTable({
  tools,
  isLoading,
  onSelectTool,
  onActivate,
  onSuspend,
  onDeactivate,
}: ToolCatalogTableProps) {
  const { user } = useAuth();
  const canMutate = canManageTools(user?.role);

  if (isLoading && tools.length === 0) {
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

  if (tools.length === 0) {
    return (
      <div className="p-12 text-center rounded-2xl bg-gray-900/40 border border-dashed border-gray-800">
        <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-amber-500/10 text-amber-400 flex items-center justify-center">
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"
            />
          </svg>
        </div>
        <p className="text-sm font-medium text-gray-200">No governed tools found</p>
        <p className="text-xs text-gray-500 mt-1 max-w-sm mx-auto">
          No tool definitions match your current filter or search criteria. Register a new tool or clear filters.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-gray-800/80 bg-gray-900/40 shadow-sm backdrop-blur-sm">
      <table className="w-full text-left text-xs text-gray-300">
        <thead className="bg-gray-950/60 text-gray-400 border-b border-gray-800 font-medium uppercase tracking-wider text-[10px]">
          <tr>
            <th className="py-3.5 px-4 sm:px-6">Tool Definition</th>
            <th className="py-3.5 px-4">Risk Level</th>
            <th className="py-3.5 px-4">Access & Sensitivity</th>
            <th className="py-3.5 px-4">Approval Gate</th>
            <th className="py-3.5 px-4">Limits</th>
            <th className="py-3.5 px-4">Status</th>
            <th className="py-3.5 px-4 sm:px-6 text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-800/60">
          {tools.map((tool) => {
            const riskConfig = formatToolRiskLevel(tool.risk_level);
            const accessConfig = formatAccessType(tool.access_type);
            const revConfig = formatReversibility(tool.reversibility);
            const classConfig = formatDataClassification(tool.data_classification);
            const apprConfig = formatApprovalRequirement(tool.approval_requirement);

            return (
              <tr
                key={tool.id}
                onClick={() => onSelectTool(tool)}
                className="group hover:bg-gray-800/40 cursor-pointer transition-colors"
              >
                {/* Tool Name & Slug */}
                <td className="py-4 px-4 sm:px-6">
                  <div className="font-semibold text-white group-hover:text-amber-400 transition-colors">
                    {tool.name}
                  </div>
                  <div className="text-[11px] font-mono text-gray-500 mt-0.5">{tool.slug}</div>
                  {tool.description && (
                    <div className="text-[11px] text-gray-400 mt-1 line-clamp-1 max-w-xs">
                      {tool.description}
                    </div>
                  )}
                </td>

                {/* Risk Level */}
                <td className="py-4 px-4">
                  <span
                    className={`inline-block px-2 py-0.5 rounded text-[11px] font-medium border ${riskConfig.badgeClass}`}
                  >
                    {riskConfig.label}
                  </span>
                </td>

                {/* Access & Sensitivity Tags */}
                <td className="py-4 px-4">
                  <div className="flex flex-col gap-1 items-start">
                    <span
                      className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium border ${accessConfig.badgeClass}`}
                    >
                      {accessConfig.label}
                    </span>
                    <span
                      className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium border ${revConfig.badgeClass}`}
                    >
                      {revConfig.label}
                    </span>
                    <span
                      className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium border ${classConfig.badgeClass}`}
                    >
                      {classConfig.label}
                    </span>
                  </div>
                </td>

                {/* Approval Requirement */}
                <td className="py-4 px-4">
                  <span
                    className={`inline-block px-2 py-0.5 rounded text-[11px] font-medium border ${apprConfig.badgeClass}`}
                  >
                    {apprConfig.label}
                  </span>
                </td>

                {/* Execution Limits */}
                <td className="py-4 px-4 text-gray-400 text-[11px]">
                  <div>Timeout: {tool.timeout_seconds ? `${tool.timeout_seconds}s` : "Default"}</div>
                  <div>Rate: {tool.rate_limit ? `${tool.rate_limit}/min` : "Unlimited"}</div>
                </td>

                {/* Status */}
                <td className="py-4 px-4">
                  <ToolStatusBadge status={tool.status} size="sm" />
                </td>

                {/* Actions */}
                <td className="py-4 px-4 sm:px-6 text-right whitespace-nowrap">
                  <div className="flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      onClick={() => onSelectTool(tool)}
                      className="py-1 px-2.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white text-xs font-medium transition-colors"
                    >
                      Inspect
                    </button>

                    {canMutate && tool.status === "DRAFT" && (
                      <button
                        type="button"
                        onClick={() => onActivate(tool.id)}
                        className="py-1 px-2 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 text-xs font-medium transition-colors"
                      >
                        Activate
                      </button>
                    )}

                    {canMutate && tool.status === "ACTIVE" && (
                      <button
                        type="button"
                        onClick={() => onSuspend(tool.id)}
                        className="py-1 px-2 rounded-lg bg-amber-600/20 hover:bg-amber-600/30 text-amber-300 border border-amber-500/30 text-xs font-medium transition-colors"
                      >
                        Suspend
                      </button>
                    )}

                    {canMutate && tool.status === "SUSPENDED" && (
                      <button
                        type="button"
                        onClick={() => onActivate(tool.id)}
                        className="py-1 px-2 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 text-xs font-medium transition-colors"
                      >
                        Reactivate
                      </button>
                    )}

                    {canMutate && tool.status !== "DEACTIVATED" && (
                      <button
                        type="button"
                        onClick={() => onDeactivate(tool.id)}
                        className="py-1 px-2 rounded-lg bg-rose-600/10 hover:bg-rose-600/20 text-rose-400 border border-rose-500/20 text-xs font-medium transition-colors"
                        title="Deactivate tool"
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
