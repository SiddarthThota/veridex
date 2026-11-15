"""Concurrency and state isolation tests for Governance Gateway service.

Validates remediation of SEC-01:
- Removal of mutable instance state (_last_policy_evaluations, _last_risk_evaluation).
- Safe concurrent evaluation under high load with interleaved asynchronous operations.
- Immutability of GovernanceEvaluationOutcome objects.
- Zero cross-contamination between concurrent requests across different agents and tenants.
"""

import asyncio
import secrets
import uuid
from collections.abc import Generator
from dataclasses import FrozenInstanceError
from datetime import UTC, datetime
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

import app.users.models  # noqa: F401
from app.agents.models import Agent, AgentEnvironment, AgentRiskTier, AgentStatus
from app.governance.models import GovernanceDecision
from app.governance.schemas import GovernanceEvaluateRequest
from app.governance.service import (
    GovernanceEvaluationOutcome,
    GovernanceService,
    governance_service,
)
from app.risk.models import RiskLevel
from app.risk.schemas import RiskEvaluationResult, SubscoresBreakdown
from app.tools.models import (
    AgentToolPermission,
    Tool,
    ToolAccessType,
    ToolApprovalRequirement,
    ToolDataClassification,
    ToolReversibility,
    ToolRiskLevel,
    ToolStatus,
    ToolVersion,
    ToolVersionStatus,
)


@pytest.fixture(scope="session", autouse=True)
def cleanup_database() -> Generator[None, None, None]:
    """Bypass database initialization for pure unit concurrency tests."""
    yield


def _build_test_harness(
    org_id: uuid.UUID,
    agent_id: uuid.UUID,
    tool_id: uuid.UUID,
    tool_version_id: uuid.UUID,
    agent_status: AgentStatus = AgentStatus.ACTIVE,
    tool_status: ToolStatus = ToolStatus.ACTIVE,
    permission_allowed: bool = True,
    risk_level: ToolRiskLevel = ToolRiskLevel.LOW,
    access_type: ToolAccessType = ToolAccessType.READ,
    approval_requirement: ToolApprovalRequirement = ToolApprovalRequirement.NOT_REQUIRED,
) -> tuple[Agent, Tool, ToolVersion, AgentToolPermission]:
    """Helper creating in-memory entities for concurrency scenarios."""
    now = datetime.now(UTC)
    agent = Agent(
        id=agent_id,
        organization_id=org_id,
        name=f"agent-{agent_id}",
        slug=f"agent-{agent_id}",
        status=agent_status,
        environment=AgentEnvironment.PRODUCTION,
        risk_tier=AgentRiskTier.LOW,
        model_provider="openai",
        model_name="gpt-4o",
        created_at=now,
        updated_at=now,
    )
    tool = Tool(
        id=tool_id,
        organization_id=org_id,
        name=f"tool-{tool_id}",
        slug=f"tool-{tool_id}",
        owner_user_id=uuid.uuid4(),
        status=tool_status,
        risk_level=risk_level,
        access_type=access_type,
        reversibility=ToolReversibility.REVERSIBLE,
        data_classification=ToolDataClassification.INTERNAL,
        approval_requirement=approval_requirement,
        timeout_seconds=30,
        created_at=now,
        updated_at=now,
    )
    tool_version = ToolVersion(
        id=tool_version_id,
        tool_id=tool_id,
        version="1.0.0",
        status=ToolVersionStatus.PUBLISHED,
        input_schema=None,
        created_at=now,
        updated_at=now,
    )
    permission = AgentToolPermission(
        id=uuid.uuid4(),
        agent_id=agent_id,
        tool_id=tool_id,
        allowed=permission_allowed,
        created_at=now,
        updated_at=now,
    )
    return agent, tool, tool_version, permission


@pytest.mark.asyncio
async def test_governance_service_no_mutable_instance_state() -> None:
    """Verify that GovernanceService instance contains no shared request-level state (SEC-01)."""
    service = GovernanceService()
    assert not hasattr(service, "_last_policy_evaluations"), (
        "GovernanceService must NOT have '_last_policy_evaluations' instance variable"
    )
    assert not hasattr(service, "_last_risk_evaluation"), (
        "GovernanceService must NOT have '_last_risk_evaluation' instance variable"
    )

    # Also verify global singleton
    assert not hasattr(governance_service, "_last_policy_evaluations")
    assert not hasattr(governance_service, "_last_risk_evaluation")


