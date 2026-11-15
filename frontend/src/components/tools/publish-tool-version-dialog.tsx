"use client";

import React, { useState } from "react";
import type { ToolResponse, ToolVersionResponse } from "@/types/tools";

interface PublishToolVersionDialogProps {
  isOpen: boolean;
  tool: ToolResponse;
  version: ToolVersionResponse;
  onClose: () => void;
  onConfirmPublish: () => Promise<unknown>;
}

export function PublishToolVersionDialog({
  isOpen,
  tool,
  version,
  onClose,
  onConfirmPublish,
}: PublishToolVersionDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  async function handlePublish() {
    setIsSubmitting(true);
    setError(null);
    try {
      await onConfirmPublish();
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to publish tool version";
      setError(msg);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="relative w-full max-w-md rounded-2xl bg-gray-900 border border-gray-800 shadow-2xl p-6 overflow-hidden">
        <div className="flex items-center justify-between pb-4 border-b border-gray-800">
          <div>
            <h3 className="text-base font-semibold text-white">Publish Tool Version</h3>
            <p className="text-xs text-gray-400 mt-0.5">
              Promote version <span className="font-mono text-amber-400">{version.version}</span> to PUBLISHED
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors p-1"
          >
            ✕
          </button>
        </div>

        {error && (
          <div className="mt-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-400">
            {error}
          </div>
        )}

        <div className="mt-4 space-y-3">
          <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300 leading-relaxed">
            <span className="font-bold">Immutability Notice:</span> Once published, this tool version and its
            input/output JSON schemas become strictly immutable. Agents and governance policies binding to version{" "}
            <code className="font-mono px-1 py-0.5 rounded bg-amber-900/40 text-amber-200">{version.version}</code>{" "}
            will execute against these exact schemas.
          </div>

          <div className="text-xs text-gray-400 space-y-1 p-3 rounded-xl bg-gray-950 border border-gray-800">
            <div>
              Tool: <span className="text-white font-medium">{tool.name}</span>
            </div>
            <div>
              Slug: <span className="font-mono text-gray-300">{tool.slug}</span>
            </div>
            <div>
              Current Status: <span className="font-mono text-gray-300">{version.status}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 pt-5 border-t border-gray-800 mt-5">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="py-2 px-4 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs font-medium transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handlePublish}
            disabled={isSubmitting}
            className="py-2 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-medium transition-colors shadow-sm shadow-emerald-600/20"
          >
            {isSubmitting ? "Publishing..." : "Confirm Publication"}
          </button>
        </div>
      </div>
    </div>
  );
}
