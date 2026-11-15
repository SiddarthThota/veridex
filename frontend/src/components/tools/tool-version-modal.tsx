"use client";

import React, { useState } from "react";
import type { ToolResponse, ToolVersionCreate } from "@/types/tools";

interface ToolVersionModalProps {
  isOpen: boolean;
  tool: ToolResponse;
  onClose: () => void;
  onSubmit: (payload: ToolVersionCreate) => Promise<unknown>;
}

export function ToolVersionModal({
  isOpen,
  tool,
  onClose,
  onSubmit,
}: ToolVersionModalProps) {
  const [versionString, setVersionString] = useState("");
  const [description, setDescription] = useState("");
  const [inputSchemaJson, setInputSchemaJson] = useState(
    JSON.stringify(
      {
        type: "object",
        properties: {},
        required: [],
      },
      null,
      2
    )
  );
  const [outputSchemaJson, setOutputSchemaJson] = useState(
    JSON.stringify(
      {
        type: "object",
        properties: {},
      },
      null,
      2
    )
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    if (!versionString.trim()) {
      setError("Version identifier is required (e.g., 0.2.0).");
      setIsSubmitting(false);
      return;
    }

    let parsedInput: Record<string, unknown> | null = null;
    let parsedOutput: Record<string, unknown> | null = null;

    if (inputSchemaJson.trim()) {
      try {
        parsedInput = JSON.parse(inputSchemaJson);
      } catch {
        setError("Input schema must be valid JSON.");
        setIsSubmitting(false);
        return;
      }
    }

    if (outputSchemaJson.trim()) {
      try {
        parsedOutput = JSON.parse(outputSchemaJson);
      } catch {
        setError("Output schema must be valid JSON.");
        setIsSubmitting(false);
        return;
      }
    }

    try {
      await onSubmit({
        version: versionString.trim(),
        description: description.trim() || null,
        input_schema: parsedInput,
        output_schema: parsedOutput,
      });
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to author tool version";
      setError(msg);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="relative w-full max-w-2xl rounded-2xl bg-gray-900 border border-gray-800 shadow-2xl p-6 overflow-hidden max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between pb-4 border-b border-gray-800 flex-shrink-0">
          <div>
            <h3 className="text-base font-semibold text-white">Author Tool Version</h3>
            <p className="text-xs text-gray-400 mt-0.5">
              Tool: <span className="font-medium text-amber-400">{tool.name}</span>
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
          <div className="mt-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-400 flex-shrink-0">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-4 space-y-4 overflow-y-auto pr-1 flex-1">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-300 mb-1">
                Version Identifier <span className="text-rose-400">*</span>
              </label>
              <input
                type="text"
                required
                value={versionString}
                onChange={(e) => setVersionString(e.target.value)}
                placeholder="e.g. 0.2.0 or 1.0.0"
                className="w-full px-3 py-2 rounded-xl bg-gray-950 border border-gray-800 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-amber-500 font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-300 mb-1">Version Description</label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="e.g. Added strict SQL query validation"
                className="w-full px-3 py-2 rounded-xl bg-gray-950 border border-gray-800 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-300 mb-1">
              Input JSON Schema (Draft-07 specification)
            </label>
            <textarea
              rows={6}
              value={inputSchemaJson}
              onChange={(e) => setInputSchemaJson(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-gray-950 border border-gray-800 text-xs text-amber-300 placeholder-gray-600 focus:outline-none focus:border-amber-500 font-mono"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-300 mb-1">
              Output JSON Schema (Draft-07 specification)
            </label>
            <textarea
              rows={6}
              value={outputSchemaJson}
              onChange={(e) => setOutputSchemaJson(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-gray-950 border border-gray-800 text-xs text-amber-300 placeholder-gray-600 focus:outline-none focus:border-amber-500 font-mono"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-800 flex-shrink-0">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="py-2 px-4 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="py-2 px-4 rounded-xl bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white text-xs font-medium transition-colors shadow-sm shadow-amber-600/20"
            >
              {isSubmitting ? "Authoring..." : "Create Draft Version"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
