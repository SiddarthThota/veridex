/**
 * Native Zero-Dependency JSON Argument Editor Component (Phase 9.5).
 *
 * Implements syntax validation with line/column error extraction, formatting,
 * schema template pre-population, and dark-mode terminal aesthetics without Monaco.
 */

"use client";

import React, { useId, useMemo, useState } from "react";

interface JsonArgumentEditorProps {
  value: string;
  onChange: (value: string) => void;
  readOnly?: boolean;
  minHeight?: string;
  inputSchema?: Record<string, unknown> | null;
  label?: string;
  placeholder?: string;
}

export function JsonArgumentEditor({
  value,
  onChange,
  readOnly = false,
  minHeight = "min-h-[160px]",
  inputSchema,
  label = "Invocation Arguments (JSON)",
  placeholder = "{\n  \"key\": \"value\"\n}",
}: JsonArgumentEditorProps) {
  const textareaId = useId();
  const [copied, setCopied] = useState(false);

  // Parse and extract syntax error with line & column info
  const syntaxCheck = useMemo(() => {
    if (!value.trim()) {
      return { valid: true, error: null, line: null, column: null };
    }
    try {
      JSON.parse(value);
      return { valid: true, error: null, line: null, column: null };
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Invalid JSON";
      // Extract line and column from error message like: "at position 23 (line 2 column 5)"
      const lineMatch = msg.match(/line (\d+)/i);
      const colMatch = msg.match(/column (\d+)/i);
      return {
        valid: false,
        error: msg,
        line: lineMatch ? parseInt(lineMatch[1], 10) : null,
        column: colMatch ? parseInt(colMatch[1], 10) : null,
      };
    }
  }, [value]);

  const handleFormat = () => {
    if (!value.trim()) return;
    try {
      const parsed = JSON.parse(value);
      onChange(JSON.stringify(parsed, null, 2));
    } catch {
      // Cannot format invalid JSON
    }
  };

  const handleLoadTemplate = () => {
    if (!inputSchema) return;
    // Build default arguments from schema properties
    const template: Record<string, unknown> = {};
    const props = (inputSchema.properties || {}) as Record<string, { type?: string; default?: unknown }>;
    for (const [k, v] of Object.entries(props)) {
      if (v.default !== undefined) {
        template[k] = v.default;
      } else if (v.type === "string") {
        template[k] = "";
      } else if (v.type === "number" || v.type === "integer") {
        template[k] = 0;
      } else if (v.type === "boolean") {
        template[k] = false;
      } else if (v.type === "array") {
        template[k] = [];
      } else {
        template[k] = null;
      }
    }
    onChange(JSON.stringify(template, null, 2));
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label htmlFor={textareaId} className="text-xs font-semibold text-gray-300">
          {label}
        </label>
        <div className="flex items-center gap-2">
          {inputSchema && !readOnly && (
            <button
              type="button"
              onClick={handleLoadTemplate}
              className="text-[11px] px-2 py-0.5 rounded bg-gray-800 hover:bg-gray-700 text-indigo-300 hover:text-indigo-200 transition-colors border border-gray-700"
              title="Populate template arguments from tool's input schema"
            >
              Load Template
            </button>
          )}
          {!readOnly && (
            <button
              type="button"
              onClick={handleFormat}
              disabled={!syntaxCheck.valid || !value.trim()}
              className="text-[11px] px-2 py-0.5 rounded bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white transition-colors border border-gray-700 disabled:opacity-40 disabled:cursor-not-allowed"
              title="Prettify JSON with 2-space indentation"
            >
              Format JSON
            </button>
          )}
          <button
            type="button"
            onClick={handleCopy}
            className="text-[11px] px-2 py-0.5 rounded bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white transition-colors border border-gray-700"
          >
            {copied ? "Copied!" : "Copy"}
          </button>
        </div>
      </div>

      <div className="relative rounded-lg border border-gray-800 bg-gray-950/90 focus-within:border-indigo-500/80 transition-colors">
        <textarea
          id={textareaId}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          readOnly={readOnly}
          placeholder={placeholder}
          spellCheck={false}
          className={`w-full ${minHeight} bg-transparent p-3 font-mono text-xs text-emerald-400 placeholder:text-gray-600 focus:outline-none resize-y leading-relaxed`}
        />

        {/* Syntax validation status footer */}
        <div className="flex items-center justify-between px-3 py-1.5 border-t border-gray-900 bg-gray-950/80 text-[11px]">
          {syntaxCheck.valid ? (
            <div className="flex items-center gap-1.5 text-emerald-400">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              <span>Valid JSON</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-rose-400">
              <span className="w-1.5 h-1.5 rounded-full bg-rose-400 animate-pulse" />
              <span>
                Syntax Error
                {syntaxCheck.line ? ` (Line ${syntaxCheck.line}${syntaxCheck.column ? `, Col ${syntaxCheck.column}` : ""})` : ""}:{" "}
                <span className="font-mono text-rose-300">{syntaxCheck.error}</span>
              </span>
            </div>
          )}
          <span className="text-gray-500 text-[10px]">
            {value.length} chars
          </span>
        </div>
      </div>
    </div>
  );
}

