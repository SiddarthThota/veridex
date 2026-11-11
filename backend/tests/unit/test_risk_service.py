"""Unit tests for Phase 7.2 Risk Scoring Engine and Context Evaluation."""

import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.agents.models import Agent, AgentStatus
from app.governance.models import (
    ExecutionStatus,
    GovernanceDecision,
    GovernanceViolationCode,
    ToolExecution,
    ToolRequest,
    compute_arguments_hash,
)
from app.risk.heuristics import (
    MAX_PAYLOAD_SIZE,
    evaluate_argument_heuristics,
    get_nesting_depth,
)
from app.risk.models import (
    AgentHistoryStatus,
    RiskConfiguration,
    RiskConfigurationVersion,
    RiskLevel,
)
from app.risk.service import (
    FALLBACK_VIOLATION_SCORE,
    SCORING_ALGORITHM_VERSION,
    RiskEngineService,
)
from app.tools.models import (
    Tool,
    ToolStatus,
    ToolVersion,
    ToolVersionStatus,
)
from app.users.models import Organization, Role, User, UserStatus

# ==============================================================================
# 1. Factor Mappings and Subscore Formulas
# ==============================================================================


def test_tool_subscore_formula_and_factor_mappings() -> None:
    """Verify tool subscore calculation across risk levels, access types, and reversibility."""
    # LOW + READ + REVERSIBLE: 0.50*10 + 0.20*0 + 0.30*0 = 5.0
    s_low = RiskEngineService.calculate_tool_subscore("LOW", "READ", "REVERSIBLE")
    assert s_low == 5.0

    # CRITICAL + WRITE + IRREVERSIBLE: 0.50*95 + 0.20*30 + 0.30*40 = 47.5 + 6.0 + 12.0 = 65.5
    s_crit = RiskEngineService.calculate_tool_subscore("CRITICAL", "WRITE", "IRREVERSIBLE")
    assert s_crit == 65.5

    # MEDIUM + WRITE + REVERSIBLE: 0.50*35 + 0.20*30 + 0.30*0 = 17.5 + 6.0 = 23.5
    s_med = RiskEngineService.calculate_tool_subscore("MEDIUM", "WRITE", "REVERSIBLE")
    assert s_med == 23.5

    # HIGH + READ + IRREVERSIBLE: 0.50*70 + 0.20*0 + 0.30*40 = 35.0 + 12.0 = 47.0
    s_high = RiskEngineService.calculate_tool_subscore("HIGH", "READ", "IRREVERSIBLE")
    assert s_high == 47.0


def test_data_subscore_formula_and_factor_mappings() -> None:
    """Verify data subscore calculation across data classifications and approval requirements."""
    # PUBLIC + NOT_REQUIRED: 0.70*0 + 0.30*0 = 0.0
    s_pub = RiskEngineService.calculate_data_subscore("PUBLIC", "NOT_REQUIRED")
    assert s_pub == 0.0

    # INTERNAL + OPTIONAL: 0.70*25 + 0.30*20 = 17.5 + 6.0 = 23.5
    s_int = RiskEngineService.calculate_data_subscore("INTERNAL", "OPTIONAL")
    assert s_int == 23.5

    # CONFIDENTIAL + NOT_REQUIRED: 0.70*60 + 0.30*0 = 42.0
    s_conf = RiskEngineService.calculate_data_subscore("CONFIDENTIAL", "NOT_REQUIRED")
    assert s_conf == 42.0

    # RESTRICTED + REQUIRED: 0.70*100 + 0.30*50 = 70.0 + 15.0 = 85.0
    s_restr = RiskEngineService.calculate_data_subscore("RESTRICTED", "REQUIRED")
    assert s_restr == 85.0


def test_agent_subscore_formula_and_tiers() -> None:
    """Verify agent subscore with tiers and sliding-window rates."""
    # LOW tier (15 pts) + Clean history (rate=0.0): 0.60*15 + 0.40*0 = 9.0
    s_low, pts_low = RiskEngineService.calculate_agent_subscore("LOW", AgentHistoryStatus.VALID, 0.0)
    assert s_low == 9.0
    assert pts_low == 0.0

    # MEDIUM tier (40 pts) + 5% rate (points=25.0): 0.60*40 + 0.40*25 = 24.0 + 10.0 = 34.0
    s_med, pts_med = RiskEngineService.calculate_agent_subscore("MEDIUM", AgentHistoryStatus.VALID, 0.05)
    assert s_med == 34.0
    assert pts_med == 25.0

    # HIGH tier (75 pts) + 15% rate (points=55.0): 0.60*75 + 0.40*55 = 45.0 + 22.0 = 67.0
    s_high, pts_high = RiskEngineService.calculate_agent_subscore("HIGH", AgentHistoryStatus.VALID, 0.15)
    assert s_high == 67.0
    assert pts_high == 55.0

    # CRITICAL tier (95 pts) + 30% rate (points=85.0): 0.60*95 + 0.40*85 = 57.0 + 34.0 = 91.0
    s_crit, pts_crit = RiskEngineService.calculate_agent_subscore("CRITICAL", AgentHistoryStatus.VALID, 0.30)
    assert s_crit == 91.0
    assert pts_crit == 85.0


