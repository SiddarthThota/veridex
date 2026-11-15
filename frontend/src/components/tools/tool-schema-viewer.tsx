"use client";

import React, { useState } from "react";

interface ToolSchemaViewerProps {
  inputSchema?: Record<string, unknown> | null;
  outputSchema?: Record<string, unknown> | null;
}

export function ToolSchemaViewer({ inputSchema, outputSchema }: ToolSchemaViewerProps) {
  const [activeSchemaTab, setActiveSchemaTab] = useState<"input" | "output">("input");
  const [copied, setCopied] = useState(false);

  const currentSchema = activeSchemaTab === "input" ? inputSchema : outputSchema;
  const jsonString = currentSchema ? JSON.stringify(currentSchema, null, 2) : "";

  function handleCopy() {
    if (!jsonString) return;
    navigator.clipboard.writeText(jsonString);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-950/80 overflow-hidden">
      {/* Schema Tab Switcher & Copy */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-800 bg-gray-950">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveSchemaTab("input")}
            className={`py-1 px-2.5 rounded-lg text-xs font-medium transition-colors ${
              activeSchemaTab === "input"
                ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                : "text-gray-400 hover:text-gray-200"
            }`}
          >
            Input Schema
          </button>
          <button
            type="button"
            onClick={() => setActiveSchemaTab("output")}
            className={`py-1 px-2.5 rounded-lg text-xs font-medium transition-colors ${
              activeSchemaTab === "output"
                ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                : "text-gray-400 hover:text-gray-200"
            }`}
          >
            Output Schema
          </button>
        </div>

        {jsonString && (
          <button
            type="button"
            onClick={handleCopy}
            className="text-[11px] text-gray-400 hover:text-white px-2 py-1 rounded bg-gray-900 border border-gray-800 transition-colors"
          >
            {copied ? "Copied!" : "Copy Schema"}
          </button>
        )}
      </div>

      {/* Schema Content */}
      <div className="p-4">
        {jsonString ? (
          <pre className="font-mono text-xs text-gray-300 overflow-x-auto max-h-96 leading-relaxed">
            <code>{jsonString}</code>
          </pre>
        ) : (
          <div className="p-8 text-center text-xs text-gray-500">
            No {activeSchemaTab} JSON schema defined for this version.
          </div>
        )}
      </div>
    </div>
  );
}
