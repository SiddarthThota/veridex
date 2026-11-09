"""Safe deterministic AST Condition Evaluator for Policy Engine (Phase 6).

Enforces:
- Zero dynamic code execution (no eval, exec, or shell).
- Strict AST validation (depth, condition count, payload size, string length limits).
- ReDoS immunity via Google RE2 linear-time automata engine and static pattern checks.
- Nested field resolution across invocation arguments, agent, tool, and execution context.
"""

import json
from typing import Any

import re2

from app.policies.models import ConditionCombinator, PolicyOperator

# --- Safety Limits ---
MAX_AST_DEPTH = 5
MAX_CONDITIONS_PER_RULE = 20
MAX_PAYLOAD_SIZE = 64 * 1024  # 64 KB
MAX_STRING_LENGTH = 1024
MAX_REGEX_LEN = 128
MAX_TARGET_STRING_LEN = 1024

# Patterns indicating catastrophic backtracking in regex (ReDoS) - static defense-in-depth
REDOS_SUSPECT_PATTERNS = [
    re2.compile(r"\([^)]*[\+\*][^)]*\)[\+\*\{]"),  # Nested quantifiers like (a+)+, (a*)*, (a+){2,}
    re2.compile(r"\([^)]*\|[^)]*\)[\+\*\{]"),  # Quantified alternations like (a|aa)+, (a|b)*, (foo|bar)+
    re2.compile(r"(\.\*){2,}"),  # Consecutive .*.*
    re2.compile(r"(\.\+){2,}"),  # Consecutive .+.+
    re2.compile(r"[\+\*]{2,}"),  # Duplicate quantifiers like ++, **
    re2.compile(r"[\+\*]\{"),  # Quantifier followed by range like +{2,}
]


class PolicyEvaluationError(ValueError):
    """Raised when condition evaluation encounters invalid structure or unrecoverable error."""


def validate_regex_pattern(pattern: str) -> None:
    """Validate a regular expression pattern for length, syntax, and linear safety using RE2."""
    if not isinstance(pattern, str):
        raise PolicyEvaluationError(f"Regex pattern must be a string, got {type(pattern).__name__}")
    if len(pattern) > MAX_REGEX_LEN:
        raise PolicyEvaluationError(
            f"Regex pattern exceeds maximum allowed length of {MAX_REGEX_LEN} chars (got {len(pattern)})"
        )

    # Check for catastrophic backtracking indicators
    for suspect in REDOS_SUSPECT_PATTERNS:
        if suspect.search(pattern):
            raise PolicyEvaluationError(
                f"Regex pattern contains unsafe nested quantifier construct vulnerable to ReDoS: '{pattern}'"
            )

    try:
        re2.compile(pattern)
    except re2.error as err:
        raise PolicyEvaluationError(f"Invalid regex syntax or unsupported non-linear construct: {err}") from err


