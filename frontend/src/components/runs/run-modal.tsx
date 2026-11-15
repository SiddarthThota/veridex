"use client";

import React, { useState } from "react";
import type { AgentRunCreate, AgentRunResponse, AgentRunStatusUpdate, RunStatus } from "@/types/runs";

interface RunModalProps {
  isOpen: boolean;
  initialRun?: AgentRunResponse | null;
  onClose: () => void;
  onSubmitCreate: (payload: AgentRunCreate) => Promise<unknown>;
  onSubmitUpdateStatus?: (id: string, payload: AgentRunStatusUpdate) => Promise<unknown>;
}

export function RunModal({
  isOpen,
  initialRun,
  onClose,
  onSubmitCreate,
  onSubmitUpdateStatus,
}: RunModalProps) {
  const isUpdatingStatus = Boolean(initialRun && onSubmitUpdateStatus);

  // Create state
  const [agentId, setAgentId] = useState("");
  const [environment, setEnvironment] = useState("production");
  const [traceId, setTraceId] = useState("");
  const [inputPrompt, setInputPrompt] = useState("");

  // Update state
  const [status, setStatus] = useState<RunStatus>(initialRun?.status ?? "COMPLETED");
  const [outputSummary, setOutputSummary] = useState(initialRun?.output_summary ?? "");
  const [errorMessage, setErrorMessage] = useState(initialRun?.error_message ?? "");

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      if (isUpdatingStatus && initialRun && onSubmitUpdateStatus) {
        await onSubmitUpdateStatus(initialRun.id, {
          status,
          output_summary: outputSummary.trim() || null,
          error_message: errorMessage.trim() || null,
        });
      } else {
        if (!agentId.trim()) {
          setError("Agent UUID is required.");
          setIsSubmitting(false);
          return;
        }

        await onSubmitCreate({
          agent_id: agentId.trim(),
          environment: environment.trim() || "production",
          trace_id: traceId.trim() || null,
          input_prompt: inputPrompt.trim() || null,
        });
      }

      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to process run operation";
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
              {isUpdatingStatus ? "Update Run Status" : "Initiate Agent Run Session"}
            </h3>
            <p className="text-xs text-gray-400 mt-0.5">
              {isUpdatingStatus
                ? `Update terminal status for run ${initialRun?.id.slice(0, 8)}...`
                : "Register an active execution session for tool governance tracking."}
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
          {isUpdatingStatus ? (
            <>
              <div>
                <label className="block text-xs font-medium text-gray-300 mb-1">New Terminal Status</label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as RunStatus)}
                  className="w-full px-3 py-2 rounded-xl bg-gray-950 border border-gray-800 text-xs text-white focus:outline-none focus:border-purple-500"
                >
                  <option value="COMPLETED">Completed</option>
                  <option value="FAILED">Failed</option>
                  <option value="CANCELLED">Cancelled</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-300 mb-1">Output Summary</label>
                <textarea
                  rows={2}
                  value={outputSummary}
                  onChange={(e) => setOutputSummary(e.target.value)}
                  placeholder="Summary of agent output results..."
                  className="w-full px-3 py-2 rounded-xl bg-gray-950 border border-gray-800 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-purple-500"
                />
              </div>

              {status === "FAILED" && (
                <div>
                  <label className="block text-xs font-medium text-gray-300 mb-1">Error Message</label>
                  <input
                    type="text"
                    value={errorMessage}
                    onChange={(e) => setErrorMessage(e.target.value)}
                    placeholder="Reason for failure..."
                    className="w-full px-3 py-2 rounded-xl bg-gray-950 border border-gray-800 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-purple-500"
                  />
                </div>
              )}
            </>
          ) : (
            <>
              <div>
                <label className="block text-xs font-medium text-gray-300 mb-1">
                  Agent UUID <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={agentId}
                  onChange={(e) => setAgentId(e.target.value)}
                  placeholder="e.g. 550e8400-e29b-41d4-a716-446655440000"
                  className="w-full px-3 py-2 rounded-xl bg-gray-950 border border-gray-800 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-purple-500 font-mono"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-300 mb-1">Environment</label>
                  <input
                    type="text"
                    value={environment}
                    onChange={(e) => setEnvironment(e.target.value)}
                    placeholder="production"
                    className="w-full px-3 py-2 rounded-xl bg-gray-950 border border-gray-800 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-purple-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-300 mb-1">Trace ID (Optional)</label>
                  <input
                    type="text"
                    value={traceId}
                    onChange={(e) => setTraceId(e.target.value)}
                    placeholder="e.g. otel-trace-12345"
                    className="w-full px-3 py-2 rounded-xl bg-gray-950 border border-gray-800 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-purple-500 font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-300 mb-1">Input Prompt (Optional)</label>
                <textarea
                  rows={3}
                  value={inputPrompt}
                  onChange={(e) => setInputPrompt(e.target.value)}
                  placeholder="User request or initial prompt provided to the agent..."
                  className="w-full px-3 py-2 rounded-xl bg-gray-950 border border-gray-800 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-purple-500"
                />
              </div>
            </>
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
              className="py-2 px-4 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white text-xs font-medium transition-colors shadow-sm shadow-purple-600/20"
            >
              {isSubmitting ? "Processing..." : isUpdatingStatus ? "Update Status" : "Initiate Run"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
