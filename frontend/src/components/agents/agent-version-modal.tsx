"use client";

import React, { useState } from "react";
import type { AgentResponse, AgentVersionCreate } from "@/types/agents";

interface AgentVersionModalProps {
  isOpen: boolean;
  agent: AgentResponse;
  onClose: () => void;
  onSubmit: (versionString: string, payload: AgentVersionCreate) => Promise<unknown>;
}

export function AgentVersionModal({
  isOpen,
  agent,
  onClose,
  onSubmit,
}: AgentVersionModalProps) {
  const [versionString, setVersionString] = useState("");
  const [modelProvider, setModelProvider] = useState(agent.model_provider);
  const [modelName, setModelName] = useState(agent.model_name);
  const [systemConfigJson, setSystemConfigJson] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    if (!versionString.trim()) {
      setError("Version string is required (e.g., 0.2.0).");
      setIsSubmitting(false);
      return;
    }

    let parsedConfig: Record<string, unknown> | null = null;
    if (systemConfigJson.trim()) {
      try {
        parsedConfig = JSON.parse(systemConfigJson);
      } catch {
        setError("System configuration must be valid JSON.");
        setIsSubmitting(false);
        return;
      }
    }

    try {
      await onSubmit(versionString.trim(), {
        model_provider: modelProvider.trim(),
        model_name: modelName.trim(),
        system_configuration: parsedConfig,
      });
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to branch agent version";
      setError(msg);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="relative w-full max-w-lg rounded-2xl bg-gray-900 border border-gray-800 shadow-2xl p-6 overflow-hidden">
        <div className="flex items-center justify-between pb-4 border-b border-gray-800">
          <div>
            <h3 className="text-base font-semibold text-white">Branch Agent Version Snapshot</h3>
            <p className="text-xs text-gray-400 mt-0.5">
              Agent: <span className="font-medium text-cyan-400">{agent.name}</span>
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

        {/* Note on Version Semantics */}
        <div className="mt-4 p-3 rounded-xl bg-blue-500/10 border border-blue-500/20 text-xs text-blue-300">
          <span className="font-semibold">Snapshot Notice:</span> Creating a new version records an immutable{" "}
          <code className="font-mono bg-blue-900/40 px-1 py-0.5 rounded text-blue-200">DRAFT</code> historical
          snapshot. In VERIDEX v0.8.0, the active operational model and environment are governed directly by the
          root agent profile.
        </div>

        {error && (
          <div className="mt-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-400">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-300 mb-1">
              Version Identifier <span className="text-rose-400">*</span>
            </label>
            <input
              type="text"
              required
              value={versionString}
              onChange={(e) => setVersionString(e.target.value)}
              placeholder="e.g. 0.2.0 or 1.0.0-rc1"
              className="w-full px-3 py-2 rounded-xl bg-gray-950 border border-gray-800 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-cyan-500 font-mono"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-300 mb-1">
                Model Provider <span className="text-rose-400">*</span>
              </label>
              <input
                type="text"
                required
                value={modelProvider}
                onChange={(e) => setModelProvider(e.target.value)}
                placeholder="e.g. openai"
                className="w-full px-3 py-2 rounded-xl bg-gray-950 border border-gray-800 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-cyan-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-300 mb-1">
                Model Name <span className="text-rose-400">*</span>
              </label>
              <input
                type="text"
                required
                value={modelName}
                onChange={(e) => setModelName(e.target.value)}
                placeholder="e.g. gpt-4o"
                className="w-full px-3 py-2 rounded-xl bg-gray-950 border border-gray-800 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-cyan-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-300 mb-1">
              System Configuration (Optional JSON)
            </label>
            <textarea
              rows={3}
              value={systemConfigJson}
              onChange={(e) => setSystemConfigJson(e.target.value)}
              placeholder='{ "temperature": 0.2, "max_tokens": 4096 }'
              className="w-full px-3 py-2 rounded-xl bg-gray-950 border border-gray-800 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-cyan-500 font-mono"
            />
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
              disabled={isSubmitting}
              className="py-2 px-4 rounded-xl bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white text-xs font-medium transition-colors shadow-sm shadow-cyan-600/20"
            >
              {isSubmitting ? "Branching..." : "Record Version Snapshot"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
