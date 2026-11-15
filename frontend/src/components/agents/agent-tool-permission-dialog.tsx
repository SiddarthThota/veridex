"use client";

import React, { useState } from "react";
import type { AgentResponse, AgentToolPermission } from "@/types/agents";
import type { ToolResponse } from "@/types/tools";
import { formatToolRiskLevel } from "@/lib/tools/tools-formatters";

interface AgentToolPermissionDialogProps {
  isOpen: boolean;
  agent: AgentResponse;
  currentPermissions: AgentToolPermission[];
  availableTools: ToolResponse[];
  onClose: () => void;
  onGrantTool: (toolId: string) => Promise<unknown>;
}

export function AgentToolPermissionDialog({
  isOpen,
  agent,
  currentPermissions,
  availableTools,
  onClose,
  onGrantTool,
}: AgentToolPermissionDialogProps) {
  const [selectedToolId, setSelectedToolId] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  // Filter out tools already granted
  const grantedIds = new Set(currentPermissions.filter((p) => p.allowed).map((p) => p.tool_id));
  const ungrantedTools = availableTools.filter((t) => !grantedIds.has(t.id));

  async function handleGrant(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedToolId) {
      setError("Please select a tool to grant.");
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      await onGrantTool(selectedToolId);
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to grant tool permission";
      setError(msg);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="relative w-full max-w-md rounded-2xl bg-gray-900 border border-gray-800 shadow-2xl p-6 overflow-hidden">
        <div className="flex items-center justify-between pb-4 border-b border-gray-800">
          <div>
            <h3 className="text-base font-semibold text-white">Grant Tool Permission</h3>
            <p className="text-xs text-gray-400 mt-0.5">
              Bind tool access to <span className="font-medium text-cyan-400">{agent.name}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors p-1"
          >
            ✕
          </button>
        </div>

        {error && (
          <div className="mt-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-400">
            {error}
          </div>
        )}

        <form onSubmit={handleGrant} className="mt-4 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-300 mb-1">
              Select Tool from Catalog <span className="text-rose-400">*</span>
            </label>
            {ungrantedTools.length === 0 ? (
              <p className="text-xs text-gray-500 italic p-3 rounded-xl bg-gray-950 border border-gray-800">
                All available tools have already been granted to this agent, or no active tools are catalogued.
              </p>
            ) : (
              <select
                value={selectedToolId}
                onChange={(e) => setSelectedToolId(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-gray-950 border border-gray-800 text-xs text-white focus:outline-none focus:border-cyan-500"
              >
                <option value="">-- Choose a tool --</option>
                {ungrantedTools.map((tool) => {
                  const risk = formatToolRiskLevel(tool.risk_level);
                  return (
                    <option key={tool.id} value={tool.id}>
                      {tool.name} ({tool.slug}) — {risk.label}
                    </option>
                  );
                })}
              </select>
            )}
          </div>

          <div className="p-3 rounded-xl bg-gray-950 border border-gray-800/80 text-[11px] text-gray-400 space-y-1">
            <p className="font-medium text-gray-300">Default-Deny Policy Rule:</p>
            <p>
              Agents cannot invoke tools unless an explicit permission is granted and all active governance policies
              evaluate to ALLOW.
            </p>
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-800">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="py-2 px-4 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || ungrantedTools.length === 0 || !selectedToolId}
              className="py-2 px-4 rounded-xl bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white text-xs font-medium transition-colors shadow-sm shadow-cyan-600/20"
            >
              {isSubmitting ? "Granting..." : "Grant Tool Access"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
