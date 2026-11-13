/**
 * Policy Rule Editor Component (Phase 9.5).
 *
 * Implements draft rule authoring with exact 7-field target scoping,
 * AST condition integration, and strict published-version immutability lock.
 */

"use client";

import React, { useState } from "react";
import type {
  PolicyAction,
  PolicyRuleCreate,
  PolicyRuleResponse,
  PolicyRuleUpdate,
  PolicyVersionResponse,
  TargetScopeSchema,
} from "@/types/policies";
import { AstConditionBuilder } from "./ast-condition-builder";

interface PolicyRuleEditorProps {
  version: PolicyVersionResponse;
  initialRule?: PolicyRuleResponse | null;
  onSave: (ruleData: PolicyRuleCreate | PolicyRuleUpdate) => Promise<boolean>;
  onCancel: () => void;
  submitting?: boolean;
}

const DEFAULT_SCOPE: TargetScopeSchema = {
  agent_ids: [],
  agent_environments: [],
  agent_risk_tiers: [],
  tool_ids: [],
  tool_risk_levels: [],
  tool_access_types: [],
  tool_data_classifications: [],
};

export function PolicyRuleEditor({
  version,
  initialRule,
  onSave,
  onCancel,
  submitting = false,
}: PolicyRuleEditorProps) {
  const isImmutable = version.status !== "DRAFT";

  // Form Fields
  const [ruleName, setRuleName] = useState(initialRule?.rule_name || "");
  const [description, setDescription] = useState(initialRule?.description || "");
  const [ruleOrder, setRuleOrder] = useState<number>(initialRule?.rule_order ?? 1);
  const [action, setAction] = useState<PolicyAction>(initialRule?.action || "DENY");
  const [violationCode, setViolationCode] = useState(initialRule?.violation_code || "POLICY_VIOLATION");
  const [remediationMessage, setRemediationMessage] = useState(initialRule?.remediation_message || "");
  const [isEnabled, setIsEnabled] = useState(initialRule?.is_enabled ?? true);

  // Target Scope (7 exact fields)
  const [scope, setScope] = useState<TargetScopeSchema>(
    initialRule?.target_scope || DEFAULT_SCOPE
  );

  // AST Condition Tree
  const [conditionTree, setConditionTree] = useState<Record<string, unknown>>(
    initialRule?.condition_tree || { combinator: "AND", conditions: [] }
  );

  const [validationError, setValidationError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isImmutable) return;

    if (!ruleName.trim()) {
      setValidationError("Rule name is required.");
      return;
    }

    setValidationError(null);

    const payload: PolicyRuleCreate = {
      rule_name: ruleName.trim(),
      description: description.trim() || null,
      rule_order: Math.max(1, ruleOrder),
      action,
      violation_code: violationCode.trim() || "POLICY_VIOLATION",
      remediation_message: remediationMessage.trim() || null,
      target_scope: scope,
      condition_tree: conditionTree,
      is_enabled: isEnabled,
    };

    const success = await onSave(payload);
    if (success) {
      onCancel();
    }
  };

  const handleArrayScopeChange = (field: keyof TargetScopeSchema, raw: string) => {
    const items = raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    setScope((prev) => ({ ...prev, [field]: items }));
  };

  return (
    <div className="rounded-2xl bg-gray-900 border border-gray-800 p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-800 pb-4">
        <div>
          <h3 className="text-base font-bold text-white">
            {initialRule ? `Edit Rule: ${initialRule.rule_name}` : "Create Policy Rule"}
          </h3>
          <p className="text-xs text-gray-400 mt-0.5">
            Target Version: <span className="font-mono text-indigo-400">v{version.version_number}</span> ({version.status})
          </p>
        </div>

        {isImmutable && (
          <div className="px-3 py-1 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-medium">
            Published Version Immutable — Read-Only
          </div>
        )}
      </div>

      {isImmutable && (
        <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs">
          <strong>Version Immutability Warning:</strong> Version v{version.version_number} is frozen and published. Rules cannot be added or modified in place. Please branch a new draft version to make changes.
        </div>
      )}

      {validationError && (
        <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs">
          {validationError}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Basic Metadata Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-gray-300">Rule Name *</label>
            <input
              type="text"
              required
              disabled={isImmutable}
              value={ruleName}
              onChange={(e) => setRuleName(e.target.value)}
              placeholder="e.g. Block destructive shell execution"
              className="w-full bg-gray-950 border border-gray-800 text-gray-200 text-xs rounded-lg px-3 py-2 focus:border-indigo-500 focus:outline-none disabled:opacity-50"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-gray-300">Rule Order</label>
              <input
                type="number"
                min={1}
                disabled={isImmutable}
                value={ruleOrder}
                onChange={(e) => setRuleOrder(parseInt(e.target.value, 10) || 1)}
                className="w-full bg-gray-950 border border-gray-800 text-gray-200 text-xs rounded-lg px-3 py-2 font-mono focus:border-indigo-500 focus:outline-none disabled:opacity-50"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-gray-300">Enforcement Action</label>
              <select
                disabled={isImmutable}
                value={action}
                onChange={(e) => setAction(e.target.value as PolicyAction)}
                className="w-full bg-gray-950 border border-gray-800 text-gray-200 text-xs rounded-lg px-3 py-2 focus:border-indigo-500 focus:outline-none disabled:opacity-50"
              >
                <option value="DENY">DENY (Block invocation)</option>
                <option value="REQUIRE_APPROVAL">REQUIRE APPROVAL (Gate)</option>
                <option value="ALLOW">ALLOW (Permit execution)</option>
              </select>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-gray-300">Violation Code</label>
            <input
              type="text"
              disabled={isImmutable}
              value={violationCode}
              onChange={(e) => setViolationCode(e.target.value)}
              placeholder="POL_SEC_COMMAND_INJECTION"
              className="w-full bg-gray-950 border border-gray-800 text-gray-200 text-xs rounded-lg px-3 py-2 font-mono focus:border-indigo-500 focus:outline-none disabled:opacity-50"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-gray-300">Remediation Guidance</label>
            <input
              type="text"
              disabled={isImmutable}
              value={remediationMessage}
              onChange={(e) => setRemediationMessage(e.target.value)}
              placeholder="Provide clear steps for operator resolution"
              className="w-full bg-gray-950 border border-gray-800 text-gray-200 text-xs rounded-lg px-3 py-2 focus:border-indigo-500 focus:outline-none disabled:opacity-50"
            />
          </div>

          <div className="md:col-span-2 space-y-1">
            <label className="text-xs font-semibold text-gray-300">Rule Description</label>
            <textarea
              rows={2}
              disabled={isImmutable}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Explain the security rationale and intent of this rule"
              className="w-full bg-gray-950 border border-gray-800 text-gray-200 text-xs rounded-lg p-2.5 focus:border-indigo-500 focus:outline-none disabled:opacity-50 resize-y"
            />
          </div>
        </div>

        {/* Enabled Switch */}
        <div className="flex items-center gap-3">
          <input
            type="checkbox"
            id="rule-enabled-checkbox"
            disabled={isImmutable}
            checked={isEnabled}
            onChange={(e) => setIsEnabled(e.target.checked)}
            className="w-4 h-4 rounded bg-gray-950 border-gray-700 text-indigo-600 focus:ring-indigo-500 focus:ring-offset-gray-900"
          />
          <label htmlFor="rule-enabled-checkbox" className="text-xs font-medium text-gray-300 cursor-pointer">
            Rule is actively enabled for evaluation
          </label>
        </div>

        {/* Target Scope Accordion (Exact 7 backend fields) */}
        <div className="rounded-xl border border-gray-800 bg-gray-950/40 p-4 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-gray-200">
              Target Scope Criteria (Leave empty to apply to all)
            </span>
            <span className="text-[11px] text-gray-500">Comma-separated values</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
            <div className="space-y-1">
              <label className="text-gray-400">Agent IDs</label>
              <input
                type="text"
                disabled={isImmutable}
                value={scope.agent_ids?.join(", ") || ""}
                onChange={(e) => handleArrayScopeChange("agent_ids", e.target.value)}
                placeholder="agent-uuid-1, agent-uuid-2"
                className="w-full bg-gray-900 border border-gray-800 text-gray-200 text-xs rounded px-2.5 py-1.5 font-mono focus:border-indigo-500 focus:outline-none disabled:opacity-50"
              />
            </div>

            <div className="space-y-1">
              <label className="text-gray-400">Agent Environments</label>
              <input
                type="text"
                disabled={isImmutable}
                value={scope.agent_environments?.join(", ") || ""}
                onChange={(e) => handleArrayScopeChange("agent_environments", e.target.value)}
                placeholder="DEVELOPMENT, STAGING, PRODUCTION"
                className="w-full bg-gray-900 border border-gray-800 text-gray-200 text-xs rounded px-2.5 py-1.5 font-mono focus:border-indigo-500 focus:outline-none disabled:opacity-50"
              />
            </div>

            <div className="space-y-1">
              <label className="text-gray-400">Agent Risk Tiers</label>
              <input
                type="text"
                disabled={isImmutable}
                value={scope.agent_risk_tiers?.join(", ") || ""}
                onChange={(e) => handleArrayScopeChange("agent_risk_tiers", e.target.value)}
                placeholder="TIER_1_LOW, TIER_4_CRITICAL"
                className="w-full bg-gray-900 border border-gray-800 text-gray-200 text-xs rounded px-2.5 py-1.5 font-mono focus:border-indigo-500 focus:outline-none disabled:opacity-50"
              />
            </div>

            <div className="space-y-1">
              <label className="text-gray-400">Tool IDs</label>
              <input
                type="text"
                disabled={isImmutable}
                value={scope.tool_ids?.join(", ") || ""}
                onChange={(e) => handleArrayScopeChange("tool_ids", e.target.value)}
                placeholder="tool-uuid-1, tool-uuid-2"
                className="w-full bg-gray-900 border border-gray-800 text-gray-200 text-xs rounded px-2.5 py-1.5 font-mono focus:border-indigo-500 focus:outline-none disabled:opacity-50"
              />
            </div>

            <div className="space-y-1">
              <label className="text-gray-400">Tool Risk Levels</label>
              <input
                type="text"
                disabled={isImmutable}
                value={scope.tool_risk_levels?.join(", ") || ""}
                onChange={(e) => handleArrayScopeChange("tool_risk_levels", e.target.value)}
                placeholder="LOW, MEDIUM, HIGH, CRITICAL"
                className="w-full bg-gray-900 border border-gray-800 text-gray-200 text-xs rounded px-2.5 py-1.5 font-mono focus:border-indigo-500 focus:outline-none disabled:opacity-50"
              />
            </div>

            <div className="space-y-1">
              <label className="text-gray-400">Tool Access Types</label>
              <input
                type="text"
                disabled={isImmutable}
                value={scope.tool_access_types?.join(", ") || ""}
                onChange={(e) => handleArrayScopeChange("tool_access_types", e.target.value)}
                placeholder="READ, WRITE, ADMIN, NETWORK"
                className="w-full bg-gray-900 border border-gray-800 text-gray-200 text-xs rounded px-2.5 py-1.5 font-mono focus:border-indigo-500 focus:outline-none disabled:opacity-50"
              />
            </div>

            <div className="space-y-1 md:col-span-2">
              <label className="text-gray-400">Tool Data Classifications</label>
              <input
                type="text"
                disabled={isImmutable}
                value={scope.tool_data_classifications?.join(", ") || ""}
                onChange={(e) => handleArrayScopeChange("tool_data_classifications", e.target.value)}
                placeholder="PUBLIC, INTERNAL, CONFIDENTIAL, RESTRICTED"
                className="w-full bg-gray-900 border border-gray-800 text-gray-200 text-xs rounded px-2.5 py-1.5 font-mono focus:border-indigo-500 focus:outline-none disabled:opacity-50"
              />
            </div>
          </div>
        </div>

        {/* AST Condition Builder */}
        <AstConditionBuilder
          tree={conditionTree}
          onChange={setConditionTree}
          readOnly={isImmutable}
        />

        {/* Action Controls */}
        <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-800">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs font-medium transition-colors"
          >
            Cancel
          </button>
          {!isImmutable && (
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition-colors shadow-sm shadow-indigo-600/30 disabled:opacity-50 flex items-center gap-2"
            >
              {submitting ? "Saving..." : initialRule ? "Update Rule" : "Create Rule"}
            </button>
          )}
        </div>
      </form>
    </div>
  );
}

