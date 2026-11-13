/**
 * Policy Detail & Version Management View (Phase 9.5).
 *
 * Implements full container inspection, immutable version timeline,
 * client-side structural diff, draft branching, and publishing safeguards.
 */

"use client";

import React, { useState } from "react";
import type {
  PolicyResponse,
  PolicyRuleCreate,
  PolicyRuleResponse,
  PolicyRuleUpdate,
  PolicyStatus,
  PolicyVersionResponse,
} from "@/types/policies";
import { formatPriority } from "@/lib/policies/policies-formatters";
import {
  PolicyActionBadge,
  PolicyStatusBadge,
  PolicyTypeBadge,
  PolicyVersionStatusBadge,
} from "./policy-status-badge";
import { PolicyRuleEditor } from "./policy-rule-editor";
import { PolicyVersionDiffModal } from "./policy-version-diff-modal";
import { RoleGuard } from "@/components/auth/role-guard";
import { canManagePolicies } from "@/lib/permissions";

interface PolicyDetailViewProps {
  policy: PolicyResponse;
  versions: PolicyVersionResponse[];
  selectedVersion: PolicyVersionResponse | null;
  onSelectVersion: (versionId: string) => void;
  onBranchDraft: (changelog?: string) => Promise<unknown>;
  onPublishVersion: (versionId: string) => Promise<boolean>;
  onUpdateStatus: (newStatus: PolicyStatus) => Promise<boolean>;
  onArchive: () => Promise<boolean>;
  onSaveRule: (versionId: string, ruleData: PolicyRuleCreate | PolicyRuleUpdate, ruleId?: string) => Promise<boolean>;
  onDeleteRule: (versionId: string, ruleId: string) => Promise<boolean>;
  onBack: () => void;
  submitting?: boolean;
}

