"use client";

import React, { useState } from "react";
import type { ToolResponse, ToolVersionResponse } from "@/types/tools";
import { ToolStatusBadge } from "./tool-status-badge";
import { ToolSchemaViewer } from "./tool-schema-viewer";
import {
  formatAccessType,
  formatApprovalRequirement,
  formatDataClassification,
  formatDate,
  formatReversibility,
  formatToolRiskLevel,
  formatToolVersionStatus,
} from "@/lib/tools/tools-formatters";
import { useAuth } from "@/components/auth/auth-context";
import { canManageTools } from "@/lib/permissions";

interface ToolDetailDrawerProps {
  tool: ToolResponse | null;
  isOpen: boolean;
  isLoading?: boolean;
  versions: ToolVersionResponse[];
  isVersionsLoading: boolean;
  onClose: () => void;
  onEdit: (tool: ToolResponse) => void;
  onActivate: (id: string) => Promise<unknown>;
  onSuspend: (id: string) => Promise<unknown>;
  onDeactivate: (id: string) => Promise<unknown>;
  onOpenCreateVersion: () => void;
  onOpenPublishVersion: (version: ToolVersionResponse) => void;
}

export function ToolDetailDrawer({
  tool,
  isOpen,
  versions,
  isVersionsLoading,
  onClose,
  onEdit,
  onActivate,
  onSuspend,
  onDeactivate,
  onOpenCreateVersion,
  onOpenPublishVersion,
}: ToolDetailDrawerProps) {
  const { user } = useAuth();
  const canMutate = canManageTools(user?.role);
  const [activeTab, setActiveTab] = useState<"overview" | "schemas" | "versions">("overview");
  const [selectedVersionForSchema, setSelectedVersionForSchema] = useState<ToolVersionResponse | null>(null);

  if (!isOpen || !tool) return null;

  const riskConfig = formatToolRiskLevel(tool.risk_level);
  const accessConfig = formatAccessType(tool.access_type);
  const revConfig = formatReversibility(tool.reversibility);
  const classConfig = formatDataClassification(tool.data_classification);
  const apprConfig = formatApprovalRequirement(tool.approval_requirement);

  // Latest version or chosen version for schema tab
  const displayVersion = selectedVersionForSchema || versions[0] || null;

  return (
    <div className="fixed inset-y-0 right-0 z-50 w-full max-w-2xl bg-gray-900 border-l border-gray-800 shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-right duration-200">
      {/* Drawer Header */}
      <div className="p-6 border-b border-gray-800 bg-gray-950/40 flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-bold text-white tracking-tight">{tool.name}</h2>
            <ToolStatusBadge status={tool.status} size="sm" />
          </div>
          <div className="flex items-center gap-3 text-xs text-gray-400 mt-1">
            <span className="font-mono text-amber-400">{tool.slug}</span>
            <span>•</span>
            <span className={`px-2 py-0.5 rounded text-[10px] font-medium border ${riskConfig.badgeClass}`}>
              {riskConfig.label}
            </span>
            <span>•</span>
            <span className={`px-2 py-0.5 rounded text-[10px] font-medium border ${accessConfig.badgeClass}`}>
              {accessConfig.label}
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="text-gray-400 hover:text-white p-1 rounded-lg hover:bg-gray-800 transition-colors"
        >
          ✕
        </button>
      </div>

      {/* Tabs */}
      <div className="flex items-center px-6 border-b border-gray-800 bg-gray-950/20 text-xs">
        <button
          type="button"
          onClick={() => setActiveTab("overview")}
          className={`py-3 px-3 font-medium border-b-2 transition-colors ${
            activeTab === "overview"
              ? "border-amber-400 text-amber-400"
              : "border-transparent text-gray-400 hover:text-gray-200"
          }`}
        >
          Overview
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("schemas")}
          className={`py-3 px-3 font-medium border-b-2 transition-colors ${
            activeTab === "schemas"
              ? "border-amber-400 text-amber-400"
              : "border-transparent text-gray-400 hover:text-gray-200"
          }`}
        >
          JSON Schemas {displayVersion ? `(${displayVersion.version})` : ""}
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("versions")}
          className={`py-3 px-3 font-medium border-b-2 transition-colors ${
            activeTab === "versions"
              ? "border-amber-400 text-amber-400"
              : "border-transparent text-gray-400 hover:text-gray-200"
          }`}
        >
          Versions ({versions.length})
        </button>
      </div>

      {/* Drawer Body */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* OVERVIEW TAB */}
        {activeTab === "overview" && (
          <div className="space-y-6">
            {/* Description Card */}
            <div className="p-4 rounded-xl bg-gray-950/60 border border-gray-800/80">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">Description</h4>
              <p className="text-xs text-gray-200 leading-relaxed">
                {tool.description || "No description provided for this tool definition."}
              </p>
            </div>

            {/* Sensitivity & Governance Classifications */}
            <div className="p-4 rounded-xl bg-gray-950/60 border border-gray-800/80">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">
                Sensitivity & Governance Posture
              </h4>
              <div className="grid grid-cols-2 gap-4 text-xs">
                <div>
                  <span className="text-gray-500 block mb-0.5">Risk Level</span>
                  <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-medium border ${riskConfig.badgeClass}`}>
                    {riskConfig.label}
                  </span>
                </div>
                <div>
                  <span className="text-gray-500 block mb-0.5">Access Type</span>
                  <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-medium border ${accessConfig.badgeClass}`}>
                    {accessConfig.label}
                  </span>
                </div>
                <div>
                  <span className="text-gray-500 block mb-0.5">Reversibility</span>
                  <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-medium border ${revConfig.badgeClass}`}>
                    {revConfig.label}
                  </span>
                </div>
                <div>
                  <span className="text-gray-500 block mb-0.5">Data Classification</span>
                  <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-medium border ${classConfig.badgeClass}`}>
                    {classConfig.label}
                  </span>
                </div>
                <div className="col-span-2">
                  <span className="text-gray-500 block mb-0.5">Human Approval Requirement</span>
                  <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-medium border ${apprConfig.badgeClass}`}>
                    {apprConfig.label}
                  </span>
                </div>
              </div>
            </div>

            {/* Execution Constraints */}
            <div className="p-4 rounded-xl bg-gray-950/60 border border-gray-800/80">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">Execution Constraints</h4>
              <div className="grid grid-cols-2 gap-4 text-xs">
                <div>
                  <span className="text-gray-500 block mb-0.5">Timeout</span>
                  <span className="font-mono text-white font-medium">
                    {tool.timeout_seconds ? `${tool.timeout_seconds} seconds` : "Default (System standard)"}
                  </span>
                </div>
                <div>
                  <span className="text-gray-500 block mb-0.5">Rate Limit</span>
                  <span className="font-mono text-white font-medium">
                    {tool.rate_limit ? `${tool.rate_limit} requests / minute` : "Unlimited"}
                  </span>
                </div>
              </div>
            </div>

            {/* System Identifiers */}
            <div className="p-4 rounded-xl bg-gray-950/60 border border-gray-800/80">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">System Identifiers</h4>
              <div className="grid grid-cols-2 gap-4 text-xs">
                <div>
                  <span className="text-gray-500 block mb-0.5">Tool UUID</span>
                  <span className="font-mono text-gray-300 text-[11px] select-all">{tool.id}</span>
                </div>
                <div>
                  <span className="text-gray-500 block mb-0.5">Organization ID</span>
                  <span className="font-mono text-gray-300 text-[11px] select-all">{tool.organization_id}</span>
                </div>
                <div>
                  <span className="text-gray-500 block mb-0.5">Created At</span>
                  <span className="text-gray-300">{formatDate(tool.created_at)}</span>
                </div>
                <div>
                  <span className="text-gray-500 block mb-0.5">Last Updated</span>
                  <span className="text-gray-300">{formatDate(tool.updated_at)}</span>
                </div>
              </div>
            </div>

            {/* Lifecycle Action Panel */}
            {canMutate && (
              <div className="p-4 rounded-xl bg-gray-950/60 border border-gray-800/80">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">
                  Lifecycle Management
                </h4>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => onEdit(tool)}
                    className="py-1.5 px-3 rounded-lg bg-gray-800 hover:bg-gray-700 text-white text-xs font-medium transition-colors"
                  >
                    Edit Constraints
                  </button>

                  {tool.status === "DRAFT" && (
                    <button
                      type="button"
                      onClick={() => onActivate(tool.id)}
                      className="py-1.5 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium transition-colors"
                    >
                      Activate Tool
                    </button>
                  )}

                  {tool.status === "ACTIVE" && (
                    <button
                      type="button"
                      onClick={() => onSuspend(tool.id)}
                      className="py-1.5 px-3 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-medium transition-colors"
                    >
                      Suspend Tool
                    </button>
                  )}

                  {tool.status === "SUSPENDED" && (
                    <button
                      type="button"
                      onClick={() => onActivate(tool.id)}
                      className="py-1.5 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium transition-colors"
                    >
                      Reactivate Tool
                    </button>
                  )}

                  {tool.status !== "DEACTIVATED" && (
                    <button
                      type="button"
                      onClick={() => onDeactivate(tool.id)}
                      className="py-1.5 px-3 rounded-lg bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-500/30 text-xs font-medium transition-colors"
                    >
                      Deactivate Tool
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* JSON SCHEMAS TAB */}
        {activeTab === "schemas" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-xs font-semibold text-white">Input & Output JSON Schemas</h4>
                <p className="text-[11px] text-gray-400 mt-0.5">
                  Structural contracts defining argument types and expected returns.
                </p>
              </div>

              {versions.length > 1 && (
                <select
                  value={displayVersion?.id || ""}
                  onChange={(e) => {
                    const found = versions.find((v) => v.id === e.target.value);
                    if (found) setSelectedVersionForSchema(found);
                  }}
                  className="px-2.5 py-1 rounded-lg bg-gray-950 border border-gray-800 text-xs text-amber-300 font-mono focus:outline-none"
                >
                  {versions.map((v) => (
                    <option key={v.id} value={v.id}>
                      Version {v.version} ({v.status})
                    </option>
                  ))}
                </select>
              )}
            </div>

            <ToolSchemaViewer
              inputSchema={displayVersion?.input_schema}
              outputSchema={displayVersion?.output_schema}
            />
          </div>
        )}

        {/* VERSIONS TAB */}
        {activeTab === "versions" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-xs font-semibold text-white">Version Lifecycle & History</h4>
                <p className="text-[11px] text-gray-400 mt-0.5">
                  Immutable version records. Published versions cannot be altered.
                </p>
              </div>
              {canMutate && (
                <button
                  type="button"
                  onClick={onOpenCreateVersion}
                  className="py-1.5 px-3 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-medium transition-colors shadow-sm"
                >
                  + Author Version
                </button>
              )}
            </div>

            {isVersionsLoading ? (
              <div className="p-6 text-center text-xs text-gray-400 animate-pulse">Loading tool versions...</div>
            ) : versions.length === 0 ? (
              <div className="p-8 text-center rounded-xl bg-gray-950/40 border border-dashed border-gray-800 text-xs text-gray-500">
                No versions found for this tool.
              </div>
            ) : (
              <div className="divide-y divide-gray-800 border border-gray-800 rounded-xl bg-gray-950/60 overflow-hidden">
                {versions.map((ver) => {
                  const verConfig = formatToolVersionStatus(ver.status);
                  return (
                    <div
                      key={ver.id}
                      className="p-4 flex items-center justify-between hover:bg-gray-900/40 transition-colors"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-bold text-white">{ver.version}</span>
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-medium border ${verConfig.badgeClass}`}
                          >
                            {verConfig.label}
                          </span>
                        </div>
                        {ver.description && (
                          <div className="text-[11px] text-gray-400 mt-1">{ver.description}</div>
                        )}
                        <div className="text-[10px] text-gray-500 mt-1">
                          Authored on {formatDate(ver.created_at)}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedVersionForSchema(ver);
                            setActiveTab("schemas");
                          }}
                          className="py-1 px-2.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs font-medium transition-colors"
                        >
                          View Schema
                        </button>

                        {canMutate && ver.status === "DRAFT" && (
                          <button
                            type="button"
                            onClick={() => onOpenPublishVersion(ver)}
                            className="py-1 px-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium transition-colors shadow-sm"
                          >
                            Publish
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