def test_agent_subscore_insufficient_data_conservative_fallback() -> None:
    """Verify unproven agents receive 35.0 fallback points, avoiding unearned trust."""
    # LOW tier with INSUFFICIENT_DATA: 0.60*15 + 0.40*35.0 = 9.0 + 14.0 = 23.0
    s_unproven, pts = RiskEngineService.calculate_agent_subscore("LOW", AgentHistoryStatus.INSUFFICIENT_DATA, 0.0)
    assert pts == FALLBACK_VIOLATION_SCORE
    assert s_unproven == 23.0

    # Verified clean agent with 0 violations gets 0.0 points -> 9.0 (significantly lower risk!)
    s_verified, _ = RiskEngineService.calculate_agent_subscore("LOW", AgentHistoryStatus.VALID, 0.0)
    assert s_unproven > s_verified


def test_context_subscore_environments_and_heuristics() -> None:
    """Verify context subscore combines environment baseline and heuristic contributions."""
    # DEVELOPMENT (10 pts) + No heuristics: 0.40*10 + 0.60*0 = 4.0
    s_dev, matches_dev = RiskEngineService.calculate_context_subscore("DEVELOPMENT", {})
    assert s_dev == 4.0
    assert len(matches_dev) == 0

    # PRODUCTION (80 pts) + Destructive command (+60): 0.40*80 + 0.60*60 = 32.0 + 36.0 = 68.0
    s_prod, matches_prod = RiskEngineService.calculate_context_subscore("PRODUCTION", {"action": "drop"})
    assert s_prod == 68.0
    assert len(matches_prod) == 1
    assert matches_prod[0]["rule_id"] == "DESTRUCTIVE_COMMAND"


# ==============================================================================
# 2. Four-Vector Weighting, Rounding, Bounds & Validation
# ==============================================================================


def test_configuration_validation_rules() -> None:
    """Verify configuration validation rejects invalid weights and inverted thresholds."""
    # Negative weight
    with pytest.raises(ValueError, match="Risk weights must each be between"):
        RiskEngineService.validate_configuration(-0.1, 0.4, 0.3, 0.4, 30, 60, 85, 60, 90)

    # Weights don't sum to 1.0
    with pytest.raises(ValueError, match="Risk weights must sum to 1.0"):
        RiskEngineService.validate_configuration(0.5, 0.5, 0.5, 0.5, 30, 60, 85, 60, 90)

    # Inverted classification boundaries
    with pytest.raises(ValueError, match="Threshold boundaries must satisfy"):
        RiskEngineService.validate_configuration(0.35, 0.25, 0.20, 0.20, 70, 60, 85, 60, 90)

    # Inverted triggers
    with pytest.raises(ValueError, match="Trigger thresholds must satisfy"):
        RiskEngineService.validate_configuration(0.35, 0.25, 0.20, 0.20, 30, 60, 85, 95, 90)


def test_composite_score_bounds_and_clamping() -> None:
    """Verify composite score clamps strictly to [0, 100]."""
    score_zero = RiskEngineService.calculate_composite_score(0.0, 0.0, 0.0, 0.0)
    assert score_zero == 0

    score_max = RiskEngineService.calculate_composite_score(100.0, 100.0, 100.0, 100.0)
    assert score_max == 100

    # Overflows clamped
    score_clamped = RiskEngineService.calculate_composite_score(150.0, 150.0, 150.0, 150.0)
    assert score_clamped == 100


def test_deterministic_rounding_and_reproducibility() -> None:
    """Verify deterministic rounding across repeated calculations with identical inputs."""
    scores = [RiskEngineService.calculate_composite_score(33.3, 44.4, 55.5, 66.6) for _ in range(10)]
    assert all(s == scores[0] for s in scores)


# ==============================================================================
# 3. Exact Classification & Action Threshold Boundaries
# ==============================================================================


def test_exact_classification_boundaries() -> None:
    """Verify exact 29/30, 59/60, and 84/85 tier transitions."""
    assert RiskEngineService.classify_risk_score(0) == RiskLevel.LOW
    assert RiskEngineService.classify_risk_score(29) == RiskLevel.LOW
    assert RiskEngineService.classify_risk_score(30) == RiskLevel.MEDIUM

    assert RiskEngineService.classify_risk_score(59) == RiskLevel.MEDIUM
    assert RiskEngineService.classify_risk_score(60) == RiskLevel.HIGH

    assert RiskEngineService.classify_risk_score(84) == RiskLevel.HIGH
    assert RiskEngineService.classify_risk_score(85) == RiskLevel.CRITICAL
    assert RiskEngineService.classify_risk_score(100) == RiskLevel.CRITICAL


