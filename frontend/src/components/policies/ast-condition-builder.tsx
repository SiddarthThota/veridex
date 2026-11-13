/**
 * Visual AST Condition Tree Builder Component (Phase 9.5).
 *
 * Implements deterministic condition authoring with Google RE2 safety boundaries:
 * - Max Depth <= 5
 * - Max Conditions <= 20
 * - Max Regex Length <= 128
 * - Static ReDoS pattern defense
 * - Fallback Raw JSON editor
 */

"use client";

import React, { useMemo, useState } from "react";
import type { ConditionCombinator, ConditionNode, PolicyOperator } from "@/types/policies";
import {
  MAX_AST_DEPTH,
  MAX_CONDITIONS_PER_RULE,
  MAX_REGEX_LEN,
  validateConditionTree,
} from "@/lib/policies/policies-formatters";
import { JsonArgumentEditor } from "@/components/common/json-argument-editor";

const OPERATORS: { value: PolicyOperator; label: string }[] = [
  { value: "EQUALS", label: "==" },
  { value: "NOT_EQUALS", label: "!=" },
  { value: "GREATER_THAN", label: ">" },
  { value: "GREATER_THAN_OR_EQUAL", label: ">=" },
  { value: "LESS_THAN", label: "<" },
  { value: "LESS_THAN_OR_EQUAL", label: "<=" },
  { value: "CONTAINS", label: "Contains" },
  { value: "STARTS_WITH", label: "Starts With" },
  { value: "ENDS_WITH", label: "Ends With" },
  { value: "MATCHES_REGEX", label: "Matches Regex (RE2)" },
  { value: "IN", label: "In List" },
  { value: "NOT_IN", label: "Not In List" },
  { value: "IS_NULL", label: "Is Null" },
  { value: "IS_NOT_NULL", label: "Is Not Null" },
];

const SUGGESTED_FIELDS = [
  "arguments.query",
  "arguments.command",
  "arguments.amount",
  "arguments.recipient",
  "agent.risk_tier",
  "agent.environment",
  "agent.model_provider",
  "tool.slug",
  "tool.risk_level",
  "tool.access_type",
  "tool.data_classification",
  "context.environment",
];

interface AstConditionBuilderProps {
  tree: Record<string, unknown>;
  onChange: (tree: Record<string, unknown>) => void;
  readOnly?: boolean;
}

export function AstConditionBuilder({
  tree,
  onChange,
  readOnly = false,
}: AstConditionBuilderProps) {
  const [mode, setMode] = useState<"visual" | "json">("visual");
  const [jsonText, setJsonText] = useState(JSON.stringify(tree || {}, null, 2));

  // Current AST node representation
  const rootNode: ConditionNode = useMemo(() => {
    if (!tree || Object.keys(tree).length === 0) {
      return {
        combinator: "AND",
        conditions: [],
      };
    }
    return tree as ConditionNode;
  }, [tree]);

  // Real-time AST safety validation
  const validation = useMemo(() => {
    return validateConditionTree(rootNode);
  }, [rootNode]);

  const handleUpdateRoot = (newRoot: ConditionNode) => {
    onChange(newRoot as Record<string, unknown>);
    setJsonText(JSON.stringify(newRoot, null, 2));
  };

  const handleJsonChange = (raw: string) => {
    setJsonText(raw);
    try {
      const parsed = JSON.parse(raw);
      onChange(parsed);
    } catch {
      // Keep invalid JSON in text until fixed
    }
  };

  return (
    <div className="space-y-3">
      {/* Builder Header & Mode Switcher */}
      <div className="flex items-center justify-between pb-2 border-b border-gray-800">
        <div className="flex items-center gap-3">
          <span className="text-xs font-semibold text-gray-200">
            AST Condition Tree
          </span>
          <div className="flex items-center gap-2 text-[11px]">
            <span
              className={`px-2 py-0.5 rounded border ${
                validation.leafCount > MAX_CONDITIONS_PER_RULE
                  ? "bg-rose-500/20 text-rose-300 border-rose-500/40"
                  : "bg-gray-800 text-gray-300 border-gray-700"
              }`}
            >
              Conditions: {validation.leafCount} / {MAX_CONDITIONS_PER_RULE}
            </span>
            <span
              className={`px-2 py-0.5 rounded border ${
                !validation.valid
                  ? "bg-rose-500/20 text-rose-300 border-rose-500/40"
                  : "bg-gray-800 text-gray-300 border-gray-700"
              }`}
            >
              Max Depth: {MAX_AST_DEPTH}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1 p-0.5 bg-gray-900 rounded-lg border border-gray-800">
          <button
            type="button"
            onClick={() => setMode("visual")}
            className={`px-2.5 py-1 text-[11px] rounded font-medium transition-colors ${
              mode === "visual"
                ? "bg-gray-800 text-white shadow-sm"
                : "text-gray-400 hover:text-gray-200"
            }`}
          >
            Visual Builder
          </button>
          <button
            type="button"
            onClick={() => setMode("json")}
            className={`px-2.5 py-1 text-[11px] rounded font-medium transition-colors ${
              mode === "json"
                ? "bg-gray-800 text-white shadow-sm"
                : "text-gray-400 hover:text-gray-200"
            }`}
          >
            Raw JSON
          </button>
        </div>
      </div>

      {/* Advisory Validation Warning */}
      {!validation.valid && (
        <div className="p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
          <span className="font-bold">AST Error:</span>
          <span>{validation.error}</span>
        </div>
      )}

      {mode === "json" ? (
        <JsonArgumentEditor
          value={jsonText}
          onChange={handleJsonChange}
          readOnly={readOnly}
          label="Raw Condition Tree JSON"
          minHeight="min-h-[220px]"
        />
      ) : (
        <div className="p-3 rounded-xl bg-gray-950/60 border border-gray-800/80 space-y-3">
          <NodeRenderer
            node={rootNode}
            depth={1}
            readOnly={readOnly}
            onUpdate={(updated) => handleUpdateRoot(updated)}
            onDelete={() => handleUpdateRoot({ combinator: "AND", conditions: [] })}
          />
        </div>
      )}
    </div>
  );
}

