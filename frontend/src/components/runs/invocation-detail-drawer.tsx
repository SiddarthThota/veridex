"use client";

import React, { useEffect, useState } from "react";
import type { ToolRequestResponse } from "@/types/runs";
import { ExecutionStatusBadge } from "./execution-status-badge";
import {
  formatApprovalStatus,
  formatDate,
  formatDurationMs,
  formatGovernanceDecision,
  formatLatency,
  maskSensitiveData,
  sanitizeExecutionError,
} from "@/lib/runs/runs-formatters";
import { useAuth } from "@/components/auth/auth-context";
import { canRevealSensitiveData } from "@/lib/permissions";
import { fetchLinkedRiskAssessment } from "@/lib/runs/runs-api";

interface InvocationDetailDrawerProps {
  invocation: ToolRequestResponse | null;
  isOpen: boolean;
  onClose: () => void;
}

export function InvocationDetailDrawer({
  invocation,
  isOpen,
  onClose,
}: InvocationDetailDrawerProps) {
  const { user } = useAuth();
  const canReveal = canRevealSensitiveData(user?.role);

  const [revealPlaintext, setRevealPlaintext] = useState(false);
  const [copiedArgs, setCopiedArgs] = useState(false);
  const [copiedResult, setCopiedResult] = useState(false);
  const [riskAssessment, setRiskAssessment] = useState<Record<string, unknown> | null>(null);
  const [isRiskLoading, setIsRiskLoading] = useState(false);

  // Track drawer open state and active invocation to reset reveal & detail states
  const [lastState, setLastState] = useState<{ isOpen: boolean; id: string | null }>({
    isOpen: false,
    id: null,
  });

  const currentId = isOpen && invocation ? invocation.id : null;

  if (lastState.isOpen !== isOpen || lastState.id !== currentId) {
    setLastState({ isOpen, id: currentId });
    setRevealPlaintext(false);
    setRiskAssessment(null);
    setCopiedArgs(false);
    setCopiedResult(false);
  }

  function handleClose() {
    setRevealPlaintext(false);
    setRiskAssessment(null);
    setCopiedArgs(false);
    setCopiedResult(false);
    onClose();
  }

  useEffect(() => {
    let ignore = false;
    const assessmentId = invocation?.risk_assessment_id;
    if (assessmentId) {
      queueMicrotask(() => {
        if (!ignore) setIsRiskLoading(true);
      });
      fetchLinkedRiskAssessment(assessmentId)
        .then((data) => {
          if (!ignore) setRiskAssessment(data);
        })
        .catch(() => {
          if (!ignore) setRiskAssessment(null);
        })
        .finally(() => {
          if (!ignore) setIsRiskLoading(false);
        });
    }
    return () => {
      ignore = true;
    };
  }, [invocation?.risk_assessment_id]);

  if (!isOpen || !invocation) return null;

  const decisionConfig = formatGovernanceDecision(invocation.decision);
  const sanitizedExecutionError = sanitizeExecutionError(invocation.execution?.error_message);

  // Effective reveal flag: must have role authority, drawer must be open, and user explicitly toggled
  const isPlaintextRevealed = Boolean(canReveal && isOpen && revealPlaintext);

  // Apply recursive sensitive data masking prior to DOM rendering
  const maskedArguments = maskSensitiveData(invocation.arguments, isPlaintextRevealed);
  const maskedResult = invocation.execution?.result
    ? maskSensitiveData(invocation.execution.result, isPlaintextRevealed)
    : null;

  const argsJson = JSON.stringify(maskedArguments, null, 2);
  const resultJson = maskedResult ? JSON.stringify(maskedResult, null, 2) : "";

  function handleCopyArgs() {
    navigator.clipboard.writeText(argsJson);
    setCopiedArgs(true);
    setTimeout(() => setCopiedArgs(false), 2000);
  }

  function handleCopyResult() {
    if (!resultJson) return;
    navigator.clipboard.writeText(resultJson);
    setCopiedResult(true);
    setTimeout(() => setCopiedResult(false), 2000);
  }

  return (
    <div className="fixed inset-y-0 right-0 z-50 w-full max-w-2xl bg-gray-900 border-l border-gray-800 shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-right duration-200">
      {/* Header */}
      <div className="p-6 border-b border-gray-800 bg-gray-950/40 flex items-start justify-between flex-shrink-0">
        <div>
          <div className="flex items-center gap-3">
            <span
              className={`inline-block px-2.5 py-1 rounded-full text-xs font-bold border ${decisionConfig.badgeClass}`}
            >
              {decisionConfig.label}
            </span>
            {invocation.execution && (
              <ExecutionStatusBadge status={invocation.execution.status} size="sm" />
            )}
          </div>
          <div className="flex items-center gap-2 text-xs text-gray-400 mt-2 font-mono">
            <span>Invocation ID:</span>
            <span className="text-gray-200 select-all">{invocation.id}</span>
          </div>
        </div>

        <button
          type="button"
          onClick={handleClose}
          className="text-gray-400 hover:text-white p-1 rounded-lg hover:bg-gray-800 transition-colors"
        >
          ✕
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Governance Verdict & Violation Codes */}
        <div className="p-4 rounded-xl bg-gray-950/60 border border-gray-800/80 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-400">
              Governance Gateway Evaluation
            </h4>
            <span className="text-xs text-gray-400 font-mono">
              Decision Latency: {formatLatency(invocation.evaluation_duration_ms)}
            </span>
          </div>

          {invocation.violation_codes.length > 0 ? (
            <div className="space-y-1.5">
              <span className="text-[11px] text-rose-400 font-medium">Policy Violation Codes:</span>
              <div className="flex flex-wrap gap-1.5">
                {invocation.violation_codes.map((code, idx) => (
                  <span
                    key={idx}
                    className="px-2 py-0.5 rounded text-[11px] font-mono font-medium bg-rose-500/15 text-rose-300 border border-rose-500/30"
                  >
                    {code}
                  </span>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-xs text-emerald-400">No policy rule violations detected. Request allowed.</p>
          )}

          {/* SHA-256 Arguments Hash */}
          <div className="pt-2 border-t border-gray-800/60 text-xs">
            <span className="text-gray-500 block mb-0.5">Arguments SHA-256 Integrity Hash:</span>
            <div className="font-mono text-[11px] text-gray-300 bg-gray-950 px-2.5 py-1.5 rounded-lg border border-gray-800 break-all select-all">
              {invocation.arguments_hash}
            </div>
          </div>
        </div>

        {/* Execution Error Safety Alert (if failed) */}
        {sanitizedExecutionError && (
          <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 space-y-2">
            <div className="flex items-center gap-2 text-rose-400 text-xs font-semibold uppercase tracking-wider">
              <span>Execution Exception (Sanitized)</span>
            </div>
            <pre className="font-mono text-xs text-rose-300 whitespace-pre-wrap break-all bg-gray-950/60 p-3 rounded-lg border border-rose-500/20">
              <code>{sanitizedExecutionError}</code>
            </pre>
            <p className="text-[11px] text-gray-400">
              Note: Internal filesystem paths, database URIs, and authentication credentials have been scrubbed
              before rendering.
            </p>
          </div>
        )}

        {/* Arguments Inspector with Redaction & Authorized Reveal */}
        <div className="rounded-xl border border-gray-800 bg-gray-950/80 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800 bg-gray-950">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-white">Invocation Arguments</span>
              {!isPlaintextRevealed && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20">
                  Masked
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              {canReveal && (
                <button
                  type="button"
                  onClick={() => setRevealPlaintext(!revealPlaintext)}
                  className={`text-[11px] px-2.5 py-1 rounded-lg font-medium border transition-colors ${
                    isPlaintextRevealed
                      ? "bg-rose-500/20 text-rose-300 border-rose-500/40"
                      : "bg-gray-800 text-gray-300 border-gray-700 hover:text-white"
                  }`}
                >
                  {isPlaintextRevealed ? "Hide Plaintext" : "Reveal Plaintext"}
                </button>
              )}

              <button
                type="button"
                onClick={handleCopyArgs}
                className="text-[11px] text-gray-400 hover:text-white px-2.5 py-1 rounded-lg bg-gray-900 border border-gray-800 transition-colors"
              >
                {copiedArgs ? "Copied!" : "Copy (Masked)"}
              </button>
            </div>
          </div>

          <div className="p-4">
            <pre className="font-mono text-xs text-gray-200 overflow-x-auto max-h-64 leading-relaxed">
              <code>{argsJson}</code>
            </pre>
          </div>
        </div>

        {/* Execution Output Inspector (if executed) */}
        {invocation.execution && (
          <div className="rounded-xl border border-gray-800 bg-gray-950/80 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800 bg-gray-950">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-white">Execution Result</span>
                <span className="text-xs text-gray-400 font-mono">
                  ({formatDurationMs(invocation.execution.duration_ms)})
                </span>
              </div>

              {resultJson && (
                <button
                  type="button"
                  onClick={handleCopyResult}
                  className="text-[11px] text-gray-400 hover:text-white px-2.5 py-1 rounded-lg bg-gray-900 border border-gray-800 transition-colors"
                >
                  {copiedResult ? "Copied!" : "Copy Result"}
                </button>
              )}
            </div>

            <div className="p-4">
              {resultJson ? (
                <pre className="font-mono text-xs text-gray-200 overflow-x-auto max-h-64 leading-relaxed">
                  <code>{resultJson}</code>
                </pre>
              ) : (
                <div className="text-xs text-gray-500 italic">No output result recorded.</div>
              )}
            </div>
          </div>
        )}

        {/* Linked Human Approval Request Card */}
        {invocation.approval_request && (
          <div className="p-4 rounded-xl bg-gray-950/60 border border-gray-800/80 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-amber-400">
                Linked Human-in-the-Loop Review
              </h4>
              {(() => {
                const apprConfig = formatApprovalStatus(invocation.approval_request.status);
                return (
                  <span
                    className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border ${apprConfig.badgeClass}`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${apprConfig.dotClass}`} />
                    {apprConfig.label}
                  </span>
                );
              })()}
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <span className="text-gray-500 block mb-0.5">Approval ID</span>
                <span className="font-mono text-gray-300 select-all">
                  {invocation.approval_request.id.slice(0, 8)}...
                </span>
              </div>
              <div>
                <span className="text-gray-500 block mb-0.5">Reviewed At</span>
                <span className="text-gray-300">
                  {formatDate(invocation.approval_request.decided_at)}
                </span>
              </div>
              {invocation.approval_request.decision_reason && (
                <div className="col-span-2">
                  <span className="text-gray-500 block mb-0.5">Decision Rationale</span>
                  <p className="text-xs text-gray-200 bg-gray-900 p-2.5 rounded-lg border border-gray-800">
                    {invocation.approval_request.decision_reason}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Linked Empirical Risk Assessment Card */}
        {invocation.risk_assessment_id && (
          <div className="p-4 rounded-xl bg-gray-950/60 border border-gray-800/80 space-y-3">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-purple-400">
              Linked Multi-Vector Risk Assessment
            </h4>

            {isRiskLoading ? (
              <div className="text-xs text-gray-400 animate-pulse">Loading risk assessment...</div>
            ) : riskAssessment ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 rounded-lg bg-gray-900 border border-gray-800">
                  <div>
                    <span className="text-[11px] text-gray-400 block">Calculated Risk Score</span>
                    <span className="font-mono text-lg font-bold text-white">
                      {typeof riskAssessment.risk_score === "number"
                        ? riskAssessment.risk_score.toFixed(2)
                        : "—"}
                    </span>
                  </div>
                  <div>
                    <span className="text-[11px] text-gray-400 block">Risk Level</span>
                    <span className="px-2 py-0.5 rounded text-xs font-bold border bg-purple-500/10 text-purple-400 border-purple-500/20">
                      {String(riskAssessment.risk_level || "UNKNOWN")}
                    </span>
                  </div>
                </div>

                {Boolean(riskAssessment.vector_scores && typeof riskAssessment.vector_scores === "object") && (
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    {Object.entries(riskAssessment.vector_scores as Record<string, number>).map(
                      ([vector, score]) => (
                        <div key={vector} className="p-2 rounded bg-gray-900/60 border border-gray-800/60">
                          <span className="text-[10px] text-gray-500 uppercase">{vector}</span>
                          <div className="font-mono text-gray-300 font-semibold">{Number(score).toFixed(2)}</div>
                        </div>
                      )
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="text-xs text-gray-500">
                Risk assessment details could not be loaded or were purged by retention policy.
              </div>
            )}
          </div>
        )}

        {/* Invocation Timestamps */}
        <div className="p-4 rounded-xl bg-gray-950/60 border border-gray-800/80 text-xs text-gray-400 flex items-center justify-between">
          <span>Submitted At: {formatDate(invocation.created_at)}</span>
          {invocation.idempotency_key && (
            <span className="font-mono text-[11px]">Key: {invocation.idempotency_key}</span>
          )}
        </div>
      </div>
    </div>
  );
}
