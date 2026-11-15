"use client";

import React, { useState } from "react";
import type {
  ToolAccessType,
  ToolApprovalRequirement,
  ToolCreate,
  ToolDataClassification,
  ToolResponse,
  ToolReversibility,
  ToolRiskLevel,
  ToolUpdate,
} from "@/types/tools";

interface ToolModalProps {
  isOpen: boolean;
  initialTool?: ToolResponse | null;
  onClose: () => void;
  onSubmitCreate: (payload: ToolCreate) => Promise<unknown>;
  onSubmitUpdate: (id: string, payload: ToolUpdate) => Promise<unknown>;
}

export function ToolModal({
  isOpen,
  initialTool,
  onClose,
  onSubmitCreate,
  onSubmitUpdate,
}: ToolModalProps) {
  const isEditing = Boolean(initialTool);

  const [name, setName] = useState(initialTool?.name ?? "");
  const [description, setDescription] = useState(initialTool?.description ?? "");
  const [riskLevel, setRiskLevel] = useState<ToolRiskLevel>(initialTool?.risk_level ?? "LOW");
  const [accessType, setAccessType] = useState<ToolAccessType>(initialTool?.access_type ?? "READ");
  const [reversibility, setReversibility] = useState<ToolReversibility>(
    initialTool?.reversibility ?? "REVERSIBLE"
  );
  const [dataClassification, setDataClassification] = useState<ToolDataClassification>(
    initialTool?.data_classification ?? "INTERNAL"
  );
  const [approvalRequirement, setApprovalRequirement] = useState<ToolApprovalRequirement>(
    initialTool?.approval_requirement ?? "NOT_REQUIRED"
  );
  const [timeoutSeconds, setTimeoutSeconds] = useState<string>(
    initialTool?.timeout_seconds ? String(initialTool.timeout_seconds) : ""
  );
  const [rateLimit, setRateLimit] = useState<string>(
    initialTool?.rate_limit ? String(initialTool.rate_limit) : ""
  );

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    const parsedTimeout = timeoutSeconds.trim() ? parseInt(timeoutSeconds, 10) : null;
    const parsedRateLimit = rateLimit.trim() ? parseInt(rateLimit, 10) : null;

    if (parsedTimeout !== null && (isNaN(parsedTimeout) || parsedTimeout < 1)) {
      setError("Timeout seconds must be a positive integer.");
      setIsSubmitting(false);
      return;
    }

    if (parsedRateLimit !== null && (isNaN(parsedRateLimit) || parsedRateLimit < 1)) {
      setError("Rate limit must be a positive integer.");
      setIsSubmitting(false);
      return;
    }

    try {
      if (isEditing && initialTool) {
        await onSubmitUpdate(initialTool.id, {
          description: description.trim() || null,
          timeout_seconds: parsedTimeout,
          rate_limit: parsedRateLimit,
        });
      } else {
        if (!name.trim()) {
          setError("Tool name is required.");
          setIsSubmitting(false);
          return;
        }

        await onSubmitCreate({
          name: name.trim(),
          description: description.trim() || null,
          risk_level: riskLevel,
          access_type: accessType,
          reversibility,
          data_classification: dataClassification,
          approval_requirement: approvalRequirement,
          timeout_seconds: parsedTimeout,
          rate_limit: parsedRateLimit,
        });
      }

      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to save tool";
      setError(msg);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="relative w-full max-w-xl rounded-2xl bg-gray-900 border border-gray-800 shadow-2xl p-6 overflow-hidden max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between pb-4 border-b border-gray-800 flex-shrink-0">
          <div>
            <h3 className="text-base font-semibold text-white">
              {isEditing ? `Edit Tool: ${initialTool?.name}` : "Register Governed Tool"}
            </h3>
            <p className="text-xs text-gray-400 mt-0.5">
              {isEditing
                ? "Update execution limits and description for this tool definition."
                : "Create a governed tool definition with sensitivity classifications and limits."}
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
          <div className="mt-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-400 flex-shrink-0">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-4 space-y-4 overflow-y-auto pr-1 flex-1">
          {/* Tool Name */}
          <div>
            <label className="block text-xs font-medium text-gray-300 mb-1">
              Tool Name <span className="text-rose-400">*</span>
            </label>
            <input
              type="text"
              required
              disabled={isEditing}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Database SQL Query Executor"
              className="w-full px-3 py-2 rounded-xl bg-gray-950 border border-gray-800 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-amber-500 disabled:opacity-60"
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
              placeholder="Detailed description of tool functionality, capabilities, and boundaries..."
              className="w-full px-3 py-2 rounded-xl bg-gray-950 border border-gray-800 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-amber-500"
            />
          </div>

          {/* Sensitivity Classifications (Only on Create) */}
          {!isEditing ? (
            <div className="space-y-4 pt-2 border-t border-gray-800/60">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-amber-400">
                Sensitivity & Governance Classifications
              </h4>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-300 mb-1">Risk Level</label>
                  <select
                    value={riskLevel}
                    onChange={(e) => setRiskLevel(e.target.value as ToolRiskLevel)}
                    className="w-full px-3 py-2 rounded-xl bg-gray-950 border border-gray-800 text-xs text-white focus:outline-none focus:border-amber-500"
                  >
                    <option value="LOW">Low Risk</option>
                    <option value="MEDIUM">Medium Risk</option>
                    <option value="HIGH">High Risk</option>
                    <option value="CRITICAL">Critical Risk</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-300 mb-1">Access Type</label>
                  <select
                    value={accessType}
                    onChange={(e) => setAccessType(e.target.value as ToolAccessType)}
                    className="w-full px-3 py-2 rounded-xl bg-gray-950 border border-gray-800 text-xs text-white focus:outline-none focus:border-amber-500"
                  >
                    <option value="READ">Read Only</option>
                    <option value="WRITE">Write (Mutating)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-300 mb-1">Reversibility</label>
                  <select
                    value={reversibility}
                    onChange={(e) => setReversibility(e.target.value as ToolReversibility)}
                    className="w-full px-3 py-2 rounded-xl bg-gray-950 border border-gray-800 text-xs text-white focus:outline-none focus:border-amber-500"
                  >
                    <option value="REVERSIBLE">Reversible</option>
                    <option value="IRREVERSIBLE">Irreversible</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-300 mb-1">Data Classification</label>
                  <select
                    value={dataClassification}
                    onChange={(e) => setDataClassification(e.target.value as ToolDataClassification)}
                    className="w-full px-3 py-2 rounded-xl bg-gray-950 border border-gray-800 text-xs text-white focus:outline-none focus:border-amber-500"
                  >
                    <option value="PUBLIC">Public</option>
                    <option value="INTERNAL">Internal</option>
                    <option value="CONFIDENTIAL">Confidential</option>
                    <option value="RESTRICTED">Restricted</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-300 mb-1">Human Approval Requirement</label>
                <select
                  value={approvalRequirement}
                  onChange={(e) => setApprovalRequirement(e.target.value as ToolApprovalRequirement)}
                  className="w-full px-3 py-2 rounded-xl bg-gray-950 border border-gray-800 text-xs text-white focus:outline-none focus:border-amber-500"
                >
                  <option value="NOT_REQUIRED">Not Required</option>
                  <option value="OPTIONAL">Optional</option>
                  <option value="REQUIRED">Mandatory Approval</option>
                </select>
              </div>
            </div>
          ) : (
            <div className="p-3 rounded-xl bg-gray-950 border border-gray-800 text-[11px] text-gray-400">
              Sensitivity attributes (Risk Level, Access Type, Reversibility, Data Classification, Approval
              Requirement) are locked on creation to prevent stealth privilege escalation.
            </div>
          )}

          {/* Execution Limits */}
          <div className="pt-2 border-t border-gray-800/60">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-amber-400 mb-3">
              Execution Constraints
            </h4>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-300 mb-1">Timeout Seconds</label>
                <input
                  type="number"
                  min="1"
                  value={timeoutSeconds}
                  onChange={(e) => setTimeoutSeconds(e.target.value)}
                  placeholder="e.g. 30"
                  className="w-full px-3 py-2 rounded-xl bg-gray-950 border border-gray-800 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-300 mb-1">Rate Limit (/minute)</label>
                <input
                  type="number"
                  min="1"
                  value={rateLimit}
                  onChange={(e) => setRateLimit(e.target.value)}
                  placeholder="e.g. 60"
                  className="w-full px-3 py-2 rounded-xl bg-gray-950 border border-gray-800 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-800 flex-shrink-0">
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
              className="py-2 px-4 rounded-xl bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white text-xs font-medium transition-colors shadow-sm shadow-amber-600/20"
            >
              {isSubmitting ? "Saving..." : isEditing ? "Save Changes" : "Register Tool"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
