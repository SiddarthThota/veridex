"use client";

/**
 * Deep Session Forensics Workspace (Phase 9.6).
 *
 * Route: /runs/[runId]
 * Page Access: ADMIN, SECURITY_ANALYST, AUDITOR, AGENT_OPERATOR (VIEWER: Denied HTTP 403)
 * Action Access: ADMIN, AGENT_OPERATOR (canManageRuns)
 */

import React, { useEffect, useState, use } from "react";
import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { useAuth } from "@/components/auth/auth-context";
import { canManageRuns } from "@/lib/permissions";
import { fetchRun, fetchRunInvocations, invokeTool, updateRunStatus, RunApiError } from "@/lib/runs/runs-api";
import type {
  AgentRunResponse,
  AgentRunStatusUpdate,
  ToolInvocationRequest,
  ToolRequestResponse,
} from "@/types/runs";
import { RunStatusBadge } from "@/components/runs/run-status-badge";
import { InvocationTimeline } from "@/components/runs/invocation-timeline";
import { InvocationDetailDrawer } from "@/components/runs/invocation-detail-drawer";
import { RunModal } from "@/components/runs/run-modal";
import { formatDate, sanitizeExecutionError } from "@/lib/runs/runs-formatters";
import { formatEnvironment } from "@/lib/agents/agents-formatters";

interface RunDetailsPageProps {
  params: Promise<{ runId: string }>;
}