def test_action_threshold_boundaries() -> None:
    """Verify approval (60) and denial (90) boundary triggers."""
    appr_thresh = 60
    deny_thresh = 90

    # Score 59 -> Clean from risk triggers
    score_59 = 59
    assert score_59 < appr_thresh
    assert score_59 < deny_thresh

    # Score 60 -> Triggers approval requirement
    score_60 = 60
    assert score_60 >= appr_thresh
    assert score_60 < deny_thresh

    # Score 89 -> Approval required, below deny threshold
    score_89 = 89
    assert score_89 >= appr_thresh
    assert score_89 < deny_thresh

    # Score 90 -> Triggers denial threshold
    score_90 = 90
    assert score_90 >= deny_thresh


# ==============================================================================
# 4. Path-Scoped Argument Heuristics & Safety Envelopes
# ==============================================================================


def test_heuristic_destructive_commands() -> None:
    """Verify destructive commands in action or command paths match with +60 contribution."""
    keywords = ["drop", "truncate", "delete", "format", "destroy", "purge"]
    for kw in keywords:
        pts, matches = evaluate_argument_heuristics({"action": kw})
        assert pts == 60.0
        assert matches[0]["rule_id"] == "DESTRUCTIVE_COMMAND"

        pts_cmd, matches_cmd = evaluate_argument_heuristics({"command": f" {kw.upper()} "})
        assert pts_cmd == 60.0
        assert matches_cmd[0]["rule_id"] == "DESTRUCTIVE_COMMAND"

    # Benign action produces 0
    pts_benign, matches_benign = evaluate_argument_heuristics({"action": "select"})
    assert pts_benign == 0.0
    assert len(matches_benign) == 0


def test_heuristic_high_financial_value() -> None:
    """Verify high financial values (> 10000) in amount or value paths match with +40 contribution."""
    pts, matches = evaluate_argument_heuristics({"amount": 10001})
    assert pts == 40.0
    assert matches[0]["rule_id"] == "HIGH_FINANCIAL_VALUE"

    # Edge: exactly 10000 is not > 10000
    pts_exact, matches_exact = evaluate_argument_heuristics({"amount": 10000})
    assert pts_exact == 0.0
    assert len(matches_exact) == 0

    # String numeric
    pts_str, matches_str = evaluate_argument_heuristics({"value": "25000.50"})
    assert pts_str == 40.0
    assert matches_str[0]["rule_id"] == "HIGH_FINANCIAL_VALUE"


def test_heuristic_override_and_cascade_flags() -> None:
    """Verify boolean override and cascade deletion flags."""
    pts_force, m_force = evaluate_argument_heuristics({"force": True})
    assert pts_force == 35.0
    assert m_force[0]["rule_id"] == "OVERRIDE_FLAG_SET"

    pts_cascade, m_cascade = evaluate_argument_heuristics({"cascade": "true"})
    assert pts_cascade == 50.0
    assert m_cascade[0]["rule_id"] == "CASCADE_DELETION"


def test_heuristic_wildcard_scope_pattern() -> None:
    """Verify wildcard patterns (*, all, %, /) match exactly with +30 contribution."""
    wildcards = ["*", "all", "ALL", "%", "/"]
    for wc in wildcards:
        pts, matches = evaluate_argument_heuristics({"target": wc})
        assert pts == 30.0
        assert matches[0]["rule_id"] == "WILDCARD_SCOPE"

    # Non-wildcard target or SQL query does not match full wildcard scope
    pts_sql, matches_sql = evaluate_argument_heuristics({"query": "SELECT * FROM users"})
    assert pts_sql == 0.0
    assert len(matches_sql) == 0


def test_overlapping_heuristic_matches() -> None:
    """Verify multiple distinct heuristic matches sum contributions deterministically."""
    args = {
        "action": "truncate",  # +60
        "cascade": True,  # +50
        "force": True,  # +35
        "amount": 50000,  # +40
        "target": "*",  # +30
    }
    pts, matches = evaluate_argument_heuristics(args)
    # Sum: 60 + 50 + 35 + 40 + 30 = 215
    assert pts == 215.0
    assert len(matches) == 5

    # Context subscore will safely clamp to 100.0
    subscore_ctx, _ = RiskEngineService.calculate_context_subscore("PRODUCTION", args)
    assert subscore_ctx == 100.0