def validate_condition_tree(
    node: dict[str, Any],
    current_depth: int = 1,
    condition_counter: list[int] | None = None,
) -> int:
    """Validate AST condition tree structure, depths, and limits.

    Returns total number of leaf conditions. Raises PolicyEvaluationError if invalid.
    """
    if condition_counter is None:
        condition_counter = [0]

    if current_depth > MAX_AST_DEPTH:
        raise PolicyEvaluationError(
            f"Condition tree exceeds maximum nesting depth of {MAX_AST_DEPTH} (reached {current_depth})"
        )

    if not isinstance(node, dict):
        raise PolicyEvaluationError(f"Condition node must be a dict, got {type(node).__name__}")

    if not node:
        return 0

    # Branch 1: Logical Combinator (AND, OR, NOT)
    if "combinator" in node:
        combinator_raw = str(node.get("combinator"))
        try:
            combinator = ConditionCombinator(combinator_raw)
        except ValueError as err:
            raise PolicyEvaluationError(f"Unsupported combinator '{combinator_raw}'") from err

        conditions = node.get("conditions", [])
        if not isinstance(conditions, list):
            raise PolicyEvaluationError("'conditions' in combinator node must be a list")

        if combinator == ConditionCombinator.NOT and len(conditions) != 1:
            raise PolicyEvaluationError("NOT combinator requires exactly one subcondition")

        for subnode in conditions:
            validate_condition_tree(subnode, current_depth + 1, condition_counter)

        return condition_counter[0]

    # Branch 2: Leaf Condition Node
    if "field" in node:
        condition_counter[0] += 1
        if condition_counter[0] > MAX_CONDITIONS_PER_RULE:
            raise PolicyEvaluationError(f"Condition tree exceeds maximum limit of {MAX_CONDITIONS_PER_RULE} conditions")

        field = node.get("field")
        if not isinstance(field, str) or not field.strip():
            raise PolicyEvaluationError("Leaf condition 'field' must be a non-empty string")

        op_raw = str(node.get("operator"))
        try:
            operator = PolicyOperator(op_raw)
        except ValueError as err:
            raise PolicyEvaluationError(f"Unsupported operator '{op_raw}'") from err

        value = node.get("value")

        # Type and length validations
        if operator == PolicyOperator.MATCHES_REGEX:
            validate_regex_pattern(str(value))
        elif operator in {
            PolicyOperator.GREATER_THAN,
            PolicyOperator.GREATER_THAN_OR_EQUAL,
            PolicyOperator.LESS_THAN,
            PolicyOperator.LESS_THAN_OR_EQUAL,
        }:
            if not isinstance(value, (int, float)):
                raise PolicyEvaluationError(
                    f"Operator {operator.value} requires numeric value, got {type(value).__name__}"
                )
        elif operator in {PolicyOperator.IN, PolicyOperator.NOT_IN}:
            if not isinstance(value, (list, tuple, set)):
                raise PolicyEvaluationError(
                    f"Operator {operator.value} requires list/set collection, got {type(value).__name__}"
                )
        elif isinstance(value, str) and len(value) > MAX_STRING_LENGTH:
            raise PolicyEvaluationError(
                f"Value for field '{field}' exceeds max string length of {MAX_STRING_LENGTH} chars"
            )

        return condition_counter[0]

    raise PolicyEvaluationError("Node must contain either 'combinator' or 'field'")


def resolve_field_path(data: dict[str, Any], path: str) -> Any:
    """Safely traverse a dotted path in a nested dictionary or object.

    Example paths: 'arguments.amount', 'agent.risk_tier', 'arguments.nested.key'
    """
    if not path:
        return None

    parts = path.split(".")
    curr: Any = data
    for part in parts:
        if curr is None:
            return None
        if isinstance(curr, dict):
            curr = curr.get(part)
        elif hasattr(curr, part):
            curr = getattr(curr, part)
        else:
            return None
    return curr


def _safe_regex_match(pattern: str, text: str) -> bool:
    """Execute regex match using Google RE2 linear-time automata engine.

    Guarantees:
    - Mathematical O(n) linear-time execution in input length.
    - Backtracking is fundamentally impossible (automata DFA/NFA).
    - Zero worker threads, zero thread abandonment, zero queue accumulation.
    - Input string capped at MAX_TARGET_STRING_LEN (1024 chars).
    """
    truncated_text = text[:MAX_TARGET_STRING_LEN]
    try:
        compiled = re2.compile(pattern)
        return bool(compiled.search(truncated_text))
    except Exception:
        return False


