/**
 * Risk Scoring Configuration Publisher Component (Phase 9.5).
 *
 * Implements 4-vector weight tuning, threshold monotonicity validation,
 * change impact review, and immutable configuration publishing forward.
 */

"use client";

import React, { useState } from "react";
import type {
  RiskConfigurationResponse,
  RiskConfigurationVersionCreate,
  RiskConfigurationVersionResponse,
} from "@/types/risk";
import { validateRiskWeights, validateThresholds } from "@/lib/risk/risk-formatters";
import { RoleGuard } from "@/components/auth/role-guard";
import { canManageRiskConfig } from "@/lib/permissions";

interface RiskConfigPublisherProps {
  activeConfig: RiskConfigurationResponse | null;
  proposedConfig: RiskConfigurationVersionCreate;
  onChangeProposed: React.Dispatch<React.SetStateAction<RiskConfigurationVersionCreate>>;
  onPublish: (payload: RiskConfigurationVersionCreate) => Promise<RiskConfigurationVersionResponse | null>;
  loading?: boolean;
  submitting?: boolean;
  error?: string | null;
  success?: string | null;
}

export function RiskConfigPublisher({
  activeConfig,
  proposedConfig,
  onChangeProposed,
  onPublish,
  loading = false,
  submitting = false,
  error,
  success,
}: RiskConfigPublisherProps) {
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  const activeVersion = activeConfig?.current_version;

  // Weight validation
  const weightVal = validateRiskWeights(
    proposedConfig.weight_tool ?? 0.35,
    proposedConfig.weight_data ?? 0.25,
    proposedConfig.weight_agent ?? 0.20,
    proposedConfig.weight_context ?? 0.20
  );

  // Threshold validation
  const threshVal = validateThresholds(
    proposedConfig.threshold_medium ?? 30,
    proposedConfig.threshold_high ?? 60,
    proposedConfig.threshold_critical ?? 85,
    proposedConfig.approval_threshold ?? 60,
    proposedConfig.deny_threshold ?? 90
  );

  const handleWeightChange = (key: keyof RiskConfigurationVersionCreate, val: number) => {
    onChangeProposed((prev) => ({ ...prev, [key]: Number(val.toFixed(2)) }));
  };

  const handleThresholdChange = (key: keyof RiskConfigurationVersionCreate, val: number) => {
    onChangeProposed((prev) => ({ ...prev, [key]: Math.min(100, Math.max(0, val)) }));
  };

  const handleOpenReview = (e: React.FormEvent) => {
    e.preventDefault();
    if (!weightVal.valid) {
      setValidationError(weightVal.error || "Weights must sum to 1.00");
      return;
    }
    if (!threshVal.valid) {
      setValidationError(threshVal.error || "Thresholds must be strictly monotonic");
      return;
    }
    setValidationError(null);
    setConfirmModalOpen(true);
  };

  const handleConfirmPublish = async () => {
    const published = await onPublish(proposedConfig);
    if (published) {
      setConfirmModalOpen(false);
    }
  };

  if (loading && !activeConfig) {
    return (
      <div className="p-12 text-center text-sm text-gray-400 bg-gray-900 border border-gray-800 rounded-2xl">
        <div className="animate-pulse">Loading active risk configuration...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Configuration Header Banner */}
      <div className="p-6 rounded-2xl bg-gray-900 border border-gray-800 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <span>Risk Scoring Weights & Thresholds Configuration</span>
              {activeVersion && (
                <span className="text-xs font-mono font-medium px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  Active v{activeVersion.version_number}
                </span>
              )}
            </h3>
            <p className="text-xs text-gray-400 mt-1">
              Governs organizational 4-vector risk evaluation, automated gating thresholds, and human-in-the-loop escalation rules.
            </p>
          </div>

          <div className="text-xs font-mono text-gray-400 bg-gray-950/80 px-3 py-1.5 rounded-lg border border-gray-800">
            Algorithm Version: {activeVersion?.scoring_algorithm_version || "1.0.0"}
          </div>
        </div>

        <div className="p-3 rounded-xl bg-gray-950/60 border border-gray-800/60 text-xs text-gray-400">
          <strong className="text-gray-300">Architecture Invariant:</strong> The backend publishes risk configurations strictly forward as immutable version snapshots. There is no rollback endpoint; reverting requires publishing a new configuration with previous values.
        </div>
      </div>

      {/* Notifications */}
      {success && (
        <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs">
          {success}
        </div>
      )}
      {(error || validationError) && (
        <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs">
          {error || validationError}
        </div>
      )}

      {/* Configuration Form */}
      <form onSubmit={handleOpenReview} className="space-y-6">
        {/* 1. Four-Vector Weights Tuning */}
        <div className="p-5 rounded-2xl bg-gray-900/60 border border-gray-800 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-gray-800">
            <div>
              <h4 className="text-sm font-bold text-white">1. Four-Vector Weights Tuning</h4>
              <p className="text-xs text-gray-400">
                Weights dictate the relative contribution of each dimension. The sum must equal exactly 1.00 (100%).
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400">Current Sum:</span>
              <span
                className={`font-mono text-xs font-bold px-2 py-0.5 rounded border ${
                  weightVal.valid
                    ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                    : "bg-rose-500/10 text-rose-400 border-rose-500/20 animate-pulse"
                }`}
              >
                {weightVal.sum.toFixed(2)} / 1.00
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-2">
            {/* Tool Weight */}
            <div className="p-3.5 rounded-xl bg-gray-950/80 border border-gray-800 space-y-2">
              <div className="flex justify-between text-xs">
                <span className="font-semibold text-sky-400">Tool Capability Weight (w_tool)</span>
                <span className="font-mono font-bold text-white">
                  {((proposedConfig.weight_tool ?? 0.35) * 100).toFixed(0)}%
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={proposedConfig.weight_tool ?? 0.35}
                onChange={(e) => handleWeightChange("weight_tool", parseFloat(e.target.value))}
                className="w-full accent-sky-500 cursor-pointer"
              />
              <p className="text-[11px] text-gray-400">Inherent blast radius and destructive access</p>
            </div>

            {/* Data Weight */}
            <div className="p-3.5 rounded-xl bg-gray-950/80 border border-gray-800 space-y-2">
              <div className="flex justify-between text-xs">
                <span className="font-semibold text-purple-400">Data Classification Weight (w_data)</span>
                <span className="font-mono font-bold text-white">
                  {((proposedConfig.weight_data ?? 0.25) * 100).toFixed(0)}%
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={proposedConfig.weight_data ?? 0.25}
                onChange={(e) => handleWeightChange("weight_data", parseFloat(e.target.value))}
                className="w-full accent-purple-500 cursor-pointer"
              />
              <p className="text-[11px] text-gray-400">Payload sensitivity and confidentiality tier</p>
            </div>

            {/* Agent Weight */}
            <div className="p-3.5 rounded-xl bg-gray-950/80 border border-gray-800 space-y-2">
              <div className="flex justify-between text-xs">
                <span className="font-semibold text-amber-400">Agent Trust Weight (w_agent)</span>
                <span className="font-mono font-bold text-white">
                  {((proposedConfig.weight_agent ?? 0.20) * 100).toFixed(0)}%
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={proposedConfig.weight_agent ?? 0.20}
                onChange={(e) => handleWeightChange("weight_agent", parseFloat(e.target.value))}
                className="w-full accent-amber-500 cursor-pointer"
              />
              <p className="text-[11px] text-gray-400">Empirical violation history & risk tier</p>
            </div>

            {/* Context Weight */}
            <div className="p-3.5 rounded-xl bg-gray-950/80 border border-gray-800 space-y-2">
              <div className="flex justify-between text-xs">
                <span className="font-semibold text-rose-400">Context Weight (w_context)</span>
                <span className="font-mono font-bold text-white">
                  {((proposedConfig.weight_context ?? 0.20) * 100).toFixed(0)}%
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={proposedConfig.weight_context ?? 0.20}
                onChange={(e) => handleWeightChange("weight_context", parseFloat(e.target.value))}
                className="w-full accent-rose-500 cursor-pointer"
              />
              <p className="text-[11px] text-gray-400">Runtime environment & argument heuristics</p>
            </div>
          </div>
        </div>

        {/* 2. Governance Risk Thresholds */}
        <div className="p-5 rounded-2xl bg-gray-900/60 border border-gray-800 space-y-4">
          <div className="pb-3 border-b border-gray-800">
            <h4 className="text-sm font-bold text-white">2. Score Band & Enforcement Thresholds</h4>
            <p className="text-xs text-gray-400">
              Categorizes composite scores ($0 \dots 100$) into action gates. Thresholds must be strictly monotonic.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <div className="p-3 rounded-xl bg-gray-950 border border-gray-800 space-y-1">
              <label className="text-[11px] font-semibold text-sky-400 block">Medium Band (≥)</label>
              <input
                type="number"
                min={0}
                max={100}
                value={proposedConfig.threshold_medium ?? 30}
                onChange={(e) => handleThresholdChange("threshold_medium", parseInt(e.target.value, 10))}
                className="w-full bg-gray-900 border border-gray-700 text-gray-200 text-xs rounded px-2.5 py-1.5 font-mono focus:border-indigo-500 focus:outline-none"
              />
              <span className="text-[10px] text-gray-500">Audited execution</span>
            </div>

            <div className="p-3 rounded-xl bg-gray-950 border border-gray-800 space-y-1">
              <label className="text-[11px] font-semibold text-amber-400 block">High Band (≥)</label>
              <input
                type="number"
                min={0}
                max={100}
                value={proposedConfig.threshold_high ?? 60}
                onChange={(e) => handleThresholdChange("threshold_high", parseInt(e.target.value, 10))}
                className="w-full bg-gray-900 border border-gray-700 text-gray-200 text-xs rounded px-2.5 py-1.5 font-mono focus:border-indigo-500 focus:outline-none"
              />
              <span className="text-[10px] text-gray-500">Gating threshold</span>
            </div>

            <div className="p-3 rounded-xl bg-gray-950 border border-gray-800 space-y-1">
              <label className="text-[11px] font-semibold text-rose-400 block">Critical Band (≥)</label>
              <input
                type="number"
                min={0}
                max={100}
                value={proposedConfig.threshold_critical ?? 85}
                onChange={(e) => handleThresholdChange("threshold_critical", parseInt(e.target.value, 10))}
                className="w-full bg-gray-900 border border-gray-700 text-gray-200 text-xs rounded px-2.5 py-1.5 font-mono focus:border-indigo-500 focus:outline-none"
              />
              <span className="text-[10px] text-gray-500">Severe risk</span>
            </div>

            <div className="p-3 rounded-xl bg-gray-950 border border-gray-800 space-y-1">
              <label className="text-[11px] font-semibold text-indigo-400 block">Require Approval (≥)</label>
              <input
                type="number"
                min={0}
                max={100}
                value={proposedConfig.approval_threshold ?? 60}
                onChange={(e) => handleThresholdChange("approval_threshold", parseInt(e.target.value, 10))}
                className="w-full bg-gray-900 border border-gray-700 text-gray-200 text-xs rounded px-2.5 py-1.5 font-mono focus:border-indigo-500 focus:outline-none"
              />
              <span className="text-[10px] text-gray-500">Escalate to queue</span>
            </div>

            <div className="p-3 rounded-xl bg-gray-950 border border-gray-800 space-y-1">
              <label className="text-[11px] font-semibold text-rose-400 block">Automatic Deny (≥)</label>
              <input
                type="number"
                min={0}
                max={100}
                value={proposedConfig.deny_threshold ?? 90}
                onChange={(e) => handleThresholdChange("deny_threshold", parseInt(e.target.value, 10))}
                className="w-full bg-gray-900 border border-gray-700 text-gray-200 text-xs rounded px-2.5 py-1.5 font-mono focus:border-indigo-500 focus:outline-none"
              />
              <span className="text-[10px] text-gray-500">Immediate block</span>
            </div>
          </div>
        </div>

        {/* 3. Changelog & Submit */}
        <div className="p-5 rounded-2xl bg-gray-900/60 border border-gray-800 space-y-3">
          <label className="text-xs font-semibold text-gray-300 block">
            Publication Changelog & Audit Rationale
          </label>
          <input
            type="text"
            maxLength={1000}
            value={proposedConfig.changelog || ""}
            onChange={(e) => onChangeProposed((prev) => ({ ...prev, changelog: e.target.value }))}
            placeholder="e.g. Elevate tool weight to 0.40 following security audit"
            className="w-full bg-gray-950 border border-gray-800 text-gray-200 text-xs rounded-lg px-3 py-2 focus:border-indigo-500 focus:outline-none"
          />

          <div className="flex items-center justify-end pt-2">
            <RoleGuard check={canManageRiskConfig}>
              <button
                type="submit"
                disabled={submitting || !weightVal.valid || !threshVal.valid}
                className="px-6 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs transition-colors shadow-sm shadow-indigo-600/30 disabled:opacity-50"
              >
                Review & Publish Configuration Version
              </button>
            </RoleGuard>
          </div>
        </div>
      </form>

      {/* Review & Confirmation Modal */}
      {confirmModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-2xl bg-gray-900 border border-gray-800 shadow-2xl p-6 space-y-5">
            <h3 className="text-base font-bold text-white">Publish New Risk Configuration?</h3>

            <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs space-y-2">
              <p>
                <strong>Operational Impact:</strong> Publishing this configuration creates an <strong>immutable new snapshot</strong> that will immediately govern all subsequent tool evaluations across the platform.
              </p>
              <ul className="list-disc list-inside space-y-1 text-gray-300">
                <li>Tool Weight: {((proposedConfig.weight_tool ?? 0.35) * 100).toFixed(0)}%</li>
                <li>Data Weight: {((proposedConfig.weight_data ?? 0.25) * 100).toFixed(0)}%</li>
                <li>Agent Weight: {((proposedConfig.weight_agent ?? 0.20) * 100).toFixed(0)}%</li>
                <li>Context Weight: {((proposedConfig.weight_context ?? 0.20) * 100).toFixed(0)}%</li>
                <li>Approval Gate: ≥ {proposedConfig.approval_threshold} pts</li>
                <li>Deny Gate: ≥ {proposedConfig.deny_threshold} pts</li>
              </ul>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2 border-t border-gray-800">
              <button
                type="button"
                onClick={() => setConfirmModalOpen(false)}
                className="px-4 py-2 rounded-lg bg-gray-800 text-gray-300 text-xs"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={handleConfirmPublish}
                className="px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs disabled:opacity-50"
              >
                {submitting ? "Publishing..." : "Confirm & Activate"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