def test_heuristics_malformed_arguments_and_safety_envelopes() -> None:
    """Verify oversized payloads, excessive nesting, and malformed inputs are safely penalized."""
    # 1. Non-dict arguments
    pts_str, m_str = evaluate_argument_heuristics("not-a-dict")
    assert pts_str == 40.0
    assert m_str[0]["rule_id"] == "ARGUMENT_SAFETY_VIOLATION"

    # 2. Oversized payload (> 64 KB)
    large_args = {"data": "x" * (MAX_PAYLOAD_SIZE + 10)}
    pts_large, m_large = evaluate_argument_heuristics(large_args)
    assert pts_large == 40.0
    assert m_large[0]["rule_id"] == "ARGUMENT_SAFETY_VIOLATION"

    # 3. Excessive nesting (> 5 levels)
    nested: dict[str, Any] = {"l1": {"l2": {"l3": {"l4": {"l5": {"l6": "too-deep"}}}}}}
    assert get_nesting_depth(nested) == 6
    pts_nest, m_nest = evaluate_argument_heuristics(nested)
    assert pts_nest == 40.0
    assert m_nest[0]["rule_id"] == "ARGUMENT_SAFETY_VIOLATION"

    # 4. Valid 5-level nesting succeeds
    valid_nest: dict[str, Any] = {"l1": {"l2": {"l3": {"l4": {"l5": "ok"}}}}}
    assert get_nesting_depth(valid_nest) == 5
    pts_valid, m_valid = evaluate_argument_heuristics(valid_nest)
    assert pts_valid == 0.0
    assert len(m_valid) == 0


# ==============================================================================
# 5. Database Sliding-Window History, Exclusions & Multi-Tenant Isolation
# ==============================================================================


@pytest.mark.asyncio
async def test_agent_history_insufficient_data_cutoff(db_session: AsyncSession) -> None:
    """Verify INSUFFICIENT_DATA status when fewer than 5 eligible invocations exist."""
    uid = uuid.uuid4()
    org = Organization(name=f"History Org {uid}", slug=f"history-org-{uid}")
    db_session.add(org)
    await db_session.commit()
    await db_session.refresh(org)

    user = User(
        organization_id=org.id,
        email=f"user-{uid}@example.com",
        password_hash="fake-hash",
        display_name="History User",
        status=UserStatus.ACTIVE,
        role=Role.ADMIN,
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)

    agent = Agent(
        organization_id=org.id,
        owner_user_id=user.id,
        name=f"Agent {uid}",
        slug=f"agent-{uid}",
        model_provider="anthropic",
        model_name="claude-3-5-sonnet",
        status=AgentStatus.ACTIVE,
    )
    tool = Tool(
        organization_id=org.id,
        owner_user_id=user.id,
        name="Tool",
        slug=f"tool-{uid}",
        status=ToolStatus.ACTIVE,
    )
    db_session.add(agent)
    db_session.add(tool)
    await db_session.commit()
    await db_session.refresh(agent)
    await db_session.refresh(tool)

    tool_version = ToolVersion(
        tool_id=tool.id,
        version="1.0.0",
        status=ToolVersionStatus.PUBLISHED,
        created_by=user.id,
    )
    db_session.add(tool_version)
    await db_session.commit()
    await db_session.refresh(tool_version)

    now = datetime.now(UTC)

    # 1. 0 runs -> INSUFFICIENT_DATA
    status, rate, eligible, violations = await RiskEngineService.get_agent_violation_metrics(
        db_session, org.id, agent.id, now=now
    )
    assert status == AgentHistoryStatus.INSUFFICIENT_DATA
    assert eligible == 0
    assert rate == 0.0

    # 2. Add 3 clean runs -> still INSUFFICIENT_DATA (< 5)
    for i in range(3):
        args = {"query": f"run-{i}"}
        req = ToolRequest(
            organization_id=org.id,
            agent_id=agent.id,
            tool_id=tool.id,
            tool_version_id=tool_version.id,
            decision=GovernanceDecision.ALLOW,
            arguments=args,
            arguments_hash=compute_arguments_hash(tool_version.id, args),
            violation_codes=[],
            environment="PRODUCTION",
            evaluated_at=now - timedelta(hours=i),
        )
        db_session.add(req)
    await db_session.commit()

    status_3, rate_3, eligible_3, _ = await RiskEngineService.get_agent_violation_metrics(
        db_session, org.id, agent.id, now=now
    )
    assert status_3 == AgentHistoryStatus.INSUFFICIENT_DATA
    assert eligible_3 == 3


