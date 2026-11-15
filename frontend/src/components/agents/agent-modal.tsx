"use client";

import React, { useState } from "react";
import type { AgentCreate, AgentEnvironment, AgentResponse, AgentRiskTier, AgentUpdate } from "@/types/agents";

interface AgentModalProps {
  isOpen: boolean;
  initialAgent?: AgentResponse | null;
  onClose: () => void;
  onSubmitCreate: (payload: AgentCreate) => Promise<unknown>;
  onSubmitUpdate: (id: string, payload: AgentUpdate) => Promise<unknown>;
}

export function AgentModal({
  isOpen,
  initialAgent,
  onClose,
  onSubmitCreate,
  onSubmitUpdate,
}: AgentModalProps) {
  const isEditing = Boolean(initialAgent);

  const [name, setName] = useState(initialAgent?.name ?? "");
  const [description, setDescription] = useState(initialAgent?.description ?? "");
  const [environment, setEnvironment] = useState<AgentEnvironment>(
    initialAgent?.environment ?? "DEVELOPMENT"
  );
  const [riskTier, setRiskTier] = useState<AgentRiskTier>(
    initialAgent?.risk_tier ?? "TIER_1"
  );
  const [modelProvider, setModelProvider] = useState(initialAgent?.model_provider ?? "openai");
  const [modelName, setModelName] = useState(initialAgent?.model_name ?? "gpt-4o");

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      if (isEditing && initialAgent) {
        await onSubmitUpdate(initialAgent.id, {
          description: description.trim() || null,
          environment,
        });
      } else {
        if (!name.trim()) {
          setError("Agent name is required.");
          setIsSubmitting(false);
          return;
        }
        if (!modelProvider.trim() || !modelName.trim()) {
          setError("Model provider and name are required.");
          setIsSubmitting(false);
          return;
        }

        await onSubmitCreate({
          name: name.trim(),
          description: description.trim() || null,
          environment,
          risk_tier: riskTier,
          model_provider: modelProvider.trim(),
          model_name: modelName.trim(),
        });
      }

      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to save agent";
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
            <h3 className="text-base font-semibold text-white">
              {isEditing ? `Edit Agent: ${initialAgent?.name}` : "Register New AI Agent"}
            </h3>
            <p className="text-xs text-gray-400 mt-0.5">
              {isEditing
                ? "Update environment or description for this governed agent profile."
                : "Create an authoritative AI agent entry in the fleet registry."}
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

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          {/* Agent Name (read-only if editing) */}
          <div>
            <label className="block text-xs font-medium text-gray-300 mb-1">
              Agent Name <span className="text-rose-400">*</span>
            </label>
            <input
              type="text"
              required
              disabled={isEditing}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Financial Analyst Agent"
              className="w-full px-3 py-2 rounded-xl bg-gray-950 border border-gray-800 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-cyan-500 disabled:opacity-60"
            />
            {isEditing && (
              <p className="text-[11px] text-gray-500 mt-1">Slug and Name cannot be changed after registration.</p>
            )}
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-medium text-gray-300 mb-1">Description</label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Purpose and capabilities of this agent profile..."
              className="w-full px-3 py-2 rounded-xl bg-gray-950 border border-gray-800 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-cyan-500"
            />
          </div>

          {/* Environment & Risk Tier */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-300 mb-1">Environment</label>
              <select
                value={environment}
                onChange={(e) => setEnvironment(e.target.value as AgentEnvironment)}
                className="w-full px-3 py-2 rounded-xl bg-gray-950 border border-gray-800 text-xs text-white focus:outline-none focus:border-cyan-500"
              >
                <option value="DEVELOPMENT">Development</option>
                <option value="STAGING">Staging</option>
                <option value="PRODUCTION">Production</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-300 mb-1">Risk Tier</label>
              <select
                disabled={isEditing}
                value={riskTier}
                onChange={(e) => setRiskTier(e.target.value as AgentRiskTier)}
                className="w-full px-3 py-2 rounded-xl bg-gray-950 border border-gray-800 text-xs text-white focus:outline-none focus:border-cyan-500 disabled:opacity-60"
              >
                <option value="TIER_1">Tier 1 (Low)</option>
                <option value="TIER_2">Tier 2 (Moderate)</option>
                <option value="TIER_3">Tier 3 (High)</option>
                <option value="TIER_4">Tier 4 (Critical)</option>
              </select>
            </div>
          </div>

          {/* Model Specification (only on create; root Agent defines active model) */}
          {!isEditing && (
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
                  placeholder="e.g. openai, anthropic"
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
                  placeholder="e.g. gpt-4o, claude-3-5-sonnet"
                  className="w-full px-3 py-2 rounded-xl bg-gray-950 border border-gray-800 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-cyan-500"
                />
              </div>
            </div>
          )}

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
              {isSubmitting ? "Saving..." : isEditing ? "Save Changes" : "Register Agent"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
