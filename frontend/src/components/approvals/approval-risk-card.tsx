/**
 * Risk Assessment Card for Approval Detail Drawer (Phase 9.4).
 */

import React, { useEffect, useState } from "react";
import type { RiskAssessmentSummary } from "@/types/approvals";
import { resolveRiskAssessment } from "@/lib/approvals/approvals-api";

interface ApprovalRiskCardProps {
  assessmentId: string | null | undefined;
}

export function ApprovalRiskCard({ assessmentId }: ApprovalRiskCardProps) {
  const [risk, setRisk] = useState<RiskAssessmentSummary | null>(null);
  const [loading, setLoading] = useState(Boolean(assessmentId));

  useEffect(() => {
    let active = true;
    if (!assessmentId) return;

    (async () => {
      const res = await resolveRiskAssessment(assessmentId);
      if (active) {
        setRisk(res);
        setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [assessmentId]);

  if (!assessmentId) {
    return (
      <div className="p-3 rounded-xl bg-gray-900/40 border border-gray-800 text-xs text-gray-500">
        No linked risk assessment record.
      </div>
    );
  }

  if (loading) {
    return (
      <div className="p-4 rounded-xl bg-gray-900/40 border border-gray-800 animate-pulse space-y-2">
        <div className="w-28 h-4 bg-gray-800 rounded" />
        <div className="h-10 bg-gray-800/60 rounded-lg" />
      </div>
    );
  }

  if (!risk) {
    return (
      <div className="p-3 rounded-xl bg-gray-900/40 border border-gray-800 text-xs text-gray-400">
        Risk Assessment ID: <span className="font-mono text-gray-300">{assessmentId.slice(0, 8)}…</span>
      </div>
    );
  }

  const levelColor =
    risk.risk_level === "CRITICAL"
      ? "text-rose-400 bg-rose-500/10 border-rose-500/30"
      : risk.risk_level === "HIGH"
      ? "text-amber-400 bg-amber-500/10 border-amber-500/30"
      : risk.risk_level === "MEDIUM"
      ? "text-yellow-400 bg-yellow-500/10 border-yellow-500/30"
      : "text-emerald-400 bg-emerald-500/10 border-emerald-500/30";

  return (
    <div className="p-4 rounded-xl bg-gray-900/60 border border-gray-800/80 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-gray-200">Risk Assessment</span>
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${levelColor}`}>
            {risk.risk_level}
          </span>
        </div>
        <div className="text-right">
          <span className="text-xs text-gray-400">Score: </span>
          <span className="text-sm font-bold text-white font-mono">{risk.risk_score}</span>
          <span className="text-[10px] text-gray-500"> / 100</span>
        </div>
      </div>

      {/* Subscores Grid */}
      <div className="grid grid-cols-4 gap-2 text-center pt-1 border-t border-gray-800/60">
        <div className="p-1.5 rounded-lg bg-gray-950/60 border border-gray-800/60">
          <div className="text-[10px] text-gray-500">Tool</div>
          <div className="text-xs font-semibold text-gray-200 font-mono">
            {risk.subscore_tool !== undefined ? risk.subscore_tool.toFixed(2) : "—"}
          </div>
        </div>
        <div className="p-1.5 rounded-lg bg-gray-950/60 border border-gray-800/60">
          <div className="text-[10px] text-gray-500">Data</div>
          <div className="text-xs font-semibold text-gray-200 font-mono">
            {risk.subscore_data !== undefined ? risk.subscore_data.toFixed(2) : "—"}
          </div>
        </div>
        <div className="p-1.5 rounded-lg bg-gray-950/60 border border-gray-800/60">
          <div className="text-[10px] text-gray-500">Agent</div>
          <div className="text-xs font-semibold text-gray-200 font-mono">
            {risk.subscore_agent !== undefined ? risk.subscore_agent.toFixed(2) : "—"}
          </div>
        </div>
        <div className="p-1.5 rounded-lg bg-gray-950/60 border border-gray-800/60">
          <div className="text-[10px] text-gray-500">Context</div>
          <div className="text-xs font-semibold text-gray-200 font-mono">
            {risk.subscore_context !== undefined ? risk.subscore_context.toFixed(2) : "—"}
          </div>
        </div>
      </div>

      {risk.explanation && (
        <p className="text-[11px] text-gray-400 bg-gray-950/40 p-2 rounded-lg border border-gray-800/40">
          {risk.explanation}
        </p>
      )}
    </div>
  );
}

