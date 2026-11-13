/**
 * Slide-Over Detail Drawer for Approval Inspection & Decisions (Phase 9.4).
 *
 * Requirements:
 * - Render only verified backend fields.
 * - Distinctly present approval decision versus execution outcome.
 * - Integrate safe arguments viewer with recursive secret masking.
 * - Enforce 5-role action boundaries via RoleGuard.
 */

import React, { useEffect, useState } from "react";
import type { ApprovalRequestResponse, EntityMetadata } from "@/types/approvals";
import {
  formatDateTimeUtc,
  formatDurationMs,
  formatRelativeTime,
  getExecutionStatusStyle,
  humanizeViolationCode,
  truncateId,
} from "@/lib/approvals/approvals-formatters";
import { resolveAgentMetadata, resolveToolMetadata } from "@/lib/approvals/approvals-api";
import { RoleGuard } from "@/components/auth/role-guard";
import { canDecideApproval } from "@/lib/permissions";
import { ApprovalStatusBadge } from "./approval-status-badge";
import { ApprovalArgumentsViewer } from "./approval-arguments-viewer";
import { ApprovalRiskCard } from "./approval-risk-card";
import { ApprovalDecisionDialog } from "./approval-decision-dialog";

interface ApprovalDetailDrawerProps {
  approval: ApprovalRequestResponse | null;
  submitting: boolean;
  decisionError: string | null;
  decisionSuccess: string | null;
  onDecision: (decision: "APPROVED" | "REJECTED", reason: string) => Promise<boolean>;
  onClose: () => void;
  onClearDecisionState: () => void;
}

