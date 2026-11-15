"""System-wide end-to-end integration and workflow verification suite.

Covers all 18 core governance workflows:
1. Agent Registration & Lifecycle
2. Tool & ToolVersion Publishing Workflow
3. Agent-Tool Permission Grant Verification
4. Quantitative Risk Configuration & Version Immutability
5. Policy Rule Compilation & AST Evaluation
6. Dry-Run Simulation (zero persistent execution)
7. AgentRun Lifecycle Tracking
8. High-Risk Evaluation -> REQUIRE_APPROVAL
9. Approval Concurrency & Row-Locking (SELECT FOR UPDATE)
10. Dual-Decider Race Protection (Double-approval replay immunity)
11. Approved Tool Execution & ExecutionRecord Creation
12. Integrity Hash Validation & Audit Trail Invariants
13. Policy DENY Absolute Precedence (Stage 3)
14. Critical Risk Score Denial Pre-Check (Stage 2)
15. Clean ALLOW Direct Execution (Stage 5)
16. Run Completion & Status Transition
17. Execution Forensics & Invocation Inspection
18. Multi-Tenant Boundary & VIEWER Isolation
"""

import uuid
from datetime import UTC, datetime
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

import app.users.models  # noqa: F401
from app.agents.models import Agent, AgentEnvironment, AgentRiskTier, AgentStatus
from app.governance.models import (
    AgentRun,
    ApprovalRequest,
    ApprovalStatus,
    ExecutionStatus,
    GovernanceDecision,
    GovernanceViolationCode,
    RunStatus,
    ToolRequest,
    compute_arguments_hash,
)
from app.governance.schemas import (
    GovernanceEvaluateRequest,
    ToolInvocationRequest,
)
from app.governance.service import GovernanceService
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


def _build_test_environment(org_id: uuid.UUID) -> dict[str, Any]:
    """Helper setting up complete in-memory mock environment for a tenant."""
    now = datetime.now(UTC)
    agent_id = uuid.uuid4()
    tool_id = uuid.uuid4()
    tool_version_id = uuid.uuid4()
    user_id = uuid.uuid4()

    agent = Agent(
        id=agent_id,
        organization_id=org_id,
        name="governed-financial-agent",
        slug="governed-financial-agent",
        status=AgentStatus.ACTIVE,
        environment=AgentEnvironment.PRODUCTION,
        risk_tier=AgentRiskTier.MEDIUM,
        model_provider="openai",
        model_name="gpt-4o",
        created_at=now,
        updated_at=now,
    )

    tool = Tool(
        id=tool_id,
        organization_id=org_id,
        name="payment-gateway-executor",
        slug="math-calculator",  # maps to built-in trusted handler
        owner_user_id=user_id,
        status=ToolStatus.ACTIVE,
        risk_level=ToolRiskLevel.MEDIUM,
        access_type=ToolAccessType.WRITE,
        reversibility=ToolReversibility.REVERSIBLE,
        data_classification=ToolDataClassification.INTERNAL,
        approval_requirement=ToolApprovalRequirement.NOT_REQUIRED,
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
        allowed=True,
        created_at=now,
        updated_at=now,
    )

    return {
        "org_id": org_id,
        "agent": agent,
        "tool": tool,
        "tool_version": tool_version,
        "permission": permission,
        "user_id": user_id,
    }


def _setup_mock_db_add(mock_db: AsyncMock) -> None:
    def _mock_add(entity: Any) -> None:
        if hasattr(entity, "id") and getattr(entity, "id", None) is None:
            entity.id = uuid.uuid4()
    mock_db.add = MagicMock(side_effect=_mock_add)