interface NodeRendererProps {
  node: ConditionNode;
  depth: number;
  readOnly: boolean;
  onUpdate: (node: ConditionNode) => void;
  onDelete: () => void;
}

function NodeRenderer({ node, depth, readOnly, onUpdate, onDelete }: NodeRendererProps) {
  // Branch A: Combinator Node
  if (node.combinator || (!node.field && !node.operator)) {
    const combinator: ConditionCombinator = node.combinator || "AND";
    const conditions = node.conditions || [];

    const handleCombinatorChange = (newComb: ConditionCombinator) => {
      onUpdate({
        ...node,
        combinator: newComb,
        conditions: newComb === "NOT" ? conditions.slice(0, 1) : conditions,
      });
    };

    const handleAddLeaf = () => {
      const newConditions: ConditionNode[] = [
        ...conditions,
        {
          field: "arguments.query",
          operator: "EQUALS",
          value: "",
        },
      ];
      onUpdate({ ...node, combinator, conditions: newConditions });
    };

    const handleAddGroup = () => {
      if (depth >= MAX_AST_DEPTH) return;
      const newConditions: ConditionNode[] = [
        ...conditions,
        {
          combinator: "OR",
          conditions: [
            {
              field: "agent.risk_tier",
              operator: "EQUALS",
              value: "TIER_4_CRITICAL",
            },
          ],
        },
      ];
      onUpdate({ ...node, combinator, conditions: newConditions });
    };

    const handleChildUpdate = (index: number, updatedChild: ConditionNode) => {
      const copy = [...conditions];
      copy[index] = updatedChild;
      onUpdate({ ...node, combinator, conditions: copy });
    };

    const handleChildDelete = (index: number) => {
      const copy = conditions.filter((_, i) => i !== index);
      onUpdate({ ...node, combinator, conditions: copy });
    };

    return (
      <div
        className={`p-3 rounded-lg border space-y-3 transition-colors ${
          combinator === "AND"
            ? "bg-indigo-950/20 border-indigo-800/40"
            : combinator === "OR"
            ? "bg-amber-950/20 border-amber-800/40"
            : "bg-rose-950/20 border-rose-800/40"
        }`}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold text-gray-400">Match Logic:</span>
            {!readOnly ? (
              <select
                value={combinator}
                onChange={(e) => handleCombinatorChange(e.target.value as ConditionCombinator)}
                className="bg-gray-900 border border-gray-700 text-gray-200 text-xs rounded px-2 py-1 font-mono focus:border-indigo-500 focus:outline-none"
              >
                <option value="AND">AND (All must match)</option>
                <option value="OR">OR (Any may match)</option>
                <option value="NOT">NOT (Invert single condition)</option>
              </select>
            ) : (
              <span className="font-mono text-xs font-bold text-indigo-400">{combinator}</span>
            )}
            <span className="text-[10px] text-gray-500 font-mono">Depth {depth}/{MAX_AST_DEPTH}</span>
          </div>

          {!readOnly && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleAddLeaf}
                className="text-[11px] px-2 py-0.5 rounded bg-gray-800 hover:bg-gray-700 text-emerald-400 border border-gray-700"
              >
                + Add Condition
              </button>
              {depth < MAX_AST_DEPTH && (
                <button
                  type="button"
                  onClick={handleAddGroup}
                  className="text-[11px] px-2 py-0.5 rounded bg-gray-800 hover:bg-gray-700 text-indigo-300 border border-gray-700"
                >
                  + Add Group
                </button>
              )}
              {depth > 1 && (
                <button
                  type="button"
                  onClick={onDelete}
                  className="text-[11px] px-2 py-0.5 rounded bg-rose-950/40 hover:bg-rose-900/60 text-rose-400 border border-rose-800/40"
                >
                  Remove Group
                </button>
              )}
            </div>
          )}
        </div>

        {conditions.length === 0 ? (
          <div className="py-4 text-center text-xs text-gray-500 border border-dashed border-gray-800 rounded">
            No sub-conditions added. Click &quot;+ Add Condition&quot; above to create rules.
          </div>
        ) : (
          <div className="space-y-2 pl-2 border-l-2 border-gray-800">
            {conditions.map((child, idx) => (
              <NodeRenderer
                key={idx}
                node={child}
                depth={depth + 1}
                readOnly={readOnly}
                onUpdate={(up) => handleChildUpdate(idx, up)}
                onDelete={() => handleChildDelete(idx)}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  // Branch B: Leaf Condition Node
  const field = node.field || "";
  const operator = node.operator || "EQUALS";
  const value = node.value !== undefined ? String(node.value) : "";

  const handleFieldChange = (newField: string) => {
    onUpdate({ ...node, field: newField });
  };

  const handleOperatorChange = (newOp: PolicyOperator) => {
    onUpdate({ ...node, operator: newOp });
  };

  const handleValueChange = (newVal: string) => {
    // If operator is numeric, try parsing as number
    if (["GREATER_THAN", "GREATER_THAN_OR_EQUAL", "LESS_THAN", "LESS_THAN_OR_EQUAL"].includes(operator)) {
      const num = Number(newVal);
      onUpdate({ ...node, value: isNaN(num) ? newVal : num });
    } else if (["IN", "NOT_IN"].includes(operator)) {
      const items = newVal.split(",").map((s) => s.trim()).filter(Boolean);
      onUpdate({ ...node, value: items });
    } else {
      onUpdate({ ...node, value: newVal });
    }
  };

  const isNullOp = operator === "IS_NULL" || operator === "IS_NOT_NULL";
  const isRegex = operator === "MATCHES_REGEX";

  return (
    <div className="flex flex-wrap items-center gap-2 p-2 rounded-lg bg-gray-900/80 border border-gray-800 text-xs">
      {/* Field Input with Autocomplete */}
      <div className="flex-1 min-w-[140px]">
        {!readOnly ? (
          <input
            type="text"
            list="suggested-ast-fields"
            value={field}
            onChange={(e) => handleFieldChange(e.target.value)}
            placeholder="Field path (e.g. arguments.amount)"
            className="w-full bg-gray-950 border border-gray-700 text-gray-200 px-2 py-1 rounded font-mono text-xs focus:border-indigo-500 focus:outline-none"
          />
        ) : (
          <span className="font-mono text-gray-300 font-semibold">{field}</span>
        )}
        <datalist id="suggested-ast-fields">
          {SUGGESTED_FIELDS.map((f) => (
            <option key={f} value={f} />
          ))}
        </datalist>
      </div>

      {/* Operator Dropdown */}
      <div className="w-[150px]">
        {!readOnly ? (
          <select
            value={operator}
            onChange={(e) => handleOperatorChange(e.target.value as PolicyOperator)}
            className="w-full bg-gray-950 border border-gray-700 text-gray-200 px-2 py-1 rounded text-xs focus:border-indigo-500 focus:outline-none"
          >
            {OPERATORS.map((op) => (
              <option key={op.value} value={op.value}>
                {op.label}
              </option>
            ))}
          </select>
        ) : (
          <span className="px-2 py-0.5 rounded bg-gray-800 text-gray-300 font-mono text-[11px]">
            {operator}
          </span>
        )}
      </div>

      {/* Value Input */}
      {!isNullOp && (
        <div className="flex-1 min-w-[140px]">
          {!readOnly ? (
            <input
              type="text"
              value={Array.isArray(node.value) ? node.value.join(", ") : value}
              onChange={(e) => handleValueChange(e.target.value)}
              placeholder={isRegex ? "Pattern e.g. ^prod-" : "Expected value"}
              maxLength={isRegex ? MAX_REGEX_LEN : undefined}
              className={`w-full bg-gray-950 border text-gray-200 px-2 py-1 rounded font-mono text-xs focus:outline-none ${
                isRegex && value.length > MAX_REGEX_LEN
                  ? "border-rose-500 focus:border-rose-500"
                  : "border-gray-700 focus:border-indigo-500"
              }`}
            />
          ) : (
            <span className="font-mono text-emerald-400">
              {Array.isArray(node.value) ? JSON.stringify(node.value) : `"${value}"`}
            </span>
          )}
        </div>
      )}

      {!readOnly && (
        <button
          type="button"
          onClick={onDelete}
          className="text-gray-500 hover:text-rose-400 p-1 rounded hover:bg-gray-800 transition-colors"
          title="Delete condition"
        >
          ✕
        </button>
      )}
    </div>
  );
}

