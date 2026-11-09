"""Unit tests for Policy AST Evaluator and ReDoS protection (Phase 6)."""

import time

import pytest

from app.policies.evaluator import (
    MAX_AST_DEPTH,
    MAX_CONDITIONS_PER_RULE,
    PolicyEvaluationError,
    build_evaluation_context,
    evaluate_condition_tree,
    resolve_field_path,
    validate_condition_tree,
    validate_regex_pattern,
)
from app.policies.models import ConditionCombinator, PolicyOperator


def test_resolve_field_path_nested() -> None:
    """Test safe dotted path resolution across nested structures."""
    data = {
        "arguments": {
            "amount": 25000,
            "user": {
                "profile": {
                    "country": "US",
                    "tier": "enterprise",
                }
            },
        },
        "context": {"environment": "PRODUCTION"},
    }

    assert resolve_field_path(data, "arguments.amount") == 25000
    assert resolve_field_path(data, "arguments.user.profile.country") == "US"
    assert resolve_field_path(data, "arguments.user.profile.tier") == "enterprise"
    assert resolve_field_path(data, "context.environment") == "PRODUCTION"
    assert resolve_field_path(data, "arguments.nonexistent") is None
    assert resolve_field_path(data, "arguments.user.profile.zipcode") is None
    assert resolve_field_path(data, "") is None


def test_evaluate_numeric_operators() -> None:
    """Test numeric comparison operators."""
    context = {"arguments": {"count": 10, "score": 95.5}}

    # Greater than
    assert evaluate_condition_tree(
        {"field": "arguments.count", "operator": PolicyOperator.GREATER_THAN, "value": 5},
        context,
    )
    assert not evaluate_condition_tree(
        {"field": "arguments.count", "operator": PolicyOperator.GREATER_THAN, "value": 15},
        context,
    )

    # Less than or equal
    assert evaluate_condition_tree(
        {"field": "arguments.count", "operator": PolicyOperator.LESS_THAN_OR_EQUAL, "value": 10},
        context,
    )
    assert evaluate_condition_tree(
        {"field": "arguments.score", "operator": PolicyOperator.GREATER_THAN_OR_EQUAL, "value": 95.0},
        context,
    )


def test_evaluate_string_and_collection_operators() -> None:
    """Test IN, NOT_IN, CONTAINS, STARTS_WITH, ENDS_WITH."""
    context = {
        "arguments": {
            "query": "DROP TABLE users;",
            "action": "transfer_funds",
            "tags": ["admin", "financial", "urgent"],
        }
    }

    # CONTAINS
    assert evaluate_condition_tree(
        {"field": "arguments.query", "operator": PolicyOperator.CONTAINS, "value": "DROP TABLE"},
        context,
    )
    # IN
    assert evaluate_condition_tree(
        {"field": "arguments.action", "operator": PolicyOperator.IN, "value": ["transfer_funds", "wire"]},
        context,
    )
    # NOT_IN
    assert evaluate_condition_tree(
        {"field": "arguments.action", "operator": PolicyOperator.NOT_IN, "value": ["read", "list"]},
        context,
    )
    # STARTS_WITH
    assert evaluate_condition_tree(
        {"field": "arguments.action", "operator": PolicyOperator.STARTS_WITH, "value": "transfer"},
        context,
    )
    # ENDS_WITH
    assert evaluate_condition_tree(
        {"field": "arguments.action", "operator": PolicyOperator.ENDS_WITH, "value": "funds"},
        context,
    )


def test_evaluate_boolean_combinators() -> None:
    """Test AND, OR, and NOT logical combinators."""
    context = {
        "arguments": {"amount": 50000, "currency": "USD"},
        "context": {"environment": "PRODUCTION"},
    }

    # AND combinator
    tree_and = {
        "combinator": ConditionCombinator.AND,
        "conditions": [
            {"field": "arguments.amount", "operator": PolicyOperator.GREATER_THAN, "value": 10000},
            {"field": "context.environment", "operator": PolicyOperator.EQUALS, "value": "PRODUCTION"},
        ],
    }
    assert evaluate_condition_tree(tree_and, context)

    # OR combinator
    tree_or = {
        "combinator": ConditionCombinator.OR,
        "conditions": [
            {"field": "arguments.amount", "operator": PolicyOperator.LESS_THAN, "value": 1000},
            {"field": "arguments.currency", "operator": PolicyOperator.EQUALS, "value": "USD"},
        ],
    }
    assert evaluate_condition_tree(tree_or, context)

    # NOT combinator
    tree_not = {
        "combinator": ConditionCombinator.NOT,
        "conditions": [
            {"field": "context.environment", "operator": PolicyOperator.EQUALS, "value": "DEVELOPMENT"},
        ],
    }
    assert evaluate_condition_tree(tree_not, context)