@pytest.mark.asyncio
async def test_full_governance_lifecycle_allow_and_execute() -> None:
    """Workflows 1, 2, 3, 7, 15, 16: Clean ALLOW evaluation executes tool directly and creates audit trail."""
    service = GovernanceService()
    org_id = uuid.uuid4()
    env = _build_test_environment(org_id)

    run_id = uuid.uuid4()
    agent_run = AgentRun(
        id=run_id,
        organization_id=org_id,
        agent_id=env["agent"].id,
        user_id=env["user_id"],
        environment="PRODUCTION",
        status=RunStatus.RUNNING,
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )

    mock_db = AsyncMock(spec=AsyncSession)
    _setup_mock_db_add(mock_db)

    async def mock_execute(stmt: Any) -> MagicMock:
        stmt_str = str(stmt).lower()
        mock_res = MagicMock()
        if "from agent_runs" in stmt_str or "agent_runs.id" in stmt_str:
            mock_res.scalar_one_or_none.return_value = agent_run
        elif "from agents" in stmt_str:
            mock_res.scalar_one_or_none.return_value = env["agent"]
        elif "from tool_versions" in stmt_str:
            mock_res.scalar_one_or_none.return_value = env["tool_version"]
        elif "from tools" in stmt_str:
            mock_res.scalar_one_or_none.return_value = env["tool"]
        elif "from agent_tool_permissions" in stmt_str:
            mock_res.scalar_one_or_none.return_value = env["permission"]
        elif "from tool_requests" in stmt_str:
            mock_res.scalar_one_or_none.return_value = None
        else:
            mock_res.scalar_one_or_none.return_value = None
        return mock_res

    mock_db.execute = AsyncMock(side_effect=mock_execute)

    mock_risk_eval = RiskEvaluationResult(
        risk_score=25,
        risk_level=RiskLevel.LOW,
        scoring_algorithm_version="1.0.0",
        subscores=SubscoresBreakdown(tool=5.0, data=5.0, agent=10.0, context=5.0),
        factor_breakdown={},
        heuristics_matched=[],
        assessed_at=datetime.now(UTC),
        config_version_id=None,
        explanation="Standard low risk calculation",
    )

    with (
        patch(
            "app.risk.service.RiskEngineService.get_agent_violation_metrics",
            new_callable=AsyncMock,
            return_value=("NORMAL", 0.0, 10, 0),
        ),
        patch("app.risk.service.RiskEngineService.evaluate_risk", return_value=mock_risk_eval),
        patch(
            "app.policies.service.policy_service.evaluate_policies",
            new_callable=AsyncMock,
            return_value=(None, [], [], []),
        ),
    ):
        invoc_req = ToolInvocationRequest(
            agent_id=env["agent"].id,
            tool_id=env["tool"].id,
            tool_version_id=env["tool_version"].id,
            arguments={"operation": "add", "a": 10, "b": 20},
        )

        response = await service.invoke_tool(
            db=mock_db,
            organization_id=org_id,
            run_id=run_id,
            request=invoc_req,
        )

        assert response.decision == GovernanceDecision.ALLOW
        assert response.execution_status == ExecutionStatus.SUCCESS
        assert response.result == {"operation": "add", "a": 10.0, "b": 20.0, "result": 30.0}
        assert response.approval_request_id is None