@pytest.mark.asyncio
async def test_agent_history_valid_window_and_violation_rate(db_session: AsyncSession) -> None:
    """Verify status becomes VALID at >= 5 eligible invocations with accurate rate."""
    uid = uuid.uuid4()
    org = Organization(name=f"Valid Org {uid}", slug=f"valid-org-{uid}")
    db_session.add(org)
    await db_session.commit()
    await db_session.refresh(org)

    user = User(
        organization_id=org.id,
        email=f"user-{uid}@example.com",
        password_hash="fake-hash",
        display_name="Valid User",
        status=UserStatus.ACTIVE,
        role=Role.ADMIN,
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)

    agent = Agent(
        organization_id=org.id,
        owner_user_id=user.id,
        name=f"Agent {uid}",
        slug=f"agent-{uid}",
        model_provider="anthropic",
        model_name="claude-3-5-sonnet",
        status=AgentStatus.ACTIVE,
    )
    tool = Tool(
        organization_id=org.id,
        owner_user_id=user.id,
        name="Tool",
        slug=f"tool-{uid}",
        status=ToolStatus.ACTIVE,
    )
    db_session.add(agent)
    db_session.add(tool)
    await db_session.commit()
    await db_session.refresh(agent)
    await db_session.refresh(tool)

    tool_version = ToolVersion(
        tool_id=tool.id,
        version="1.0.0",
        status=ToolVersionStatus.PUBLISHED,
        created_by=user.id,
    )
    db_session.add(tool_version)
    await db_session.commit()
    await db_session.refresh(tool_version)

    now = datetime.now(UTC)

    # Add 8 ALLOW runs and 2 DENY runs (misconduct violations) -> 10 total eligible, 2 violations (20% rate)
    for i in range(8):
        args = {"query": f"allow-{i}"}
        req = ToolRequest(
            organization_id=org.id,
            agent_id=agent.id,
            tool_id=tool.id,
            tool_version_id=tool_version.id,
            decision=GovernanceDecision.ALLOW,
            arguments=args,
            arguments_hash=compute_arguments_hash(tool_version.id, args),
            violation_codes=[],
            environment="PRODUCTION",
            evaluated_at=now - timedelta(hours=i),
        )
        db_session.add(req)

    for i in range(2):
        args_d = {"query": f"deny-{i}"}
        req_d = ToolRequest(
            organization_id=org.id,
            agent_id=agent.id,
            tool_id=tool.id,
            tool_version_id=tool_version.id,
            decision=GovernanceDecision.DENY,
            arguments=args_d,
            arguments_hash=compute_arguments_hash(tool_version.id, args_d),
            violation_codes=[GovernanceViolationCode.PERMISSION_DENIED.value],
            environment="PRODUCTION",
            evaluated_at=now - timedelta(hours=8 + i),
        )
        db_session.add(req_d)

    await db_session.commit()

    status, rate, eligible, violations = await RiskEngineService.get_agent_violation_metrics(
        db_session, org.id, agent.id, now=now
    )
    assert status == AgentHistoryStatus.VALID
    assert eligible == 10
    assert violations == 2
    assert rate == 0.20  # 2 / 10 = 20%


@pytest.mark.asyncio
async def test_agent_history_seven_day_window_and_fifty_sample_cap(db_session: AsyncSession) -> None:
    """Verify invocations older than 7 days are ignored and sample size is capped at 50."""
    uid = uuid.uuid4()
    org = Organization(name=f"Cap Org {uid}", slug=f"cap-org-{uid}")
    db_session.add(org)
    await db_session.commit()
    await db_session.refresh(org)

    user = User(
        organization_id=org.id,
        email=f"user-{uid}@example.com",
        password_hash="fake-hash",
        display_name="Cap User",
        status=UserStatus.ACTIVE,
        role=Role.ADMIN,
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)

    agent = Agent(
        organization_id=org.id,
        owner_user_id=user.id,
        name=f"Agent {uid}",
        slug=f"agent-{uid}",
        model_provider="anthropic",
        model_name="claude-3-5-sonnet",
        status=AgentStatus.ACTIVE,
    )
    tool = Tool(
        organization_id=org.id,
        owner_user_id=user.id,
        name="Tool",
        slug=f"tool-{uid}",
        status=ToolStatus.ACTIVE,
    )
    db_session.add(agent)
    db_session.add(tool)
    await db_session.commit()
    await db_session.refresh(agent)
    await db_session.refresh(tool)

    tool_version = ToolVersion(
        tool_id=tool.id,
        version="1.0.0",
        status=ToolVersionStatus.PUBLISHED,
        created_by=user.id,
    )
    db_session.add(tool_version)
    await db_session.commit()
    await db_session.refresh(tool_version)

    now = datetime.now(UTC)

    # 1. Add 60 invocations within 7 days
    for i in range(60):
        args = {"query": f"recent-{i}"}
        req = ToolRequest(
            organization_id=org.id,
            agent_id=agent.id,
            tool_id=tool.id,
            tool_version_id=tool_version.id,
            decision=GovernanceDecision.ALLOW,
            arguments=args,
            arguments_hash=compute_arguments_hash(tool_version.id, args),
            violation_codes=[],
            environment="PRODUCTION",
            evaluated_at=now - timedelta(hours=i),
        )
        db_session.add(req)

    # 2. Add 10 invocations older than 7 days (e.g. 8 days old)
    for _i in range(10):
        args_old = {"query": f"old-{i}"}
        req_old = ToolRequest(
            organization_id=org.id,
            agent_id=agent.id,
            tool_id=tool.id,
            tool_version_id=tool_version.id,
            decision=GovernanceDecision.DENY,
            arguments=args_old,
            arguments_hash=compute_arguments_hash(tool_version.id, args_old),
            violation_codes=[GovernanceViolationCode.PERMISSION_DENIED.value],
            environment="PRODUCTION",
            evaluated_at=now - timedelta(days=8, hours=i),
        )
        db_session.add(req_old)

    await db_session.commit()

    status, rate, eligible, violations = await RiskEngineService.get_agent_violation_metrics(
        db_session, org.id, agent.id, now=now
    )
    assert status == AgentHistoryStatus.VALID
    # 50 max sample cap enforced
    assert eligible == 50
    # Old violations from 8 days ago were completely excluded
    assert violations == 0
    assert rate == 0.0