def evaluate_leaf_condition(node: dict[str, Any], context: dict[str, Any]) -> bool:
    """Evaluate a single leaf condition against the evaluation context."""
    field_path = node.get("field", "")
    operator_raw = node.get("operator")
    expected_value = node.get("value")

    actual_value = resolve_field_path(context, field_path)

    try:
        operator = PolicyOperator(str(operator_raw))
    except ValueError:
        return False

    if operator == PolicyOperator.IS_NULL:
        return actual_value is None

    if operator == PolicyOperator.IS_NOT_NULL:
        return actual_value is not None

    if actual_value is None:
        # None cannot be compared or matched with non-null checks
        return False

    if operator == PolicyOperator.EQUALS:
        return bool(actual_value == expected_value)

    if operator == PolicyOperator.NOT_EQUALS:
        return bool(actual_value != expected_value)

    if operator in {
        PolicyOperator.GREATER_THAN,
        PolicyOperator.GREATER_THAN_OR_EQUAL,
        PolicyOperator.LESS_THAN,
        PolicyOperator.LESS_THAN_OR_EQUAL,
    }:
        if not isinstance(actual_value, (int, float)) or not isinstance(expected_value, (int, float)):
            return False
        if operator == PolicyOperator.GREATER_THAN:
            return bool(actual_value > expected_value)
        if operator == PolicyOperator.GREATER_THAN_OR_EQUAL:
            return bool(actual_value >= expected_value)
        if operator == PolicyOperator.LESS_THAN:
            return bool(actual_value < expected_value)
        if operator == PolicyOperator.LESS_THAN_OR_EQUAL:
            return bool(actual_value <= expected_value)

    if operator == PolicyOperator.IN:
        if isinstance(expected_value, (list, tuple, set)):
            return actual_value in expected_value
        return False

    if operator == PolicyOperator.NOT_IN:
        if isinstance(expected_value, (list, tuple, set)):
            return actual_value not in expected_value
        return False

    if operator == PolicyOperator.CONTAINS:
        if isinstance(actual_value, str):
            return str(expected_value) in actual_value
        if isinstance(actual_value, (list, tuple, set)):
            return expected_value in actual_value
        return False

    if operator == PolicyOperator.STARTS_WITH:
        if isinstance(actual_value, str):
            return actual_value.startswith(str(expected_value))
        return False

    if operator == PolicyOperator.ENDS_WITH:
        if isinstance(actual_value, str):
            return actual_value.endswith(str(expected_value))
        return False

    if operator == PolicyOperator.MATCHES_REGEX:
        if not isinstance(actual_value, str):
            return False
        return _safe_regex_match(str(expected_value), actual_value)

    return False


def evaluate_condition_tree(
    node: dict[str, Any] | None,
    context: dict[str, Any],
    current_depth: int = 1,
) -> bool:
    """Recursively evaluate an AST condition tree against context with strict safety limits."""
    if not node:
        return True

    if current_depth > MAX_AST_DEPTH:
        raise PolicyEvaluationError(f"AST depth exceeded {MAX_AST_DEPTH}")

    # Combinator Node
    if "combinator" in node:
        combinator = ConditionCombinator(str(node["combinator"]))
        subconditions = node.get("conditions", [])

        if not subconditions:
            return combinator == ConditionCombinator.AND

        if combinator == ConditionCombinator.AND:
            return all(evaluate_condition_tree(sub, context, current_depth + 1) for sub in subconditions)

        if combinator == ConditionCombinator.OR:
            return any(evaluate_condition_tree(sub, context, current_depth + 1) for sub in subconditions)

        if combinator == ConditionCombinator.NOT:
            sub = subconditions[0]
            return not evaluate_condition_tree(sub, context, current_depth + 1)

    # Leaf Condition Node
    if "field" in node:
        return evaluate_leaf_condition(node, context)

    return True


def build_evaluation_context(
    arguments: dict[str, Any],
    agent: Any | None = None,
    tool: Any | None = None,
    tool_version: Any | None = None,
    run_environment: str = "DEVELOPMENT",
    additional_context: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Assemble structured, isolated evaluation context for condition matching.

    Guarantees payload size boundary and extracts safe domain attributes.
    """
    raw_json = json.dumps(arguments)
    if len(raw_json.encode("utf-8")) > MAX_PAYLOAD_SIZE:
        raise PolicyEvaluationError(
            f"Arguments payload size ({len(raw_json.encode('utf-8'))} bytes) exceeds limit of {MAX_PAYLOAD_SIZE} bytes"
        )

    ctx: dict[str, Any] = {
        "arguments": arguments,
        "context": {
            "environment": run_environment,
            **(additional_context or {}),
        },
    }

    if agent:
        ctx["agent"] = {
            "id": str(agent.id),
            "name": agent.name,
            "slug": agent.slug,
            "environment": str(agent.environment),
            "risk_tier": str(agent.risk_tier),
            "status": str(agent.status),
            "model_provider": agent.model_provider,
            "model_name": agent.model_name,
        }

    if tool:
        ctx["tool"] = {
            "id": str(tool.id),
            "name": tool.name,
            "slug": tool.slug,
            "status": str(tool.status),
            "risk_level": str(tool.risk_level),
            "access_type": str(tool.access_type),
            "reversibility": str(tool.reversibility),
            "data_classification": str(tool.data_classification),
            "approval_requirement": str(tool.approval_requirement),
        }

    if tool_version:
        ctx["tool_version"] = {
            "id": str(tool_version.id),
            "version": tool_version.version,
            "status": str(tool_version.status),
        }

    return ctx