@pytest.mark.asyncio
async def test_evaluation_outcome_immutability() -> None:
    """Verify GovernanceEvaluationOutcome is an immutable frozen dataclass."""
    outcome = GovernanceEvaluationOutcome(
        decision=GovernanceDecision.ALLOW,
        violation_codes=[],
        reason="Passed",
        trace_data={"key": "val"},
    )
    assert outcome.decision == GovernanceDecision.ALLOW
    assert outcome.reason == "Passed"

    with pytest.raises(FrozenInstanceError):
        # Attempting to mutate a field must raise FrozenInstanceError
        outcome.decision = GovernanceDecision.DENY  # type: ignore[misc]


@pytest.mark.asyncio
async def test_concurrent_evaluations_no_cross_talk() -> None:
    """Execute 20 concurrent evaluations across different tenants and verify zero state leakage."""
    service = GovernanceService()
    concurrency_count = 20

    scenarios = []
    for i in range(concurrency_count):
        org_id = uuid.uuid4()
        agent_id = uuid.uuid4()
        tool_id = uuid.uuid4()
        tool_version_id = uuid.uuid4()

        # Alternate expected decisions: even numbers ALLOW, odd numbers REQUIRE_APPROVAL
        require_approval = (i % 2 == 1)
        risk_score = 75 if require_approval else 25
        risk_level = RiskLevel.HIGH if require_approval else RiskLevel.LOW
        approval_req = (
            ToolApprovalRequirement.REQUIRED if require_approval else ToolApprovalRequirement.NOT_REQUIRED
        )

        agent, tool, tool_version, perm = _build_test_harness(
            org_id=org_id,
            agent_id=agent_id,
            tool_id=tool_id,
            tool_version_id=tool_version_id,
            approval_requirement=approval_req,
        )
        scenarios.append({
            "idx": i,
            "org_id": org_id,
            "agent_id": agent_id,
            "tool_id": tool_id,
            "tool_version_id": tool_version_id,
            "agent": agent,
            "tool": tool,
            "tool_version": tool_version,
            "permission": perm,
            "risk_score": risk_score,
            "risk_level": risk_level,
            "expected_decision": GovernanceDecision.REQUIRE_APPROVAL if require_approval else GovernanceDecision.ALLOW,
            "unique_marker": f"scenario-marker-{i}-{uuid.uuid4().hex[:8]}",
        })

    scenario_map = {s["org_id"]: s for s in scenarios}

    def fake_evaluate_risk(organization_id: Any, **kwargs: Any) -> RiskEvaluationResult:
        s = scenario_map[organization_id]
        return RiskEvaluationResult(
            risk_score=s["risk_score"],
            risk_level=s["risk_level"],
            scoring_algorithm_version="1.0.0",
            subscores=SubscoresBreakdown(tool=20.0, data=20.0, agent=20.0, context=15.0),
            factor_breakdown={},
            heuristics_matched=[],
            assessed_at=datetime.now(UTC),
            config_version_id=None,
            explanation=s["unique_marker"],
        )

    async def fake_evaluate_policies(
        organization_id: Any, **kwargs: Any
    ) -> tuple[Any, list[Any], list[str], list[dict[str, Any]]]:
        await asyncio.sleep(secrets.SystemRandom().uniform(0.005, 0.02))
        s = scenario_map[organization_id]
        from app.policies.models import PolicyAction

        return (
            PolicyAction.ALLOW,
            [],
            [],
            [{"trace_id": s["unique_marker"]}],
        )

    async def run_scenario(scenario: dict[str, Any]) -> tuple[dict[str, Any], GovernanceEvaluationOutcome]:
        # Construct distinct mock DB session for each scenario
        mock_db = AsyncMock(spec=AsyncSession)

        async def mock_execute(stmt: Any) -> MagicMock:
            # Add non-deterministic async sleep to maximize coroutine interleaving
            await asyncio.sleep(secrets.SystemRandom().uniform(0.005, 0.02))
            stmt_str = str(stmt).lower()
            mock_res = MagicMock()
            if "from agents" in stmt_str or "agents.id" in stmt_str:
                mock_res.scalar_one_or_none.return_value = scenario["agent"]
            elif "from tool_versions" in stmt_str or "tool_versions.id" in stmt_str:
                mock_res.scalar_one_or_none.return_value = scenario["tool_version"]
            elif "from tools" in stmt_str or "tools.id" in stmt_str:
                mock_res.scalar_one_or_none.return_value = scenario["tool"]
            elif "from agent_tool_permissions" in stmt_str:
                mock_res.scalar_one_or_none.return_value = scenario["permission"]
            elif "from risk_configurations" in stmt_str:
                mock_res.scalar_one_or_none.return_value = None
            else:
                mock_res.scalar_one_or_none.return_value = None
            return mock_res

        mock_db.execute = AsyncMock(side_effect=mock_execute)

        outcome = await service._evaluate_policy(
            db=mock_db,
            organization_id=scenario["org_id"],
            agent_id=scenario["agent_id"],
            tool_id=scenario["tool_id"],
            tool_version_id=scenario["tool_version_id"],
            arguments={"marker": scenario["unique_marker"]},
            run_environment="PRODUCTION",
        )
        return scenario, outcome

    with (
        patch(
            "app.risk.service.RiskEngineService.get_agent_violation_metrics",
            new_callable=AsyncMock,
            return_value=("NORMAL", 0.0, 10, 0),
        ),
        patch(
            "app.risk.service.RiskEngineService.evaluate_risk",
            side_effect=fake_evaluate_risk,
        ),
        patch(
            "app.policies.service.policy_service.evaluate_policies",
            side_effect=fake_evaluate_policies,
        ),
    ):
        # Fan out all 20 scenarios simultaneously
        results = await asyncio.gather(*[run_scenario(s) for s in scenarios])

    # Validate complete isolation and exact correspondence for all 20 evaluations
    for scenario, outcome in results:
        marker = scenario["unique_marker"]
        assert outcome.decision == scenario["expected_decision"], (
            f"Scenario {scenario['idx']} failed: expected {scenario['expected_decision']}, got {outcome.decision}"
        )
        assert outcome.tool is not None
        assert outcome.tool.id == scenario["tool_id"]
        assert outcome.tool_version is not None
        assert outcome.tool_version.id == scenario["tool_version_id"]

        assert outcome.risk_evaluation is not None
        assert outcome.risk_evaluation.risk_score == scenario["risk_score"]
        assert outcome.risk_evaluation.explanation == marker, (
            f"Cross-contamination detected in risk evaluation explanation for scenario {scenario['idx']}!"
        )

        matched_policies = outcome.trace_data.get("matched_policies", [])
        assert len(matched_policies) == 1
        assert matched_policies[0]["trace_id"] == marker, (
            f"Cross-contamination detected in policy trace data for scenario {scenario['idx']}!"
        )


