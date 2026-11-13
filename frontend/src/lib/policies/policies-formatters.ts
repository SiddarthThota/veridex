/**
 * Formatting and Validation Helpers for VERIDEX Policy Engine (Phase 9.5).
 */

import type {
  ConditionNode,
  PolicyAction,
  PolicyStatus,
  PolicyType,
  PolicyVersionResponse,
  VersionRuleDiff,
} from "@/types/policies";

export const MAX_AST_DEPTH = 5;
export const MAX_CONDITIONS_PER_RULE = 20;
export const MAX_REGEX_LEN = 128;

// Advisory client-side ReDoS vulnerability indicators matching backend defense-in-depth
const REDOS_SUSPECT_PATTERNS = [
  /\([^)]*[\+\*][^)]*\)[\+\*\{]/, // (a+)+, (a*)*
  /\([^)]*\|[^)]*\)[\+\*\{]/,     // (a|b)+, (foo|bar)*
  /(\.\*){2,}/,                   // Consecutive .*.*
  /(\.\+){2,}/,                   // Consecutive .+.+
  /[\+\*]{2,}/,                   // Duplicate ++, **
  /[\+\*]\{/,                     // Quantifier with range +{2,}
];

export function getPolicyStatusStyle(status: PolicyStatus) {
  switch (status) {
    case "ACTIVE":
      return {
        bg: "bg-emerald-500/10",
        text: "text-emerald-400",
        border: "border-emerald-500/20",
        dot: "bg-emerald-400",
        label: "Active",
      };
    case "DRAFT":
      return {
        bg: "bg-amber-500/10",
        text: "text-amber-400",
        border: "border-amber-500/20",
        dot: "bg-amber-400",
        label: "Draft",
      };
    case "INACTIVE":
      return {
        bg: "bg-gray-500/10",
        text: "text-gray-400",
        border: "border-gray-500/20",
        dot: "bg-gray-400",
        label: "Inactive",
      };
    case "ARCHIVED":
      return {
        bg: "bg-rose-500/10",
        text: "text-rose-400",
        border: "border-rose-500/20",
        dot: "bg-rose-400",
        label: "Archived",
      };
  }
}

export function getPolicyTypeStyle(type: PolicyType) {
  switch (type) {
    case "SECURITY":
      return {
        badge: "bg-rose-950/40 text-rose-300 border-rose-800/40",
        label: "Security",
      };
    case "OPERATIONAL":
      return {
        badge: "bg-sky-950/40 text-sky-300 border-sky-800/40",
        label: "Operational",
      };
    case "COMPLIANCE":
      return {
        badge: "bg-purple-950/40 text-purple-300 border-purple-800/40",
        label: "Compliance",
      };
    case "FINANCIAL":
      return {
        badge: "bg-emerald-950/40 text-emerald-300 border-emerald-800/40",
        label: "Financial",
      };
  }
}

export function getActionStyle(action: PolicyAction) {
  switch (action) {
    case "ALLOW":
      return {
        badge: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
        label: "ALLOW",
      };
    case "DENY":
      return {
        badge: "bg-rose-500/15 text-rose-400 border-rose-500/30",
        label: "DENY",
      };
    case "REQUIRE_APPROVAL":
      return {
        badge: "bg-amber-500/15 text-amber-400 border-amber-500/30",
        label: "REQUIRE APPROVAL",
      };
  }
}

export function formatPriority(priority: number): { label: string; tone: string } {
  if (priority <= 10) return { label: `P${priority} (Critical)`, tone: "text-rose-400 font-bold" };
  if (priority <= 50) return { label: `P${priority} (High)`, tone: "text-amber-400 font-semibold" };
  if (priority <= 100) return { label: `P${priority} (Standard)`, tone: "text-indigo-400" };
  return { label: `P${priority} (Low)`, tone: "text-gray-400" };
}

/**
 * Validates a condition node AST against documented safety limits.
 */
export function validateConditionTree(
  node: ConditionNode,
  depth = 1,
  leafCounter = { count: 0 }
): { valid: boolean; error?: string; leafCount: number } {
  if (depth > MAX_AST_DEPTH) {
    return {
      valid: false,
      error: `AST depth exceeded maximum limit of ${MAX_AST_DEPTH} levels.`,
      leafCount: leafCounter.count,
    };
  }

  if (node.combinator) {
    const sub = node.conditions || [];
    if (node.combinator === "NOT" && sub.length !== 1) {
      return {
        valid: false,
        error: "NOT combinator requires exactly one subcondition.",
        leafCount: leafCounter.count,
      };
    }
    for (const child of sub) {
      const result = validateConditionTree(child, depth + 1, leafCounter);
      if (!result.valid) return result;
    }
    return { valid: true, leafCount: leafCounter.count };
  }

  if (node.field) {
    leafCounter.count += 1;
    if (leafCounter.count > MAX_CONDITIONS_PER_RULE) {
      return {
        valid: false,
        error: `Exceeded maximum of ${MAX_CONDITIONS_PER_RULE} leaf conditions per rule.`,
        leafCount: leafCounter.count,
      };
    }

    if (!node.operator) {
      return {
        valid: false,
        error: `Missing operator for field '${node.field}'.`,
        leafCount: leafCounter.count,
      };
    }

    if (node.operator === "MATCHES_REGEX") {
      const pattern = String(node.value || "");
      if (pattern.length > MAX_REGEX_LEN) {
        return {
          valid: false,
          error: `Regex pattern length (${pattern.length}) exceeds maximum ${MAX_REGEX_LEN} chars.`,
          leafCount: leafCounter.count,
        };
      }
      for (const suspect of REDOS_SUSPECT_PATTERNS) {
        if (suspect.test(pattern)) {
          return {
            valid: false,
            error: `Advisory: Regex pattern contains potentially unsafe construct ('${pattern}'). Backend Google RE2 engine remains authoritative.`,
            leafCount: leafCounter.count,
          };
        }
      }
    }

    return { valid: true, leafCount: leafCounter.count };
  }

  return { valid: true, leafCount: leafCounter.count };
}

/**
 * Computes a client-side structural comparison between two PolicyVersion records.
 */
export function computeVersionDiff(
  vA: PolicyVersionResponse,
  vB: PolicyVersionResponse
): VersionRuleDiff[] {
  const diffs: VersionRuleDiff[] = [];
  const rulesA = new Map(vA.rules.map((r) => [r.rule_name, r]));
  const rulesB = new Map(vB.rules.map((r) => [r.rule_name, r]));

  // Check rules in B against A
  for (const [name, ruleB] of rulesB.entries()) {
    const ruleA = rulesA.get(name);
    if (!ruleA) {
      diffs.push({
        type: "ADDED",
        ruleName: name,
        details: `Rule added in v${vB.version_number} (Action: ${ruleB.action})`,
        vB: ruleB,
      });
    } else {
      const aJson = JSON.stringify({
        action: ruleA.action,
        order: ruleA.rule_order,
        tree: ruleA.condition_tree,
        scope: ruleA.target_scope,
        code: ruleA.violation_code,
      });
      const bJson = JSON.stringify({
        action: ruleB.action,
        order: ruleB.rule_order,
        tree: ruleB.condition_tree,
        scope: ruleB.target_scope,
        code: ruleB.violation_code,
      });

      if (aJson !== bJson) {
        const changes: string[] = [];
        if (ruleA.action !== ruleB.action) changes.push(`Action ${ruleA.action} → ${ruleB.action}`);
        if (ruleA.rule_order !== ruleB.rule_order) changes.push(`Order #${ruleA.rule_order} → #${ruleB.rule_order}`);
        if (ruleA.violation_code !== ruleB.violation_code) changes.push(`Code ${ruleA.violation_code} → ${ruleB.violation_code}`);
        if (JSON.stringify(ruleA.condition_tree) !== JSON.stringify(ruleB.condition_tree)) changes.push("Conditions modified");

        diffs.push({
          type: "MODIFIED",
          ruleName: name,
          details: changes.join(", ") || "Configuration modified",
          vA: ruleA,
          vB: ruleB,
        });
      } else {
        diffs.push({
          type: "UNCHANGED",
          ruleName: name,
          details: "Identical across versions",
          vA: ruleA,
          vB: ruleB,
        });
      }
    }
  }

  // Check rules in A that were removed in B
  for (const [name, ruleA] of rulesA.entries()) {
    if (!rulesB.has(name)) {
      diffs.push({
        type: "REMOVED",
        ruleName: name,
        details: `Rule removed from v${vB.version_number} (was Action: ${ruleA.action})`,
        vA: ruleA,
      });
    }
  }

  return diffs;
}

