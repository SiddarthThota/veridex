/**
 * Secure Arguments Viewer with Recursive Sensitive Data Masking (Phase 9.4).
 *
 * Requirements:
 * - Mask by default for every role.
 * - Reveal only for ADMIN and SECURITY_ANALYST.
 * - Do not log sensitive values or send to telemetry.
 * - Do not copy revealed sensitive values to clipboard by default (copies masked).
 * - Render JSON safely; never interpret argument strings as HTML.
 */

import React, { useState } from "react";
import { useAuth } from "@/components/auth/auth-context";
import { maskSensitiveArguments } from "@/lib/approvals/approvals-formatters";

interface ApprovalArgumentsViewerProps {
  argumentsPayload: Record<string, unknown> | null | undefined;
  argumentsHash?: string;
}

export function ApprovalArgumentsViewer({
  argumentsPayload,
  argumentsHash,
}: ApprovalArgumentsViewerProps) {
  const { user } = useAuth();
  const [reveal, setReveal] = useState(false);
  const [copied, setCopied] = useState(false);

  const canReveal = user?.role === "ADMIN" || user?.role === "SECURITY_ANALYST";
  const safeData = argumentsPayload || {};

  // Formatted display data (masked if reveal is false)
  const displayData = maskSensitiveArguments(safeData, canReveal && reveal);
  const formattedJson = JSON.stringify(displayData, null, 2);

  const handleCopy = async () => {
    try {
      // Security condition: Copy masked arguments to clipboard by default
      const maskedCopyData = maskSensitiveArguments(safeData, false);
      await navigator.clipboard.writeText(JSON.stringify(maskedCopyData, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-gray-200">Evaluated Arguments</span>
          {argumentsHash && (
            <span
              className="text-[10px] text-gray-500 font-mono"
              title={`Arguments SHA-256 Hash: ${argumentsHash}`}
            >
              Hash: {argumentsHash.slice(0, 10)}…
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Reveal Toggle (Restricted to ADMIN & SECURITY_ANALYST) */}
          {canReveal ? (
            <button
              type="button"
              onClick={() => setReveal((prev) => !prev)}
              aria-label={reveal ? "Mask sensitive arguments" : "Reveal sensitive arguments"}
              className={`px-2 py-1 rounded text-[11px] font-medium border transition-colors flex items-center gap-1 ${
                reveal
                  ? "bg-amber-500/15 text-amber-300 border-amber-500/30 hover:bg-amber-500/25"
                  : "bg-gray-800 text-gray-300 border-gray-700 hover:bg-gray-700"
              }`}
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                {reveal ? (
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18"
                  />
                ) : (
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                  />
                )}
              </svg>
              <span>{reveal ? "Mask Secrets" : "Reveal Secrets"}</span>
            </button>
          ) : (
            <span
              className="text-[10px] text-gray-500 italic px-2 py-0.5 rounded bg-gray-900 border border-gray-800"
              title="Only ADMIN and SECURITY_ANALYST roles may unmask sensitive arguments"
            >
              Secrets Masked
            </span>
          )}

          {/* Safe Masked Clipboard Copy */}
          <button
            type="button"
            onClick={handleCopy}
            title="Copies masked arguments JSON to clipboard"
            className="px-2 py-1 rounded text-[11px] font-medium bg-gray-800 text-gray-300 border border-gray-700 hover:bg-gray-700 transition-colors flex items-center gap-1"
          >
            {copied ? (
              <>
                <svg className="w-3 h-3 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-emerald-400">Copied</span>
              </>
            ) : (
              <>
                <svg className="w-3 h-3 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3"
                  />
                </svg>
                <span>Copy JSON</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* JSON Display Area — Safe Plain Text Rendering */}
      <div className="relative rounded-xl bg-gray-950 border border-gray-800/90 p-3.5 overflow-x-auto max-h-64 font-mono text-xs">
        {reveal && canReveal && (
          <div className="mb-2 px-2 py-1 rounded bg-amber-500/10 border border-amber-500/20 text-amber-300 text-[10px] flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
            <span>Sensitive argument secrets are currently unmasked. Do not share screen or expose values.</span>
          </div>
        )}
        <pre className="text-gray-300 leading-relaxed whitespace-pre-wrap break-all">
          <code>{formattedJson}</code>
        </pre>
      </div>
    </div>
  );
}