@pytest.mark.asyncio
async def test_dry_run_evaluate_concurrency_isolation() -> None:
    """Verify that public evaluate() endpoint handles concurrent requests cleanly."""
    service = GovernanceService()
    org_id = uuid.uuid4()
    agent_id = uuid.uuid4()
    tool_id = uuid.uuid4()
    tool_version_id = uuid.uuid4()

    agent, tool, tool_version, perm = _build_test_harness(
        org_id=org_id,
        agent_id=agent_id,
        tool_id=tool_id,
        tool_version_id=tool_version_id,
    )

    mock_db = AsyncMock(spec=AsyncSession)

    async def mock_execute(stmt: Any) -> MagicMock:
        await asyncio.sleep(0.005)
        stmt_str = str(stmt).lower()
        mock_res = MagicMock()
        if "from agents" in stmt_str:
            mock_res.scalar_one_or_none.return_value = agent
        elif "from tool_versions" in stmt_str:
            mock_res.scalar_one_or_none.return_value = tool_version
        elif "from tools" in stmt_str:
            mock_res.scalar_one_or_none.return_value = tool
        elif "from agent_tool_permissions" in stmt_str:
            mock_res.scalar_one_or_none.return_value = perm
        else:
            mock_res.scalar_one_or_none.return_value = None
        return mock_res

    mock_db.execute = AsyncMock(side_effect=mock_execute)

    mock_risk_eval = RiskEvaluationResult(
        risk_score=20,
        risk_level=RiskLevel.LOW,
        scoring_algorithm_version="1.0.0",
        subscores=SubscoresBreakdown(tool=5.0, data=5.0, agent=5.0, context=5.0),
        factor_breakdown={},
        heuristics_matched=[],
        assessed_at=datetime.now(UTC),
        config_version_id=None,
        explanation="Dry run concurrency test",
    )

    with (
        patch(
            "app.risk.service.RiskEngineService.get_agent_violation_metrics",
            new_callable=AsyncMock,
            return_value=("NORMAL", 0.0, 5, 0),
        ),
        patch("app.risk.service.RiskEngineService.evaluate_risk", return_value=mock_risk_eval),
        patch(
            "app.policies.service.policy_service.evaluate_policies",
            new_callable=AsyncMock,
            return_value=(None, [], [], []),
        ),
    ):

        async def evaluate_task(n: int) -> Any:
            req = GovernanceEvaluateRequest(
                agent_id=agent_id,
                tool_id=tool_id,
                tool_version_id=tool_version_id,
                arguments={"iteration": n},
            )
            return await service.evaluate(mock_db, org_id, req)

        responses = await asyncio.gather(*[evaluate_task(i) for i in range(15)])
        assert len(responses) == 15
        for res in responses:
            assert res.decision == GovernanceDecision.ALLOW
            assert res.approval_required is False
            assert res.tool_id == tool_id