export default function RunDetailsPage({ params }: RunDetailsPageProps) {
  const resolvedParams = use(params);
  const runId = resolvedParams.runId;

  const { user } = useAuth();
  const isViewer = user?.role === "VIEWER";
  const canMutate = canManageRuns(user?.role);

  const [run, setRun] = useState<AgentRunResponse | null>(null);
  const [invocations, setInvocations] = useState<ToolRequestResponse[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Inspector and Modal states
  const [selectedInvocation, setSelectedInvocation] = useState<ToolRequestResponse | null>(null);
  const [isStatusModalOpen, setIsStatusModalOpen] = useState(false);
  const [isInvokeModalOpen, setIsInvokeModalOpen] = useState(false);

  // Invoke Tool Form state
  const [invokeToolId, setInvokeToolId] = useState("");
  const [invokeVersionId, setInvokeVersionId] = useState("");
  const [invokeArgsJson, setInvokeArgsJson] = useState('{\n  "query": "SELECT * FROM audit_logs"\n}');
  const [invokeSubmitting, setInvokeSubmitting] = useState(false);
  const [invokeError, setInvokeError] = useState<string | null>(null);

  // Load run and invocations
  const loadForensicsData = React.useCallback(async () => {
    if (!runId || isViewer) return;
    setIsLoading(true);
    setError(null);
    try {
      const [runData, invocationsData] = await Promise.all([
        fetchRun(runId),
        fetchRunInvocations(runId, 100, 0),
      ]);
      setRun(runData);
      setInvocations(invocationsData.items);
    } catch (err) {
      const msg = err instanceof RunApiError ? err.detail : "Failed to load session forensics";
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  }, [runId, isViewer]);

  useEffect(() => {
    let ignore = false;
    async function loadData() {
      try {
        const [runData, invocationsData] = await Promise.all([
          fetchRun(runId),
          fetchRunInvocations(runId, 100, 0),
        ]);
        if (!ignore) {
          setRun(runData);
          setInvocations(invocationsData.items);
          setError(null);
        }
      } catch (err) {
        if (!ignore) {
          const msg = err instanceof RunApiError ? err.detail : "Failed to load session forensics";
          setError(msg);
        }
      } finally {
        if (!ignore) {
          setIsLoading(false);
        }
      }
    }

    if (runId && !isViewer) {
      loadData();
    }

    return () => {
      ignore = true;
    };
  }, [runId, isViewer]);

  // Handle status update
  async function handleUpdateStatus(id: string, payload: AgentRunStatusUpdate) {
    const updated = await updateRunStatus(id, payload);
    setRun(updated);
  }

  // Handle invoking tool within active run
  async function handleInvokeTool(e: React.FormEvent) {
    e.preventDefault();
    if (!run) return;
    if (!invokeToolId.trim() || !invokeVersionId.trim()) {
      setInvokeError("Tool UUID and Tool Version UUID are required.");
      return;
    }

    let parsedArgs: Record<string, unknown> = {};
    if (invokeArgsJson.trim()) {
      try {
        parsedArgs = JSON.parse(invokeArgsJson);
      } catch {
        setInvokeError("Arguments must be valid JSON.");
        return;
      }
    }

    setInvokeSubmitting(true);
    setInvokeError(null);
    try {
      const payload: ToolInvocationRequest = {
        agent_id: run.agent_id,
        tool_id: invokeToolId.trim(),
        tool_version_id: invokeVersionId.trim(),
        arguments: parsedArgs,
      };

      await invokeTool(run.id, payload);
      setIsInvokeModalOpen(false);
      // Reload timeline
      const updatedInvocations = await fetchRunInvocations(run.id, 100, 0);
      setInvocations(updatedInvocations.items);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to dispatch tool invocation";
      setInvokeError(msg);
    } finally {
      setInvokeSubmitting(false);
    }
  }

  // VIEWER role block
  if (isViewer) {
    return (
      <AppShell>
        <div className="flex flex-col items-center justify-center p-12 text-center my-12 max-w-xl mx-auto rounded-3xl bg-gray-900/60 border border-rose-500/20 shadow-2xl backdrop-blur-md">
          <div className="w-16 h-16 rounded-2xl bg-rose-500/10 text-rose-400 border border-rose-500/20 flex items-center justify-center mb-4">
            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
              />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-white tracking-tight">Access Restricted</h2>
          <p className="text-xs text-rose-300 font-medium mt-1">
            Execution Forensics Boundary Enforcement
          </p>
          <p className="text-xs text-gray-400 mt-3 leading-relaxed">
            In accordance with VERIDEX governance architecture and the backend v0.8.0 security matrix, the{" "}
            <span className="font-semibold text-gray-200">VIEWER</span> role is strictly denied access to execution
            sessions, tool invocation timelines, and forensic telemetry.
          </p>
          <div className="mt-6">
            <Link
              href="/agents"
              className="py-2 px-4 rounded-xl bg-gray-800 hover:bg-gray-700 text-white text-xs font-medium transition-colors"
            >
              Return to Fleet Registry
            </Link>
          </div>
        </div>
      </AppShell>
    );
  }

  const envConfig = run ? formatEnvironment(run.environment) : null;
  const sanitizedRunError = sanitizeExecutionError(run?.error_message);

  return (
    <AppShell>
      {/* Breadcrumb Navigation */}
      <div className="flex items-center gap-2 text-xs text-gray-400 pb-4">
        <Link href="/runs" className="hover:text-white transition-colors">
          Agent Runs
        </Link>
        <span>/</span>
        <span className="font-mono text-purple-400 select-all">
          {run ? `${run.id.slice(0, 8)}...` : runId}
        </span>
      </div>

      {/* Main Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 border-b border-gray-800">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-bold tracking-tight text-white font-mono">
              Session Forensics: {run?.id || runId}
            </h2>
            {run && <RunStatusBadge status={run.status} size="md" />}
          </div>
          <div className="flex flex-wrap items-center gap-3 text-xs text-gray-400 mt-1">
            {envConfig && (
              <span className={`px-2 py-0.5 rounded text-[10px] font-medium border ${envConfig.badgeClass}`}>
                {envConfig.label}
              </span>
            )}
            {run?.trace_id && (
              <span className="font-mono text-[11px] px-2 py-0.5 rounded bg-gray-950 border border-gray-800 text-gray-300">
                Trace: {run.trace_id}
              </span>
            )}
            <span>Started: {formatDate(run?.started_at)}</span>
            {run?.completed_at && <span>Completed: {formatDate(run.completed_at)}</span>}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={loadForensicsData}
            className="py-2 px-3 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white text-xs font-medium transition-colors"
          >
            Refresh
          </button>

          {canMutate && (
            <>
              <button
                type="button"
                onClick={() => setIsInvokeModalOpen(true)}
                className="py-2 px-3.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-medium text-xs transition-colors shadow-sm shadow-purple-600/20"
              >
                + Invoke Tool
              </button>

              <button
                type="button"
                onClick={() => setIsStatusModalOpen(true)}
                className="py-2 px-3.5 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-200 font-medium text-xs transition-colors"
              >
                Update Status
              </button>
            </>
          )}
        </div>
      </div>

      {error && (
        <div className="mt-4 p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-400">
          {error}
        </div>
      )}

      {/* Session Metadata & Prompt Strip */}
      {run && (
        <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Prompt card */}
          <div className="p-4 rounded-2xl bg-gray-900/60 border border-gray-800/80 md:col-span-2 space-y-2">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-400">Input Prompt</h4>
            <p className="text-xs text-gray-200 whitespace-pre-wrap leading-relaxed font-sans bg-gray-950/60 p-3 rounded-xl border border-gray-800/60">
              {run.input_prompt || "No input prompt supplied for this agent run session."}
            </p>

            {run.output_summary && (
              <div className="pt-2">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-emerald-400 mb-1">
                  Output Summary
                </h4>
                <p className="text-xs text-gray-200 whitespace-pre-wrap leading-relaxed font-sans bg-gray-950/60 p-3 rounded-xl border border-gray-800/60">
                  {run.output_summary}
                </p>
              </div>
            )}
          </div>

          {/* Session Overview Stats */}
          <div className="p-4 rounded-2xl bg-gray-900/60 border border-gray-800/80 space-y-3 text-xs">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-400">Session Context</h4>
            <div>
              <span className="text-gray-500 block mb-0.5">Agent UUID</span>
              <span className="font-mono text-gray-300 text-[11px] select-all">{run.agent_id}</span>
            </div>
            <div>
              <span className="text-gray-500 block mb-0.5">Initiator User ID</span>
              <span className="font-mono text-gray-300 text-[11px] select-all">{run.user_id}</span>
            </div>
            <div>
              <span className="text-gray-500 block mb-0.5">Bound Version Snapshot</span>
              <span className="font-mono text-gray-300 text-[11px]">
                {run.agent_version_id ? run.agent_version_id.slice(0, 8) + "..." : "Active Root Agent"}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Sanitized Run Error (if any) */}
      {sanitizedRunError && (
        <div className="mt-4 p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-300">
          <div className="font-semibold text-rose-400 mb-1">Run Session Failure:</div>
          <pre className="font-mono text-xs whitespace-pre-wrap break-all">{sanitizedRunError}</pre>
        </div>
      )}

      {/* Invocations Forensics Timeline */}
      <div className="mt-8 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-white">Tool Invocation Audit Stream</h3>
            <p className="text-xs text-gray-400 mt-0.5">
              Chronological sequence of tool requests routed through the Governance Gateway in this run session.
            </p>
          </div>
          <span className="text-xs font-mono text-purple-400 bg-purple-500/10 px-2.5 py-1 rounded-full border border-purple-500/20">
            {invocations.length} Invocations
          </span>
        </div>

        <InvocationTimeline
          invocations={invocations}
          isLoading={isLoading}
          onSelectInvocation={(inv) => setSelectedInvocation(inv)}
        />
      </div>

      {/* Slide-over Forensics Inspector */}
      <InvocationDetailDrawer
        invocation={selectedInvocation}
        isOpen={Boolean(selectedInvocation)}
        onClose={() => setSelectedInvocation(null)}
      />

      {/* Update Run Status Modal */}
      {isStatusModalOpen && run && (
        <RunModal
          isOpen={isStatusModalOpen}
          initialRun={run}
          onClose={() => setIsStatusModalOpen(false)}
          onSubmitCreate={async () => {}}
          onSubmitUpdateStatus={handleUpdateStatus}
        />
      )}

      {/* Invoke Tool Dialog */}
      {isInvokeModalOpen && run && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="relative w-full max-w-lg rounded-2xl bg-gray-900 border border-gray-800 shadow-2xl p-6 overflow-hidden">
            <div className="flex items-center justify-between pb-4 border-b border-gray-800">
              <div>
                <h3 className="text-base font-semibold text-white">Invoke Tool in Active Session</h3>
                <p className="text-xs text-gray-400 mt-0.5 font-mono">Run: {run.id.slice(0, 8)}...</p>
              </div>
              <button
                type="button"
                onClick={() => setIsInvokeModalOpen(false)}
                className="text-gray-400 hover:text-white p-1"
              >
                ✕
              </button>
            </div>

            {invokeError && (
              <div className="mt-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-400">
                {invokeError}
              </div>
            )}

            <form onSubmit={handleInvokeTool} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-300 mb-1">
                  Tool UUID <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={invokeToolId}
                  onChange={(e) => setInvokeToolId(e.target.value)}
                  placeholder="e.g. 11111111-2222-3333-4444-555555555555"
                  className="w-full px-3 py-2 rounded-xl bg-gray-950 border border-gray-800 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-purple-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-300 mb-1">
                  Tool Version UUID <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={invokeVersionId}
                  onChange={(e) => setInvokeVersionId(e.target.value)}
                  placeholder="e.g. 66666666-7777-8888-9999-000000000000"
                  className="w-full px-3 py-2 rounded-xl bg-gray-950 border border-gray-800 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-purple-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-300 mb-1">
                  Invocation Arguments (JSON)
                </label>
                <textarea
                  rows={4}
                  value={invokeArgsJson}
                  onChange={(e) => setInvokeArgsJson(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-gray-950 border border-gray-800 text-xs text-purple-300 placeholder-gray-600 focus:outline-none focus:border-purple-500 font-mono"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-800">
                <button
                  type="button"
                  onClick={() => setIsInvokeModalOpen(false)}
                  disabled={invokeSubmitting}
                  className="py-2 px-4 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={invokeSubmitting}
                  className="py-2 px-4 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white text-xs font-medium transition-colors shadow-sm shadow-purple-600/20"
                >
                  {invokeSubmitting ? "Invoking..." : "Dispatch Invocation"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AppShell>
  );
}