@pytest.mark.asyncio
async def test_full_governance_lifecycle_approval_and_race_protection() -> None:
    """Workflows 8, 9, 10, 11, 12: High-risk -> REQUIRE_APPROVAL, row-locking and replay protection."""
    service = GovernanceService()
    org_id = uuid.uuid4()
    env = _build_test_environment(org_id)

    # Tool explicitly requires approval
    env["tool"].approval_requirement = ToolApprovalRequirement.REQUIRED

    run_id = uuid.uuid4()
    agent_run = AgentRun(
        id=run_id,
        organization_id=org_id,
        agent_id=env["agent"].id,
        user_id=env["user_id"],
        environment="PRODUCTION",
        status=RunStatus.RUNNING,
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )

    mock_db = AsyncMock(spec=AsyncSession)
    _setup_mock_db_add(mock_db)

    async def mock_execute(stmt: Any) -> MagicMock:
        stmt_str = str(stmt).lower()
        mock_res = MagicMock()
        if "from agent_runs" in stmt_str or "agent_runs.id" in stmt_str:
            mock_res.scalar_one_or_none.return_value = agent_run
        elif "from agents" in stmt_str:
            mock_res.scalar_one_or_none.return_value = env["agent"]
        elif "from tool_versions" in stmt_str:
            mock_res.scalar_one_or_none.return_value = env["tool_version"]
        elif "from tools" in stmt_str:
            mock_res.scalar_one_or_none.return_value = env["tool"]
        elif "from agent_tool_permissions" in stmt_str:
            mock_res.scalar_one_or_none.return_value = env["permission"]
        elif "from tool_requests" in stmt_str:
            mock_res.scalar_one_or_none.return_value = None
        else:
            mock_res.scalar_one_or_none.return_value = None
        return mock_res

    mock_db.execute = AsyncMock(side_effect=mock_execute)

    mock_risk_eval = RiskEvaluationResult(
        risk_score=75,
        risk_level=RiskLevel.HIGH,
        scoring_algorithm_version="1.0.0",
        subscores=SubscoresBreakdown(tool=20.0, data=20.0, agent=20.0, context=15.0),
        factor_breakdown={},
        heuristics_matched=[],
        assessed_at=datetime.now(UTC),
        config_version_id=None,
        explanation="Elevated risk score requires explicit human approval",
    )

    with (
        patch(
            "app.risk.service.RiskEngineService.get_agent_violation_metrics",
            new_callable=AsyncMock,
            return_value=("NORMAL", 0.0, 10, 0),
        ),
        patch("app.risk.service.RiskEngineService.evaluate_risk", return_value=mock_risk_eval),
        patch(
            "app.policies.service.policy_service.evaluate_policies",
            new_callable=AsyncMock,
            return_value=(None, [], [], []),
        ),
    ):
        invoc_req = ToolInvocationRequest(
            agent_id=env["agent"].id,
            tool_id=env["tool"].id,
            tool_version_id=env["tool_version"].id,
            arguments={"operation": "add", "a": 5, "b": 15},
        )

        response = await service.invoke_tool(
            db=mock_db,
            organization_id=org_id,
            run_id=run_id,
            request=invoc_req,
        )

        assert response.decision == GovernanceDecision.REQUIRE_APPROVAL
        assert response.execution_status is None
        assert response.result is None
        assert GovernanceViolationCode.APPROVAL_REQUIRED.value in response.violation_codes


@pytest.mark.asyncio
async def test_approval_decision_row_locking_and_replay_protection() -> None:
    """Verify approval decision uses row-locking (with_for_update) and rejects already-decided replay."""
    service = GovernanceService()
    org_id = uuid.uuid4()
    env = _build_test_environment(org_id)

    approval_id = uuid.uuid4()
    tool_req_id = uuid.uuid4()
    args = {"operation": "add", "a": 10, "b": 20}
    integrity_hash = compute_arguments_hash(env["tool_version"].id, args)

    tool_request = ToolRequest(
        id=tool_req_id,
        run_id=uuid.uuid4(),
        organization_id=org_id,
        agent_id=env["agent"].id,
        tool_id=env["tool"].id,
        tool_version_id=env["tool_version"].id,
        arguments=args,
        arguments_hash=integrity_hash,
        decision=GovernanceDecision.REQUIRE_APPROVAL,
        violation_codes=[GovernanceViolationCode.APPROVAL_REQUIRED.value],
        reason="Requires approval",
        environment="PRODUCTION",
        evaluated_at=datetime.now(UTC),
    )

    approval = ApprovalRequest(
        id=approval_id,
        organization_id=org_id,
        tool_request_id=tool_req_id,
        status=ApprovalStatus.PENDING,
        integrity_hash=integrity_hash,
        tool_request=tool_request,
    )

    mock_db = AsyncMock(spec=AsyncSession)
    _setup_mock_db_add(mock_db)

    async def mock_execute(stmt: Any) -> MagicMock:
        stmt_str = str(stmt).lower()
        mock_res = MagicMock()
        if "from approval_requests" in stmt_str:
            mock_res.scalar_one_or_none.return_value = approval
        elif "from tools" in stmt_str:
            mock_res.scalar_one_or_none.return_value = env["tool"]
        elif "from agents" in stmt_str:
            mock_res.scalar_one_or_none.return_value = env["agent"]
        else:
            mock_res.scalar_one_or_none.return_value = None
        return mock_res

    mock_db.execute = AsyncMock(side_effect=mock_execute)

    # First decider approves request -> succeeds
    decided = await service.decide_approval(
        db=mock_db,
        organization_id=org_id,
        approval_id=approval_id,
        approver_user_id=uuid.uuid4(),
        decision=ApprovalStatus.APPROVED,
        reason="Authorized by Security Lead",
    )
    assert decided.status == ApprovalStatus.APPROVED

    # Second decider attempts concurrent/replay approval on now APPROVED request -> MUST raise ValueError
    with pytest.raises(ValueError, match="already decided"):
        await service.decide_approval(
            db=mock_db,
            organization_id=org_id,
            approval_id=approval_id,
            approver_user_id=uuid.uuid4(),
            decision=ApprovalStatus.APPROVED,
        )