@pytest.mark.asyncio
async def test_agent_history_exclusions_infrastructure_failures(db_session: AsyncSession) -> None:
    """Verify infrastructure failures and unhandled system errors are excluded from agent history."""
    uid = uuid.uuid4()
    org = Organization(name=f"Excl Org {uid}", slug=f"excl-org-{uid}")
    db_session.add(org)
    await db_session.commit()
    await db_session.refresh(org)

    user = User(
        organization_id=org.id,
        email=f"user-{uid}@example.com",
        password_hash="fake-hash",
        display_name="Excl User",
        status=UserStatus.ACTIVE,
        role=Role.ADMIN,
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)

    agent = Agent(
        organization_id=org.id,
        owner_user_id=user.id,
        name=f"Agent {uid}",
        slug=f"agent-{uid}",
        model_provider="anthropic",
        model_name="claude-3-5-sonnet",
        status=AgentStatus.ACTIVE,
    )
    tool = Tool(
        organization_id=org.id,
        owner_user_id=user.id,
        name="Tool",
        slug=f"tool-{uid}",
        status=ToolStatus.ACTIVE,
    )
    db_session.add(agent)
    db_session.add(tool)
    await db_session.commit()
    await db_session.refresh(agent)
    await db_session.refresh(tool)

    tool_version = ToolVersion(
        tool_id=tool.id,
        version="1.0.0",
        status=ToolVersionStatus.PUBLISHED,
        created_by=user.id,
    )
    db_session.add(tool_version)
    await db_session.commit()
    await db_session.refresh(tool_version)

    now = datetime.now(UTC)

    # 1. Deny due to INACTIVE_TOOL (infrastructure/rollout issue, not agent fault)
    req_infra = ToolRequest(
        organization_id=org.id,
        agent_id=agent.id,
        tool_id=tool.id,
        tool_version_id=tool_version.id,
        decision=GovernanceDecision.DENY,
        arguments={},
        arguments_hash=compute_arguments_hash(tool_version.id, {}),
        violation_codes=[GovernanceViolationCode.INACTIVE_TOOL.value],
        environment="PRODUCTION",
        evaluated_at=now,
    )
    db_session.add(req_infra)

    # 2. Allow that TIMED_OUT during execution
    req_timeout = ToolRequest(
        organization_id=org.id,
        agent_id=agent.id,
        tool_id=tool.id,
        tool_version_id=tool_version.id,
        decision=GovernanceDecision.ALLOW,
        arguments={},
        arguments_hash=compute_arguments_hash(tool_version.id, {}),
        violation_codes=[],
        environment="PRODUCTION",
        evaluated_at=now,
    )
    db_session.add(req_timeout)
    await db_session.commit()
    await db_session.refresh(req_timeout)

    exec_timeout = ToolExecution(
        tool_request_id=req_timeout.id,
        status=ExecutionStatus.TIMED_OUT,
        duration_ms=30000,
        executed_at=now,
    )
    db_session.add(exec_timeout)
    await db_session.commit()

    # Query metrics
    _, _, eligible, _ = await RiskEngineService.get_agent_violation_metrics(db_session, org.id, agent.id, now=now)
    # Both infrastructure requests excluded from eligible count
    assert eligible == 0


