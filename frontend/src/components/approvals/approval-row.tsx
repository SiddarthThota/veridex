/**
 * Queue Table Row Component for Approvals Queue (Phase 9.4).
 */

import React, { useEffect, useState } from "react";
import type { ApprovalRequestResponse, EntityMetadata } from "@/types/approvals";
import {
  formatDateTimeUtc,
  formatRelativeTime,
  humanizeViolationCode,
  truncateId,
} from "@/lib/approvals/approvals-formatters";
import { resolveAgentMetadata, resolveToolMetadata } from "@/lib/approvals/approvals-api";
import { ApprovalStatusBadge } from "./approval-status-badge";

interface ApprovalRowProps {
  approval: ApprovalRequestResponse;
  isSelected: boolean;
  onSelect: (approval: ApprovalRequestResponse) => void;
}

export function ApprovalRow({ approval, isSelected, onSelect }: ApprovalRowProps) {
  const [agentMeta, setAgentMeta] = useState<EntityMetadata | null>(null);
  const [toolMeta, setToolMeta] = useState<EntityMetadata | null>(null);

  const toolReq = approval.tool_request;

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

  const isPending = approval.status === "PENDING";
  const agentDisplay = agentMeta?.name || truncateId(toolReq?.agent_id, 8);
  const toolDisplay = toolMeta?.name || truncateId(toolReq?.tool_id, 8);

  return (
    <tr
      onClick={() => onSelect(approval)}
      className={`cursor-pointer transition-colors border-b border-gray-800/60 text-xs ${
        isSelected
          ? "bg-indigo-950/30 hover:bg-indigo-950/40"
          : "hover:bg-gray-800/40 bg-gray-950/30"
      }`}
    >
      {/* Created Timestamp */}
      <td className="px-6 py-4 whitespace-nowrap text-gray-400">
        <span title={formatDateTimeUtc(approval.created_at)}>
          {formatRelativeTime(approval.created_at)}
        </span>
      </td>

      {/* Status Badge */}
      <td className="px-6 py-4 whitespace-nowrap">
        <ApprovalStatusBadge status={approval.status} />
      </td>

      {/* Agent Identity */}
      <td className="px-6 py-4 whitespace-nowrap font-medium text-gray-200">
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-indigo-500/50" />
          <span>{agentDisplay}</span>
          {agentMeta?.risk_tier && (
            <span className="text-[10px] px-1.5 py-0.2 rounded bg-gray-800 text-gray-400 border border-gray-700">
              {agentMeta.risk_tier}
            </span>
          )}
        </div>
      </td>

      {/* Tool Identity */}
      <td className="px-6 py-4 whitespace-nowrap text-gray-300 font-mono">
        <div className="flex items-center gap-1.5">
          <svg className="w-3.5 h-3.5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
            />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <span>{toolDisplay}</span>
        </div>
      </td>

      {/* Violation Codes */}
      <td className="px-6 py-4">
        <div className="flex flex-wrap gap-1">
          {toolReq?.violation_codes && toolReq.violation_codes.length > 0 ? (
            toolReq.violation_codes.map((code) => (
              <span
                key={code}
                className="text-[10px] px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20 font-medium"
              >
                {humanizeViolationCode(code)}
              </span>
            ))
          ) : (
            <span className="text-gray-500 text-[10px]">Policy Gated</span>
          )}
        </div>
      </td>

      {/* Review Action Button */}
      <td className="px-6 py-4 whitespace-nowrap text-right">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onSelect(approval);
          }}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            isPending
              ? "bg-indigo-600 hover:bg-indigo-500 text-white shadow-sm shadow-indigo-600/30"
              : "bg-gray-800 hover:bg-gray-700 text-gray-300"
          }`}
        >
          {isPending ? "Review & Decide" : "Inspect"}
        </button>
      </td>
    </tr>
  );
}