export function ApprovalDetailDrawer({
  approval,
  submitting,
  decisionError,
  decisionSuccess,
  onDecision,
  onClose,
  onClearDecisionState,
}: ApprovalDetailDrawerProps) {
  const [agentMeta, setAgentMeta] = useState<EntityMetadata | null>(null);
  const [toolMeta, setToolMeta] = useState<EntityMetadata | null>(null);
  const [dialogDecision, setDialogDecision] = useState<"APPROVED" | "REJECTED" | null>(null);

  const toolReq = approval?.tool_request;

  useEffect(() => {
    let active = true;
    if (toolReq?.agent_id) {
      resolveAgentMetadata(toolReq.agent_id).then((meta) => {
        if (active && meta) setAgentMeta(meta);
      });
    }
    if (toolReq?.tool_id) {
      resolveToolMetadata(toolReq.tool_id).then((meta) => {
        if (active && meta) setToolMeta(meta);
      });
    }
    return () => {
      active = false;
    };
  }, [toolReq?.agent_id, toolReq?.tool_id]);

  if (!approval) return null;

  const isPending = approval.status === "PENDING";
  const execution = toolReq?.execution;
  const executionStyle = execution ? getExecutionStatusStyle(execution.status) : null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/60 backdrop-blur-xs transition-opacity"
        onClick={onClose}
      />

      {/* Slide-over Drawer Panel */}
      <div
        className="fixed inset-y-0 right-0 z-50 w-full max-w-2xl bg-gray-900 border-l border-gray-800 shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-right duration-200"
        role="region"
        aria-label="Approval Request Details"
      >
        {/* Drawer Header */}
        <div className="p-6 border-b border-gray-800 bg-gray-950/60 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2.5">
              <ApprovalStatusBadge status={approval.status} />
              <span className="font-mono text-xs text-gray-400">ID: {truncateId(approval.id, 12)}</span>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Created {formatDateTimeUtc(approval.created_at)} ({formatRelativeTime(approval.created_at)})
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close drawer"
            className="p-2 rounded-xl text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Status Messages */}
        {decisionSuccess && (
          <div className="mx-6 mt-4 p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center justify-between">
            <span>{decisionSuccess}</span>
            <button
              type="button"
              onClick={onClearDecisionState}
              className="text-emerald-400 hover:text-emerald-200 text-[10px] uppercase font-bold"
            >
              Dismiss
            </button>
          </div>
        )}
        {decisionError && (
          <div className="mx-6 mt-4 p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center justify-between">
            <span>{decisionError}</span>
            <button
              type="button"
              onClick={onClearDecisionState}
              className="text-rose-400 hover:text-rose-200 text-[10px] uppercase font-bold"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Section 1: Agent & Tool Identity */}
          <div className="space-y-3">
            <h4 className="text-xs font-semibold text-gray-300 uppercase tracking-wider">Context & Identity</h4>
            <div className="grid grid-cols-2 gap-3">
              {/* Agent Box */}
              <div className="p-3.5 rounded-xl bg-gray-950/60 border border-gray-800/80">
                <span className="text-[10px] text-gray-500 uppercase">Agent Identity</span>
                <div className="text-sm font-semibold text-white mt-0.5">
                  {agentMeta?.name || truncateId(toolReq?.agent_id, 10)}
                </div>
                <div className="text-[11px] font-mono text-gray-400 mt-0.5">
                  ID: {truncateId(toolReq?.agent_id, 10)}
                </div>
                {agentMeta?.risk_tier && (
                  <span className="inline-block mt-2 text-[10px] font-medium px-2 py-0.5 rounded bg-gray-800 text-indigo-300 border border-gray-700">
                    Tier: {agentMeta.risk_tier}
                  </span>
                )}
              </div>

              {/* Tool Box */}
              <div className="p-3.5 rounded-xl bg-gray-950/60 border border-gray-800/80">
                <span className="text-[10px] text-gray-500 uppercase">Tool Requested</span>
                <div className="text-sm font-semibold text-white mt-0.5 font-mono">
                  {toolMeta?.name || truncateId(toolReq?.tool_id, 10)}
                </div>
                <div className="text-[11px] font-mono text-gray-400 mt-0.5">
                  ID: {truncateId(toolReq?.tool_id, 10)}
                </div>
                {toolReq?.tool_version_id && (
                  <span className="inline-block mt-2 text-[10px] font-mono px-2 py-0.5 rounded bg-gray-800 text-gray-300 border border-gray-700">
                    Version: {truncateId(toolReq.tool_version_id, 8)}
                  </span>
                )}
              </div>
            </div>

            {/* Run and Environment Context */}
            <div className="p-3 rounded-xl bg-gray-950/40 border border-gray-800/60 text-xs text-gray-400 flex flex-wrap items-center justify-between gap-2">
              <div>
                <span>Run ID: </span>
                <span className="font-mono text-gray-300">{toolReq?.run_id || "—"}</span>
              </div>
              <div>
                <span>Integrity Hash: </span>
                <span className="font-mono text-gray-300" title={approval.integrity_hash}>
                  {truncateId(approval.integrity_hash, 10)}
                </span>
              </div>
            </div>
          </div>

          {/* Section 2: Policy Triggers & Violations */}
          <div className="space-y-2">
            <h4 className="text-xs font-semibold text-gray-300 uppercase tracking-wider">Governance Verdict</h4>
            <div className="p-3.5 rounded-xl bg-gray-950/60 border border-gray-800/80 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-400">Gateway Decision:</span>
                <span className="text-xs font-bold text-amber-400 px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/20">
                  {toolReq?.decision || "REQUIRE_APPROVAL"}
                </span>
              </div>
              <div className="text-xs">
                <span className="text-gray-400 block mb-1.5">Violation Codes:</span>
                <div className="flex flex-wrap gap-1.5">
                  {toolReq?.violation_codes && toolReq.violation_codes.length > 0 ? (
                    toolReq.violation_codes.map((code) => (
                      <span
                        key={code}
                        className="text-xs px-2.5 py-0.5 rounded-md bg-rose-500/10 text-rose-300 border border-rose-500/25 font-medium"
                      >
                        {humanizeViolationCode(code)}
                      </span>
                    ))
                  ) : (
                    <span className="text-gray-500">None explicitly listed</span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Section 3: Risk Assessment Context */}
          <ApprovalRiskCard assessmentId={toolReq?.risk_assessment_id} />

          {/* Section 4: Evaluated Arguments (Safe Masking Viewer) */}
          <ApprovalArgumentsViewer
            key={approval.id}
            argumentsPayload={toolReq?.arguments}
            argumentsHash={toolReq?.arguments_hash}
          />

          {/* Section 5: Execution Telemetry (When present) */}
          {execution && (
            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-gray-300 uppercase tracking-wider">
                Execution Telemetry
              </h4>
              <div className="p-4 rounded-xl bg-gray-950/80 border border-gray-800 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-400">Execution Outcome:</span>
                    {executionStyle && (
                      <span className={`text-xs px-2.5 py-0.5 rounded-md border font-semibold ${executionStyle.badge}`}>
                        {executionStyle.label}
                      </span>
                    )}
                  </div>
                  {execution.duration_ms !== null && (
                    <span className="text-xs text-gray-400 font-mono">
                      Duration: {formatDurationMs(execution.duration_ms)}
                    </span>
                  )}
                </div>

                {execution.executed_at && (
                  <div className="text-[11px] text-gray-500">
                    Executed at: {formatDateTimeUtc(execution.executed_at)}
                  </div>
                )}

                {execution.error_message && (
                  <div className="p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs">
                    <strong className="block text-[11px] uppercase">Execution Error:</strong>
                    {execution.error_message}
                  </div>
                )}

                {execution.result !== null && execution.result !== undefined && (
                  <div>
                    <span className="text-[11px] text-gray-400 block mb-1">Result Payload:</span>
                    <pre className="p-2.5 rounded-lg bg-gray-900 border border-gray-800 text-[11px] font-mono text-gray-300 overflow-x-auto max-h-40">
                      <code>{JSON.stringify(execution.result, null, 2)}</code>
                    </pre>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Section 6: Previous Decision Information (When decided) */}
          {!isPending && (
            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-gray-300 uppercase tracking-wider">
                Decision Audit Record
              </h4>
              <div className="p-4 rounded-xl bg-gray-950/60 border border-gray-800 text-xs space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-gray-400">Recorded Decision:</span>
                  <ApprovalStatusBadge status={approval.status} />
                </div>
                {approval.decided_at && (
                  <div className="flex items-center justify-between">
                    <span className="text-gray-400">Decided At:</span>
                    <span className="text-gray-200">{formatDateTimeUtc(approval.decided_at)}</span>
                  </div>
                )}
                {approval.approver_user_id && (
                  <div className="flex items-center justify-between">
                    <span className="text-gray-400">Reviewer User ID:</span>
                    <span className="font-mono text-gray-300">{approval.approver_user_id}</span>
                  </div>
                )}
                {approval.decision_reason && (
                  <div className="pt-2 border-t border-gray-800/60">
                    <span className="text-gray-400 block mb-1">Operator Rationale:</span>
                    <p className="text-gray-200 bg-gray-900/60 p-2 rounded border border-gray-800 italic">
                      &ldquo;{approval.decision_reason}&rdquo;
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Drawer Footer / Action Bar */}
        <div className="p-4 border-t border-gray-800 bg-gray-950/80">
          {isPending ? (
            <div className="flex items-center justify-end gap-3">
              {/* Reject Action */}
              <RoleGuard
                check={canDecideApproval}
                disabled
                disabledMessage="Deciding approvals requires ADMIN or SECURITY_ANALYST role"
              >
                <button
                  type="button"
                  onClick={() => setDialogDecision("REJECTED")}
                  disabled={submitting}
                  className="px-4 py-2 rounded-lg bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-500/30 text-xs font-semibold transition-colors disabled:opacity-40"
                >
                  Reject Request
                </button>
              </RoleGuard>

              {/* Approve Action */}
              <RoleGuard
                check={canDecideApproval}
                disabled
                disabledMessage="Deciding approvals requires ADMIN or SECURITY_ANALYST role"
              >
                <button
                  type="button"
                  onClick={() => setDialogDecision("APPROVED")}
                  disabled={submitting}
                  className="px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm shadow-emerald-600/30 text-xs font-semibold transition-colors disabled:opacity-40"
                >
                  Approve Request
                </button>
              </RoleGuard>
            </div>
          ) : (
            <div className="flex items-center justify-between text-xs text-gray-400">
              <span>This approval request has already been finalized.</span>
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-200"
              >
                Close Drawer
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Decision Modal Confirmation Dialog */}
      <ApprovalDecisionDialog
        isOpen={Boolean(dialogDecision)}
        decisionType={dialogDecision}
        agentName={agentMeta?.name || truncateId(toolReq?.agent_id, 8)}
        toolName={toolMeta?.name || truncateId(toolReq?.tool_id, 8)}
        submitting={submitting}
        error={decisionError}
        onConfirm={async (dec, reason) => {
          const success = await onDecision(dec, reason);
          if (success) {
            setDialogDecision(null);
          }
          return success;
        }}
        onClose={() => setDialogDecision(null)}
      />
    </>
  );
}