@pytest.mark.asyncio
async def test_agent_history_cross_tenant_isolation(db_session: AsyncSession) -> None:
    """Verify strict multi-tenant isolation; org 1 never counts invocations from org 2."""
    uid1 = uuid.uuid4()
    uid2 = uuid.uuid4()
    org1 = Organization(name=f"Org1 {uid1}", slug=f"org1-{uid1}")
    org2 = Organization(name=f"Org2 {uid2}", slug=f"org2-{uid2}")
    db_session.add(org1)
    db_session.add(org2)
    await db_session.commit()
    await db_session.refresh(org1)
    await db_session.refresh(org2)

    user1 = User(
        organization_id=org1.id,
        email=f"user1-{uid1}@example.com",
        password_hash="fake-hash",
        display_name="User 1",
        status=UserStatus.ACTIVE,
        role=Role.ADMIN,
    )
    user2 = User(
        organization_id=org2.id,
        email=f"user2-{uid2}@example.com",
        password_hash="fake-hash",
        display_name="User 2",
        status=UserStatus.ACTIVE,
        role=Role.ADMIN,
    )
    db_session.add(user1)
    db_session.add(user2)
    await db_session.commit()
    await db_session.refresh(user1)
    await db_session.refresh(user2)

    agent1 = Agent(
        organization_id=org1.id,
        owner_user_id=user1.id,
        name="Agent 1",
        slug=f"agent-1-{uid1}",
        model_provider="anthropic",
        model_name="claude-3-5-sonnet",
        status=AgentStatus.ACTIVE,
    )
    tool1 = Tool(
        organization_id=org1.id,
        owner_user_id=user1.id,
        name="Tool 1",
        slug=f"tool-1-{uid1}",
        status=ToolStatus.ACTIVE,
    )
    db_session.add(agent1)
    db_session.add(tool1)
    await db_session.commit()
    await db_session.refresh(agent1)
    await db_session.refresh(tool1)

    tv1 = ToolVersion(
        tool_id=tool1.id,
        version="1.0.0",
        status=ToolVersionStatus.PUBLISHED,
        created_by=user1.id,
    )
    db_session.add(tv1)
    await db_session.commit()
    await db_session.refresh(tv1)

    now = datetime.now(UTC)

    # Org 2 has 10 violations with agent1's ID under org 2
    for _i in range(10):
        req_org2 = ToolRequest(
            organization_id=org2.id,  # Different tenant!
            agent_id=agent1.id,
            tool_id=tool1.id,
            tool_version_id=tv1.id,
            decision=GovernanceDecision.DENY,
            arguments={},
            arguments_hash=compute_arguments_hash(tv1.id, {}),
            violation_codes=[GovernanceViolationCode.PERMISSION_DENIED.value],
            environment="PRODUCTION",
            evaluated_at=now,
        )
        db_session.add(req_org2)
    await db_session.commit()

    # Query metrics for Org 1
    status_org1, rate_org1, eligible_org1, violations_org1 = await RiskEngineService.get_agent_violation_metrics(
        db_session, org1.id, agent1.id, now=now
    )
    assert eligible_org1 == 0
    assert violations_org1 == 0
    assert status_org1 == AgentHistoryStatus.INSUFFICIENT_DATA


# ==============================================================================
# 6. Full Assessment Evaluation and Snapshot Reproducibility
# ==============================================================================


def test_evaluate_risk_complete_assessment_and_reproducibility() -> None:
    """Verify complete RiskEvaluationResult generation and historical snapshot reproducibility."""
    org_id = uuid.uuid4()
    now = datetime.now(UTC)

    # 1. Perform Evaluation
    result = RiskEngineService.evaluate_risk(
        organization_id=org_id,
        agent_risk_tier="HIGH",  # 75.0
        tool_risk_level="CRITICAL",  # 95.0
        tool_access_type="WRITE",  # 30.0
        tool_reversibility="IRREVERSIBLE",  # 40.0
        tool_data_classification="CONFIDENTIAL",  # 60.0
        tool_approval_requirement="REQUIRED",  # 50.0
        arguments={"action": "drop", "force": True},  # DESTRUCTIVE (+60) + OVERRIDE (+35)
        environment="PRODUCTION",  # 80.0
        history_status=AgentHistoryStatus.VALID,
        violation_rate=0.08,  # 8% -> 25.0 points
        total_eligible_invocations=25,
        total_violations=2,
        assessed_at=now,
    )

    # Tool: 0.50*95 + 0.20*30 + 0.30*40 = 65.5
    # Data: 0.70*60 + 0.30*50 = 42.0 + 15.0 = 57.0
    # Agent: 0.60*75 + 0.40*25 = 45.0 + 10.0 = 55.0
    # Context: 0.40*80 + 0.60*(60+35) = 32.0 + 57.0 = 89.0
    # Composite: 0.35*65.5 + 0.25*57.0 + 0.20*55.0 + 0.20*89.0
    #   = 22.925 + 14.25 + 11.0 + 17.8 = 65.975 -> round -> 66
    assert result.subscores.tool == 65.5
    assert result.subscores.data == 57.0
    assert result.subscores.agent == 55.0
    assert result.subscores.context == 89.0
    assert result.risk_score == 66
    assert result.risk_level == RiskLevel.HIGH
    assert len(result.heuristics_matched) == 2
    assert result.scoring_algorithm_version == SCORING_ALGORITHM_VERSION

    # 2. Reproduce using the generated config_snapshot
    reproduced = RiskEngineService.evaluate_risk(
        organization_id=org_id,
        agent_risk_tier="HIGH",
        tool_risk_level="CRITICAL",
        tool_access_type="WRITE",
        tool_reversibility="IRREVERSIBLE",
        tool_data_classification="CONFIDENTIAL",
        tool_approval_requirement="REQUIRED",
        arguments={"action": "drop", "force": True},
        environment="PRODUCTION",
        history_status=AgentHistoryStatus.VALID,
        violation_rate=0.08,
        total_eligible_invocations=25,
        total_violations=2,
        config_snapshot_override=result.config_snapshot,
        assessed_at=now,
    )

    assert reproduced.risk_score == result.risk_score
    assert reproduced.risk_level == result.risk_level
    assert reproduced.subscores.tool == result.subscores.tool
    assert reproduced.subscores.context == result.subscores.context
    assert reproduced.config_snapshot == result.config_snapshot