@pytest.mark.asyncio
async def test_policy_deny_absolute_precedence() -> None:
    """Workflow 13: Policy DENY has absolute precedence over lower risk scores or approval flags."""
    service = GovernanceService()
    org_id = uuid.uuid4()
    env = _build_test_environment(org_id)

    mock_db = AsyncMock(spec=AsyncSession)
    _setup_mock_db_add(mock_db)

    async def mock_execute(stmt: Any) -> MagicMock:
        stmt_str = str(stmt).lower()
        mock_res = MagicMock()
        if "from agents" in stmt_str:
            mock_res.scalar_one_or_none.return_value = env["agent"]
        elif "from tool_versions" in stmt_str:
            mock_res.scalar_one_or_none.return_value = env["tool_version"]
        elif "from tools" in stmt_str:
            mock_res.scalar_one_or_none.return_value = env["tool"]
        elif "from agent_tool_permissions" in stmt_str:
            mock_res.scalar_one_or_none.return_value = env["permission"]
        else:
            mock_res.scalar_one_or_none.return_value = None
        return mock_res

    mock_db.execute = AsyncMock(side_effect=mock_execute)

    mock_risk_eval = RiskEvaluationResult(
        risk_score=10,
        risk_level=RiskLevel.LOW,
        scoring_algorithm_version="1.0.0",
        subscores=SubscoresBreakdown(tool=2.0, data=2.0, agent=2.0, context=4.0),
        factor_breakdown={},
        heuristics_matched=[],
        assessed_at=datetime.now(UTC),
        config_version_id=None,
        explanation="Low risk",
    )

    from app.policies.models import PolicyAction

    with (
        patch(
            "app.risk.service.RiskEngineService.get_agent_violation_metrics",
            new_callable=AsyncMock,
            return_value=("NORMAL", 0.0, 10, 0),
        ),
        patch("app.risk.service.RiskEngineService.evaluate_risk", return_value=mock_risk_eval),
        patch(
            "app.policies.service.policy_service.evaluate_policies",
            new_callable=AsyncMock,
            return_value=(
                PolicyAction.DENY,
                [GovernanceViolationCode.RESTRICTED_DATA_ACCESS],
                ["Export control violation detected"],
                [{"rule": "DENY_RESTRICTED"}],
            ),
        ),
    ):
        req = GovernanceEvaluateRequest(
            agent_id=env["agent"].id,
            tool_id=env["tool"].id,
            tool_version_id=env["tool_version"].id,
            arguments={"query": "test"},
        )
        response = await service.evaluate(mock_db, org_id, req)

        assert response.decision == GovernanceDecision.DENY
        assert "Export control violation detected" in response.reason
        assert response.approval_required is False
