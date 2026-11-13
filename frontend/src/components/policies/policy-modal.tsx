/**
 * Policy Container Authoring & Edit Modal Component (Phase 9.5).
 *
 * Enforces exact backend constraints:
 * - name: 1..255 chars
 * - slug: optional, auto-generated if omitted
 * - priority: 1..10000 (lower = higher priority, default 100)
 * - policy_type: SECURITY, OPERATIONAL, COMPLIANCE, FINANCIAL
 * - default_action: ALLOW, DENY, REQUIRE_APPROVAL
 */

"use client";

import React, { useState } from "react";
import type { PolicyAction, PolicyCreate, PolicyResponse, PolicyType, PolicyUpdate } from "@/types/policies";

interface PolicyModalProps {
  initialPolicy?: PolicyResponse | null;
  onSave: (data: PolicyCreate | PolicyUpdate) => Promise<unknown>;
  onClose: () => void;
  submitting?: boolean;
}

export function PolicyModal({
  initialPolicy,
  onSave,
  onClose,
  submitting = false,
}: PolicyModalProps) {
  const isEditing = Boolean(initialPolicy);

  const [name, setName] = useState(initialPolicy?.name || "");
  const [slug, setSlug] = useState(initialPolicy?.slug || "");
  const [description, setDescription] = useState(initialPolicy?.description || "");
  const [policyType, setPolicyType] = useState<PolicyType>(initialPolicy?.policy_type || "SECURITY");
  const [priority, setPriority] = useState<number>(initialPolicy?.priority ?? 100);
  const [defaultAction, setDefaultAction] = useState<PolicyAction>(initialPolicy?.default_action || "DENY");

  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Policy name is required.");
      return;
    }

    if (priority < 1 || priority > 10000) {
      setError("Priority must be between 1 and 10000.");
      return;
    }

    setError(null);

    let res: unknown;
    if (isEditing) {
      res = await onSave({
        name: name.trim(),
        description: description.trim() || null,
        policy_type: policyType,
        priority,
        default_action: defaultAction,
      });
    } else {
      res = await onSave({
        name: name.trim(),
        slug: slug.trim() || null,
        description: description.trim() || null,
        policy_type: policyType,
        priority,
        default_action: defaultAction,
      });
    }

    if (res) {
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
      <div className="w-full max-w-lg rounded-2xl bg-gray-900 border border-gray-800 shadow-2xl p-6 space-y-5">
        <div className="flex items-center justify-between border-b border-gray-800 pb-3">
          <h3 className="text-base font-bold text-white">
            {isEditing ? "Edit Policy Container" : "Create New Governance Policy"}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-white p-1 rounded-lg hover:bg-gray-800"
          >
            ✕
          </button>
        </div>

        {error && (
          <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-gray-300">Policy Name *</label>
            <input
              type="text"
              required
              maxLength={255}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Strict Production Data Governance"
              className="w-full bg-gray-950 border border-gray-800 text-gray-200 text-xs rounded-lg px-3 py-2 focus:border-indigo-500 focus:outline-none"
            />
          </div>

          {!isEditing && (
            <div className="space-y-1">
              <label className="text-xs font-semibold text-gray-300">
                Slug <span className="text-gray-500 font-normal">(Optional, auto-generated if omitted)</span>
              </label>
              <input
                type="text"
                maxLength={255}
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                placeholder="e.g. strict-prod-data-governance"
                className="w-full bg-gray-950 border border-gray-800 text-gray-200 text-xs rounded-lg px-3 py-2 font-mono focus:border-indigo-500 focus:outline-none"
              />
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-gray-300">Policy Type</label>
              <select
                value={policyType}
                onChange={(e) => setPolicyType(e.target.value as PolicyType)}
                className="w-full bg-gray-950 border border-gray-800 text-gray-200 text-xs rounded-lg px-3 py-2 focus:border-indigo-500 focus:outline-none"
              >
                <option value="SECURITY">Security</option>
                <option value="OPERATIONAL">Operational</option>
                <option value="COMPLIANCE">Compliance</option>
                <option value="FINANCIAL">Financial</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-gray-300">Default Fallback Action</label>
              <select
                value={defaultAction}
                onChange={(e) => setDefaultAction(e.target.value as PolicyAction)}
                className="w-full bg-gray-950 border border-gray-800 text-gray-200 text-xs rounded-lg px-3 py-2 focus:border-indigo-500 focus:outline-none"
              >
                <option value="DENY">DENY (Safest)</option>
                <option value="REQUIRE_APPROVAL">REQUIRE APPROVAL</option>
                <option value="ALLOW">ALLOW</option>
              </select>
            </div>
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-gray-300">Evaluation Priority</label>
              <span className="text-[11px] text-gray-400">1..10000 (Lower = Higher Priority)</span>
            </div>
            <input
              type="number"
              min={1}
              max={10000}
              value={priority}
              onChange={(e) => setPriority(parseInt(e.target.value, 10) || 100)}
              className="w-full bg-gray-950 border border-gray-800 text-gray-200 text-xs rounded-lg px-3 py-2 font-mono focus:border-indigo-500 focus:outline-none"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-gray-300">Description</label>
            <textarea
              rows={3}
              maxLength={1000}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="State the objective and regulatory context for this policy"
              className="w-full bg-gray-950 border border-gray-800 text-gray-200 text-xs rounded-lg p-2.5 focus:border-indigo-500 focus:outline-none resize-y"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition-colors shadow-sm shadow-indigo-600/30 disabled:opacity-50"
            >
              {submitting ? "Saving..." : isEditing ? "Save Changes" : "Create Policy"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

