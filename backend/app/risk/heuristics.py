"""Path-scoped argument heuristics for Veridex Risk Engine (Phase 7).

Evaluates structured argument payloads against explicit inspection paths with
deterministic rules, strict payload bounds, and nesting depth limits.
Zero unrestricted substring scanning and zero dynamic code execution.
"""

import json
from typing import Any

import re2

MAX_PAYLOAD_SIZE = 64 * 1024  # 64 KB
MAX_NESTING_DEPTH = 5

# Safe linear-time RE2 pattern for full-wildcard scope matching: *, all, %, /
WILDCARD_SCOPE_PATTERN = re2.compile(r"(?i)^(\*|all|%|/)$")

DEFAULT_HEURISTIC_RULES: list[dict[str, Any]] = [
    {
        "rule_id": "DESTRUCTIVE_COMMAND",
        "target_paths": ["action", "command", "arguments.action", "arguments.command"],
        "match_type": "IN",
        "match_values": ["drop", "truncate", "delete", "format", "destroy", "purge"],
        "severity": "CRITICAL",
        "score_contribution": 60.0,
    },
    {
        "rule_id": "HIGH_FINANCIAL_VALUE",
        "target_paths": ["amount", "value", "arguments.amount", "arguments.value"],
        "match_type": "GREATER_THAN",
        "threshold": 10000.0,
        "severity": "HIGH",
        "score_contribution": 40.0,
    },
    {
        "rule_id": "OVERRIDE_FLAG_SET",
        "target_paths": ["force", "override", "arguments.force", "arguments.override"],
        "match_type": "EQUALS_TRUE",
        "severity": "HIGH",
        "score_contribution": 35.0,
    },
    {
        "rule_id": "CASCADE_DELETION",
        "target_paths": ["cascade", "arguments.cascade"],
        "match_type": "EQUALS_TRUE",
        "severity": "CRITICAL",
        "score_contribution": 50.0,
    },
    {
        "rule_id": "WILDCARD_SCOPE",
        "target_paths": ["query", "target", "arguments.query", "arguments.target"],
        "match_type": "WILDCARD_PATTERN",
        "severity": "HIGH",
        "score_contribution": 30.0,
    },
]


def get_nesting_depth(obj: Any, current_depth: int = 1) -> int:
    """Calculate the maximum nesting depth of dictionary/list containers."""
    if not isinstance(obj, (dict, list)):
        return current_depth - 1
    if isinstance(obj, dict):
        if not obj:
            return current_depth
        return max(get_nesting_depth(v, current_depth + 1) for v in obj.values())
    if isinstance(obj, list):
        if not obj:
            return current_depth
        return max(get_nesting_depth(item, current_depth + 1) for item in obj)
    return current_depth


def resolve_argument_path(data: dict[str, Any], path: str) -> Any:
    """Safely resolve a dotted path in arguments, handling both stripped and prefixed paths."""
    if not path or not isinstance(data, dict):
        return None

    # Try stripped path first (e.g. 'arguments.action' -> 'action')
    stripped = path.removeprefix("arguments.")
    val = _traverse_dict(data, stripped)
    if val is not None:
        return val

    # Fallback to literal path if data contains an 'arguments' key
    if path != stripped:
        return _traverse_dict(data, path)
    return None


def _traverse_dict(data: dict[str, Any], path: str) -> Any:
    """Helper to traverse a dotted key sequence."""
    parts = path.split(".")
    curr: Any = data
    for part in parts:
        if not isinstance(curr, dict) or part not in curr:
            return None
        curr = curr[part]
    return curr


def evaluate_argument_heuristics(
    arguments: Any,
    custom_rules: list[dict[str, Any]] | None = None,
) -> tuple[float, list[dict[str, Any]]]:
    """Inspect arguments against path-scoped heuristic rules with safety boundaries.

    Returns:
        tuple[float, list[dict[str, Any]]]: Total heuristic score contribution and list of matched rule details.
    """
    matched_records: list[dict[str, Any]] = []

    # 1. Structure and type validation
    if not isinstance(arguments, dict):
        matched_records.append(
            {
                "rule_id": "ARGUMENT_SAFETY_VIOLATION",
                "path": "arguments",
                "severity": "HIGH",
                "score_contribution": 40.0,
            }
        )
        return 40.0, matched_records

    # 2. Payload size check
    try:
        serialized = json.dumps(arguments, separators=(",", ":"))
        if len(serialized.encode("utf-8")) > MAX_PAYLOAD_SIZE:
            matched_records.append(
                {
                    "rule_id": "ARGUMENT_SAFETY_VIOLATION",
                    "path": "arguments",
                    "severity": "HIGH",
                    "score_contribution": 40.0,
                }
            )
            return 40.0, matched_records
    except (TypeError, ValueError):
        matched_records.append(
            {
                "rule_id": "ARGUMENT_SAFETY_VIOLATION",
                "path": "arguments",
                "severity": "HIGH",
                "score_contribution": 40.0,
            }
        )
        return 40.0, matched_records

    # 3. Nesting depth check
    if get_nesting_depth(arguments) > MAX_NESTING_DEPTH:
        matched_records.append(
            {
                "rule_id": "ARGUMENT_SAFETY_VIOLATION",
                "path": "arguments",
                "severity": "HIGH",
                "score_contribution": 40.0,
            }
        )
        return 40.0, matched_records

    # 4. Evaluate rules
    rules = custom_rules if custom_rules else DEFAULT_HEURISTIC_RULES
    total_score = 0.0

    for rule in rules:
        rule_id = str(rule.get("rule_id", "UNKNOWN"))
        target_paths = rule.get("target_paths", [])
        match_type = str(rule.get("match_type", "")).upper()
        severity = str(rule.get("severity", "MEDIUM")).upper()
        score_contribution = float(rule.get("score_contribution", 0.0))

        rule_matched = False
        matched_path: str | None = None

        for path in target_paths:
            val = resolve_argument_path(arguments, path)
            if val is None:
                continue

            if match_type == "IN":
                match_values = {str(v).strip().lower() for v in rule.get("match_values", [])}
                if str(val).strip().lower() in match_values:
                    rule_matched = True
                    matched_path = path
                    break

            elif match_type == "GREATER_THAN":
                threshold = float(rule.get("threshold", 0.0))
                try:
                    num_val = float(val)
                    if num_val > threshold:
                        rule_matched = True
                        matched_path = path
                        break
                except (ValueError, TypeError):
                    pass

            elif match_type == "EQUALS_TRUE":
                if val is True or str(val).strip().lower() in {"true", "1"}:
                    rule_matched = True
                    matched_path = path
                    break

            elif match_type == "WILDCARD_PATTERN":
                val_str = str(val).strip()
                if WILDCARD_SCOPE_PATTERN.search(val_str):
                    rule_matched = True
                    matched_path = path
                    break

            elif match_type == "MATCHES_REGEX":
                pattern_str = str(rule.get("pattern", ""))
                if pattern_str:
                    try:
                        compiled_pattern = re2.compile(pattern_str)
                        if compiled_pattern.search(str(val)):
                            rule_matched = True
                            matched_path = path
                            break
                    except (re2.error, ValueError):
                        continue

        if rule_matched and matched_path is not None:
            total_score += score_contribution
            matched_records.append(
                {
                    "rule_id": rule_id,
                    "path": matched_path,
                    "severity": severity,
                    "score_contribution": score_contribution,
                }
            )

    return total_score, matched_records