export function PolicyDetailView({
  policy,
  versions,
  selectedVersion,
  onSelectVersion,
  onBranchDraft,
  onPublishVersion,
  onUpdateStatus,
  onArchive,
  onSaveRule,
  onDeleteRule,
  onBack,
  submitting = false,
}: PolicyDetailViewProps) {
  // Editing Rule state
  const [editingRule, setEditingRule] = useState<PolicyRuleResponse | null>(null);
  const [isCreatingRule, setIsCreatingRule] = useState(false);

  // Modals state
  const [branchModalOpen, setBranchModalOpen] = useState(false);
  const [branchChangelog, setBranchChangelog] = useState("");
  const [publishModalOpen, setPublishModalOpen] = useState(false);
  const [archiveModalOpen, setArchiveModalOpen] = useState(false);
  const [diffVersionB, setDiffVersionB] = useState<PolicyVersionResponse | null>(null);

  const priorityMeta = formatPriority(policy.priority);
  const isSelectedVersionDraft = selectedVersion?.status === "DRAFT";

  const handleBranchSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onBranchDraft(branchChangelog.trim() || undefined);
    setBranchModalOpen(false);
    setBranchChangelog("");
  };

  const handlePublishConfirm = async () => {
    if (!selectedVersion) return;
    const success = await onPublishVersion(selectedVersion.id);
    if (success) {
      setPublishModalOpen(false);
    }
  };

  const handleArchiveConfirm = async () => {
    const success = await onArchive();
    if (success) {
      setArchiveModalOpen(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Navigation & Back Action */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white transition-colors"
        >
          <span>← Back to Policy Registry</span>
        </button>

        <div className="flex items-center gap-2">
          {/* Status Transitions */}
          <RoleGuard check={canManagePolicies}>
            {policy.status !== "ARCHIVED" && (
              <div className="flex items-center gap-1.5">
                {policy.status !== "ACTIVE" && (
                  <button
                    type="button"
                    disabled={submitting || !policy.current_version_id}
                    onClick={() => onUpdateStatus("ACTIVE")}
                    title={!policy.current_version_id ? "Must publish a version before activating" : undefined}
                    className="px-2.5 py-1 rounded bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/30 text-xs border border-emerald-500/30 disabled:opacity-40"
                  >
                    Activate
                  </button>
                )}
                {policy.status === "ACTIVE" && (
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={() => onUpdateStatus("INACTIVE")}
                    className="px-2.5 py-1 rounded bg-gray-800 text-gray-300 hover:bg-gray-700 text-xs border border-gray-700"
                  >
                    Deactivate
                  </button>
                )}
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => setArchiveModalOpen(true)}
                  className="px-2.5 py-1 rounded bg-rose-950/40 text-rose-400 hover:bg-rose-900/60 text-xs border border-rose-800/40"
                >
                  Archive Policy
                </button>
              </div>
            )}
          </RoleGuard>
        </div>
      </div>

      {/* Policy Container Banner */}
      <div className="p-6 rounded-2xl bg-gray-900/80 border border-gray-800 shadow-sm space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-bold tracking-tight text-white">{policy.name}</h2>
              <PolicyStatusBadge status={policy.status} />
              <PolicyTypeBadge type={policy.policy_type} />
            </div>
            <p className="text-xs text-gray-400">
              Slug: <span className="font-mono text-gray-300">{policy.slug}</span> • ID: <span className="font-mono text-gray-400 text-[11px]">{policy.id}</span>
            </p>
          </div>

          <div className="flex items-center gap-3 text-xs bg-gray-950/80 px-3.5 py-2 rounded-xl border border-gray-800">
            <div>
              <span className="text-gray-500 block text-[10px]">Priority:</span>
              <span className={priorityMeta.tone}>{priorityMeta.label}</span>
            </div>
            <div className="h-6 w-px bg-gray-800" />
            <div>
              <span className="text-gray-500 block text-[10px]">Default Action:</span>
              <PolicyActionBadge action={policy.default_action} />
            </div>
            <div className="h-6 w-px bg-gray-800" />
            <div>
              <span className="text-gray-500 block text-[10px]">Active Version:</span>
              <span className="font-mono text-indigo-400 font-semibold">
                {policy.current_version ? `v${policy.current_version.version_number}` : "None"}
              </span>
            </div>
          </div>
        </div>

        {policy.description && (
          <p className="text-xs text-gray-300 leading-relaxed max-w-4xl pt-2 border-t border-gray-800/60">
            {policy.description}
          </p>
        )}
      </div>

      {/* Version Selector Bar & Actions */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-xl bg-gray-950/80 border border-gray-800">
        <div className="flex items-center gap-2 overflow-x-auto">
          <span className="text-xs font-semibold text-gray-400">Versions:</span>
          {versions.map((v) => (
            <button
              key={v.id}
              type="button"
              onClick={() => onSelectVersion(v.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono font-medium transition-colors flex items-center gap-1.5 border ${
                selectedVersion?.id === v.id
                  ? "bg-indigo-600/20 text-indigo-300 border-indigo-500/40 shadow-xs"
                  : "bg-gray-900 text-gray-400 border-gray-800 hover:text-gray-200"
              }`}
            >
              <span>v{v.version_number}</span>
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  v.status === "PUBLISHED"
                    ? "bg-emerald-400"
                    : v.status === "DRAFT"
                    ? "bg-amber-400"
                    : "bg-gray-500"
                }`}
              />
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          {/* Version Diff Action */}
          {versions.length > 1 && selectedVersion && (
            <div className="flex items-center gap-1 text-xs">
              <span className="text-gray-500 text-[11px]">Compare to:</span>
              <select
                onChange={(e) => {
                  const target = versions.find((v) => v.id === e.target.value);
                  if (target) setDiffVersionB(target);
                }}
                defaultValue=""
                className="bg-gray-900 border border-gray-800 text-gray-300 text-xs rounded px-2 py-1 font-mono focus:outline-none"
              >
                <option value="" disabled>
                  Select Version...
                </option>
                {versions
                  .filter((v) => v.id !== selectedVersion.id)
                  .map((v) => (
                    <option key={v.id} value={v.id}>
                      v{v.version_number} ({v.status})
                    </option>
                  ))}
              </select>
            </div>
          )}

          {/* Branch Draft Button */}
          <RoleGuard check={canManagePolicies}>
            <button
              type="button"
              disabled={submitting}
              onClick={() => setBranchModalOpen(true)}
              className="px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-200 font-medium text-xs border border-gray-700 transition-colors"
            >
              + Branch Draft Version
            </button>
          </RoleGuard>

          {/* Publish Draft Button */}
          {isSelectedVersionDraft && (
            <RoleGuard check={canManagePolicies}>
              <button
                type="button"
                disabled={submitting}
                onClick={() => setPublishModalOpen(true)}
                className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs transition-colors shadow-sm shadow-emerald-600/30"
              >
                Publish Version v{selectedVersion.version_number}
              </button>
            </RoleGuard>
          )}
        </div>
      </div>

      {/* Selected Version Detail & Rules */}
      {selectedVersion ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-white">
                Rules in Version v{selectedVersion.version_number}
              </h3>
              <PolicyVersionStatusBadge status={selectedVersion.status} />
              {selectedVersion.changelog && (
                <span className="text-xs text-gray-400 italic">
                  &ldquo;{selectedVersion.changelog}&rdquo;
                </span>
              )}
            </div>

            {isSelectedVersionDraft && !isCreatingRule && !editingRule && (
              <RoleGuard check={canManagePolicies}>
                <button
                  type="button"
                  onClick={() => setIsCreatingRule(true)}
                  className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs transition-colors shadow-sm"
                >
                  + Add Rule
                </button>
              </RoleGuard>
            )}
          </div>

          {/* Inlined Rule Editor */}
          {(isCreatingRule || editingRule) && (
            <PolicyRuleEditor
              version={selectedVersion}
              initialRule={editingRule}
              submitting={submitting}
              onSave={async (ruleData) => {
                const ok = await onSaveRule(selectedVersion.id, ruleData, editingRule?.id);
                if (ok) {
                  setIsCreatingRule(false);
                  setEditingRule(null);
                }
                return ok;
              }}
              onCancel={() => {
                setIsCreatingRule(false);
                setEditingRule(null);
              }}
            />
          )}

          {/* Rule Cards List */}
          {selectedVersion.rules.length === 0 ? (
            <div className="p-8 text-center rounded-2xl bg-gray-900/40 border border-gray-800 text-gray-500 text-xs">
              No rules configured in this version yet.
              {isSelectedVersionDraft && (
                <div className="mt-2">
                  <button
                    type="button"
                    onClick={() => setIsCreatingRule(true)}
                    className="text-indigo-400 hover:underline"
                  >
                    Click here to add the first rule.
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {selectedVersion.rules
                .sort((a, b) => a.rule_order - b.rule_order)
                .map((rule) => (
                  <div
                    key={rule.id}
                    className="p-4 rounded-xl bg-gray-900/60 border border-gray-800 hover:border-gray-700/80 transition-all space-y-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="px-1.5 py-0.5 rounded bg-gray-800 text-gray-400 font-mono text-[11px]">
                          #{rule.rule_order}
                        </span>
                        <h4 className="text-sm font-semibold text-white">{rule.rule_name}</h4>
                        <PolicyActionBadge action={rule.action} />
                        {!rule.is_enabled && (
                          <span className="px-2 py-0.5 rounded bg-gray-800 text-gray-400 text-[10px]">
                            Disabled
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono text-gray-500">{rule.violation_code}</span>
                        {isSelectedVersionDraft && (
                          <RoleGuard check={canManagePolicies}>
                            <button
                              type="button"
                              onClick={() => setEditingRule(rule)}
                              className="px-2 py-1 rounded bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => onDeleteRule(selectedVersion.id, rule.id)}
                              className="px-2 py-1 rounded bg-rose-950/40 hover:bg-rose-900/60 text-rose-400 text-xs"
                            >
                              Delete
                            </button>
                          </RoleGuard>
                        )}
                      </div>
                    </div>

                    {rule.description && (
                      <p className="text-xs text-gray-400">{rule.description}</p>
                    )}

                    {/* Scope Summary */}
                    <div className="flex flex-wrap items-center gap-2 text-[11px] text-gray-400 pt-2 border-t border-gray-800/60">
                      <span className="text-gray-500 font-medium">Scope:</span>
                      {rule.target_scope.agent_ids?.length > 0 && (
                        <span className="px-2 py-0.5 rounded bg-gray-950 text-indigo-300">
                          Agents: {rule.target_scope.agent_ids.join(", ")}
                        </span>
                      )}
                      {rule.target_scope.tool_ids?.length > 0 && (
                        <span className="px-2 py-0.5 rounded bg-gray-950 text-sky-300">
                          Tools: {rule.target_scope.tool_ids.join(", ")}
                        </span>
                      )}
                      {rule.target_scope.tool_risk_levels?.length > 0 && (
                        <span className="px-2 py-0.5 rounded bg-gray-950 text-amber-300">
                          Risk: {rule.target_scope.tool_risk_levels.join(", ")}
                        </span>
                      )}
                      {(!rule.target_scope.agent_ids?.length &&
                        !rule.target_scope.tool_ids?.length &&
                        !rule.target_scope.tool_risk_levels?.length) && (
                        <span className="text-gray-500 italic">Universal Scope (All Invocations)</span>
                      )}
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>
      ) : (
        <div className="p-8 text-center rounded-2xl bg-gray-900/40 border border-gray-800 text-gray-500 text-xs">
          Select a version above to inspect rules.
        </div>
      )}

      {/* --- Modals --- */}

      {/* Branch Draft Modal */}
      {branchModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl bg-gray-900 border border-gray-800 shadow-2xl p-6 space-y-4">
            <h3 className="text-base font-bold text-white">Branch New Draft Version</h3>
            <p className="text-xs text-gray-400">
              Clones all existing rules from the active published version into a new mutable DRAFT version with an incremented version number.
            </p>
            <form onSubmit={handleBranchSubmit} className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-gray-300">Changelog Entry</label>
                <input
                  type="text"
                  maxLength={1000}
                  value={branchChangelog}
                  onChange={(e) => setBranchChangelog(e.target.value)}
                  placeholder="e.g. Add strict database drop prevention rule"
                  className="w-full bg-gray-950 border border-gray-800 text-gray-200 text-xs rounded-lg px-3 py-2 focus:border-indigo-500 focus:outline-none"
                />
              </div>
              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setBranchModalOpen(false)}
                  className="px-4 py-2 rounded-lg bg-gray-800 text-gray-300 text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs disabled:opacity-50"
                >
                  {submitting ? "Branching..." : "Create Draft"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Publish Version Confirmation Modal */}
      {publishModalOpen && selectedVersion && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl bg-gray-900 border border-gray-800 shadow-2xl p-6 space-y-4">
            <h3 className="text-base font-bold text-white">Publish Version v{selectedVersion.version_number}?</h3>
            <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs space-y-2">
              <p>
                <strong>Warning:</strong> Publishing freezes this version as <strong>IMMUTABLE</strong>.
              </p>
              <ul className="list-disc list-inside space-y-1 text-gray-300">
                <li>Existing published versions will be retired.</li>
                <li>This version will immediately govern runtime policy evaluation.</li>
                <li>Rules cannot be altered after publication.</li>
              </ul>
            </div>
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setPublishModalOpen(false)}
                className="px-4 py-2 rounded-lg bg-gray-800 text-gray-300 text-xs"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={handlePublishConfirm}
                className="px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs disabled:opacity-50"
              >
                {submitting ? "Publishing..." : "Confirm & Publish"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Archive Policy Confirmation Modal */}
      {archiveModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl bg-gray-900 border border-gray-800 shadow-2xl p-6 space-y-4">
            <h3 className="text-base font-bold text-rose-400">Archive Policy: {policy.name}?</h3>
            <p className="text-xs text-gray-300">
              Archiving permanently deactivates this policy. Its rules will no longer be evaluated for tool invocations.
            </p>
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setArchiveModalOpen(false)}
                className="px-4 py-2 rounded-lg bg-gray-800 text-gray-300 text-xs"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={handleArchiveConfirm}
                className="px-5 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-semibold text-xs disabled:opacity-50"
              >
                {submitting ? "Archiving..." : "Confirm Archive"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Version Diff Modal */}
      {diffVersionB && selectedVersion && (
        <PolicyVersionDiffModal
          versionA={selectedVersion}
          versionB={diffVersionB}
          onClose={() => setDiffVersionB(null)}
        />
      )}
    </div>
  );
}