def test_ast_validation_limits() -> None:
    """Verify nesting depth and condition count limits are strictly enforced."""
    # Nesting deeper than MAX_AST_DEPTH (5)
    deep_tree: dict = {"field": "arguments.x", "operator": "EQUALS", "value": 1}
    for _ in range(MAX_AST_DEPTH + 1):
        deep_tree = {"combinator": "AND", "conditions": [deep_tree]}

    with pytest.raises(PolicyEvaluationError, match="exceeds maximum nesting depth"):
        validate_condition_tree(deep_tree)

    # More than MAX_CONDITIONS_PER_RULE (20)
    many_conditions = [
        {"field": f"arguments.field_{i}", "operator": "EQUALS", "value": i} for i in range(MAX_CONDITIONS_PER_RULE + 5)
    ]
    wide_tree = {"combinator": "OR", "conditions": many_conditions}

    with pytest.raises(PolicyEvaluationError, match="exceeds maximum limit"):
        validate_condition_tree(wide_tree)


def test_redos_protection_pattern_rejection() -> None:
    """Verify catastrophic backtracking regex patterns are rejected at authoring time."""
    # Nested quantifiers
    with pytest.raises(PolicyEvaluationError, match="unsafe nested quantifier construct"):
        validate_regex_pattern(r"(a+)+$")

    with pytest.raises(PolicyEvaluationError, match="unsafe nested quantifier construct"):
        validate_regex_pattern(r"(a*)*")

    with pytest.raises(PolicyEvaluationError, match="unsafe nested quantifier construct"):
        validate_regex_pattern(r"(x|y+)+")

    with pytest.raises(PolicyEvaluationError, match="unsafe nested quantifier construct"):
        validate_regex_pattern(r"([a-z]+)+")

    # Quantified alternations
    with pytest.raises(PolicyEvaluationError, match="unsafe nested quantifier construct"):
        validate_regex_pattern(r"(a|aa)+$")

    with pytest.raises(PolicyEvaluationError, match="unsafe nested quantifier construct"):
        validate_regex_pattern(r"(foo|bar)*")

    # Duplicate / invalid quantifiers
    with pytest.raises(PolicyEvaluationError, match="unsafe nested quantifier construct"):
        validate_regex_pattern(r"a++")

    # Consecutive wildcards
    with pytest.raises(PolicyEvaluationError, match="unsafe nested quantifier construct"):
        validate_regex_pattern(r".*.*")

    # Safe regex must pass
    validate_regex_pattern(r"^[A-Z]{3}-\d{4}$")
    validate_regex_pattern(r"^(delete|drop)\s+[a-z_]+$")
    validate_regex_pattern(r"^[a-zA-Z0-9_-]+$")


def test_regex_evaluation_safety() -> None:
    """Verify regex matching works correctly on valid patterns."""
    context = {"arguments": {"command": "DROP TABLE critical_data;"}}

    # Positive match
    match_tree = {
        "field": "arguments.command",
        "operator": PolicyOperator.MATCHES_REGEX,
        "value": r"(?i)^(drop|truncate)\s+",
    }
    assert evaluate_condition_tree(match_tree, context)

    # Negative match
    no_match_tree = {
        "field": "arguments.command",
        "operator": PolicyOperator.MATCHES_REGEX,
        "value": r"^SELECT\s+",
    }
    assert not evaluate_condition_tree(no_match_tree, context)


def test_re2_linear_time_catastrophic_patterns() -> None:
    """Verify that linear-time RE2 engine matches catastrophic ReDoS patterns in sub-millisecond time."""
    from app.policies.evaluator import _safe_regex_match

    # Non-matching catastrophic patterns that cause worst-case exponential backtracking in NFA engines
    catastrophic_patterns = [
        r"(a|aa)+$",
        r"(a+)+$",
        r"(x+x+)+y",
        r"(a|b+)+$",
    ]
    malicious_input = "a" * 200 + "!"

    for pattern in catastrophic_patterns:
        start = time.perf_counter()
        result = _safe_regex_match(pattern, malicious_input)
        elapsed = time.perf_counter() - start

        # Must execute in < 20ms and evaluate to False
        assert elapsed < 0.02, f"Pattern {pattern} took {elapsed:.4f}s - linear time violated!"
        assert result is False

    # Positive match under linear time
    start = time.perf_counter()
    assert _safe_regex_match(r"(a|aa)+$", "a" * 200) is True
    assert time.perf_counter() - start < 0.02


def test_repeated_requests_zero_worker_exhaustion() -> None:
    """Verify repeated evaluations with catastrophic patterns cannot exhaust workers or queue."""
    from app.policies.evaluator import _safe_regex_match

    malicious_input = "a" * 150 + "!"
    start = time.perf_counter()

    for _ in range(50):
        res = _safe_regex_match(r"(a|aa)+$", malicious_input)
        assert res is False

    total_elapsed = time.perf_counter() - start
    # 50 iterations must complete within 100ms total
    assert total_elapsed < 0.1, f"50 iterations took {total_elapsed:.4f}s"


def test_re2_rejects_backreferences() -> None:
    """Verify that non-linear regex features like backreferences are rejected at authoring time."""
    with pytest.raises(PolicyEvaluationError, match="Invalid regex syntax or unsupported non-linear construct"):
        validate_regex_pattern(r"(a)\1")


def test_payload_size_boundary() -> None:
    """Verify build_evaluation_context enforces the 64 KB limit."""
    small_args = {"data": "A" * 100}
    ctx = build_evaluation_context(small_args)
    assert ctx["arguments"]["data"] == "A" * 100

    huge_args = {"data": "X" * 70000}
    with pytest.raises(PolicyEvaluationError, match="payload size .* exceeds limit"):
        build_evaluation_context(huge_args)