@pytest.mark.asyncio
async def test_create_and_persist_assessment(db_session: AsyncSession) -> None:
    """Verify persisting RiskAssessment model into database and linking to ToolRequest."""
    uid = uuid.uuid4()
    org = Organization(name=f"Persist Org {uid}", slug=f"persist-org-{uid}")
    db_session.add(org)
    await db_session.commit()
    await db_session.refresh(org)

    user = User(
        organization_id=org.id,
        email=f"user-{uid}@example.com",
        password_hash="fake-hash",
        display_name="Persist User",
        status=UserStatus.ACTIVE,
        role=Role.ADMIN,
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)

    agent = Agent(
        organization_id=org.id,
        owner_user_id=user.id,
        name=f"Agent {uid}",
        slug=f"agent-{uid}",
        model_provider="anthropic",
        model_name="claude-3-5-sonnet",
        status=AgentStatus.ACTIVE,
    )
    tool = Tool(
        organization_id=org.id,
        owner_user_id=user.id,
        name="Tool",
        slug=f"tool-{uid}",
        status=ToolStatus.ACTIVE,
    )
    db_session.add(agent)
    db_session.add(tool)
    await db_session.commit()
    await db_session.refresh(agent)
    await db_session.refresh(tool)

    tool_version = ToolVersion(
        tool_id=tool.id,
        version="1.0.0",
        status=ToolVersionStatus.PUBLISHED,
        created_by=user.id,
    )
    db_session.add(tool_version)
    await db_session.commit()
    await db_session.refresh(tool_version)

    # Create RiskConfiguration and published Version
    config = RiskConfiguration(organization_id=org.id)
    db_session.add(config)
    await db_session.commit()
    await db_session.refresh(config)

    v1 = RiskConfigurationVersion(
        risk_configuration_id=config.id,
        version_number=1,
    )
    db_session.add(v1)
    await db_session.commit()
    await db_session.refresh(v1)

    config.current_version_id = v1.id
    await db_session.commit()

    # ToolRequest
    args = {"query": "SELECT * FROM metrics"}
    req = ToolRequest(
        organization_id=org.id,
        agent_id=agent.id,
        tool_id=tool.id,
        tool_version_id=tool_version.id,
        decision=GovernanceDecision.ALLOW,
        arguments=args,
        arguments_hash=compute_arguments_hash(tool_version.id, args),
        violation_codes=[],
        environment="DEVELOPMENT",
        evaluated_at=datetime.now(UTC),
    )
    db_session.add(req)
    await db_session.commit()
    await db_session.refresh(req)

    # Persist RiskAssessment
    assessment = await RiskEngineService.create_and_persist_assessment(
        db_session=db_session,
        organization_id=org.id,
        agent_id=agent.id,
        agent_risk_tier="LOW",
        tool_id=tool.id,
        tool_version_id=tool_version.id,
        tool_risk_level="LOW",
        tool_access_type="READ",
        tool_reversibility="REVERSIBLE",
        tool_data_classification="PUBLIC",
        tool_approval_requirement="NOT_REQUIRED",
        arguments=args,
        environment="DEVELOPMENT",
        tool_request_id=req.id,
        config_version_id=v1.id,
    )

    assert assessment.id is not None
    assert assessment.tool_request_id == req.id
    assert assessment.config_version_id == v1.id
    assert assessment.risk_level == RiskLevel.LOW
    assert assessment.scoring_algorithm_version == "1.0.0"
    assert "Tool" in assessment.explanation
