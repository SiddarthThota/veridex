/**
 * Decision Confirmation Dialog for Approvals (Phase 9.4).
 *
 * Requirements:
 * - Mandatory rationale (minimum 5 non-whitespace chars, maximum 1000 chars)
 * - Explicit warning that APPROVED triggers immediate tool execution
 * - Clean distinction between decision approval and execution success
 * - Control character sanitization & submission progress states
 * - No automatic retry on ambiguous network failure
 */

import React, { useState } from "react";
import { sanitizeRationale } from "@/lib/approvals/approvals-formatters";

interface ApprovalDecisionDialogProps {
  isOpen: boolean;
  decisionType: "APPROVED" | "REJECTED" | null;
  agentName?: string;
  toolName?: string;
  submitting: boolean;
  error: string | null;
  onConfirm: (decision: "APPROVED" | "REJECTED", reason: string) => Promise<boolean>;
  onClose: () => void;
}

export function ApprovalDecisionDialog({
  isOpen,
  decisionType,
  agentName,
  toolName,
  submitting,
  error,
  onConfirm,
  onClose,
}: ApprovalDecisionDialogProps) {
  const [reason, setReason] = useState("");

  if (!isOpen || !decisionType) return null;

  const isApprove = decisionType === "APPROVED";
  const sanitized = sanitizeRationale(reason);
  const isValid = sanitized.length >= 5 && sanitized.length <= 1000;

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid || submitting) return;
    const ok = await onConfirm(decisionType, sanitized);
    if (ok) {
      setReason("");
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="decision-dialog-title"
    >
      <div className="w-full max-w-lg rounded-2xl bg-gray-900 border border-gray-800 shadow-2xl p-6 space-y-5 animate-in fade-in zoom-in-95 duration-150">
        {/* Title */}
        <div className="flex items-center justify-between pb-3 border-b border-gray-800">
          <div className="flex items-center gap-2.5">
            <span
              className={`w-3 h-3 rounded-full ${
                isApprove ? "bg-emerald-400" : "bg-rose-400"
              }`}
            />
            <h3 id="decision-dialog-title" className="text-base font-semibold text-white">
              {isApprove ? "Confirm Tool Execution Approval" : "Confirm Request Rejection"}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="text-gray-400 hover:text-white p-1 rounded-lg hover:bg-gray-800 transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Warning Banner */}
        {isApprove ? (
          <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/25 text-amber-300 text-xs space-y-1">
            <div className="font-semibold flex items-center gap-1.5">
              <svg className="w-4 h-4 text-amber-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <span>Immediate Execution Trigger</span>
            </div>
            <p className="text-amber-300/80 leading-relaxed">
              Submitting an <strong className="text-amber-200">APPROVED</strong> decision immediately executes{" "}
              <code className="font-mono text-amber-100">{toolName || "tool"}</code> on behalf of{" "}
              <strong className="text-amber-200">{agentName || "agent"}</strong> and records persistent telemetry.
              Approval does not guarantee execution success.
            </p>
          </div>
        ) : (
          <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/25 text-rose-300 text-xs space-y-1">
            <div className="font-semibold flex items-center gap-1.5">
              <svg className="w-4 h-4 text-rose-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
              </svg>
              <span>Tool Execution Blocked</span>
            </div>
            <p className="text-rose-300/80 leading-relaxed">
              Rejecting this request will mark the governance record as <strong className="text-rose-200">REJECTED</strong>.
              The agent will be denied execution permission.
            </p>
          </div>
        )}

        {/* Error Notification */}
        {error && (
          <div className="p-3 rounded-lg bg-rose-500/15 border border-rose-500/30 text-rose-200 text-xs">
            {error}
          </div>
        )}

        {/* Mandatory Rationale Input */}
        <form onSubmit={handleFormSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <label htmlFor="decision-reason" className="font-medium text-gray-300">
                Audit Rationale <span className="text-rose-400">*</span>
              </label>
              <span
                className={`text-[11px] font-mono ${
                  sanitized.length < 5
                    ? "text-gray-500"
                    : sanitized.length > 950
                    ? "text-amber-400"
                    : "text-gray-400"
                }`}
              >
                {sanitized.length} / 1000
              </span>
            </div>
            <textarea
              id="decision-reason"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              disabled={submitting}
              placeholder={
                isApprove
                  ? "State explicit authorization justification (minimum 5 characters)..."
                  : "State specific security or policy reason for rejecting this tool invocation..."
              }
              className="w-full px-3 py-2 text-xs rounded-xl bg-gray-950 border border-gray-800 text-gray-200 placeholder-gray-600 focus:outline-none focus:border-indigo-500 transition-colors resize-none disabled:opacity-50"
            />
            {sanitized.length > 0 && sanitized.length < 5 && (
              <p className="text-[11px] text-amber-400">
                Rationale must be at least 5 characters long.
              </p>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs font-medium transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!isValid || submitting}
              className={`px-4 py-2 rounded-lg text-xs font-semibold text-white shadow-sm transition-colors flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed ${
                isApprove
                  ? "bg-emerald-600 hover:bg-emerald-500 shadow-emerald-600/20"
                  : "bg-rose-600 hover:bg-rose-500 shadow-rose-600/20"
              }`}
            >
              {submitting ? (
                <>
                  <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  <span>Submitting Decision…</span>
                </>
              ) : isApprove ? (
                "Authorize & Execute"
              ) : (
                "Reject Request"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

