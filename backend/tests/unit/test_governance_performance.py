"""Unit and regression tests for Phase 8.2 governance evaluation performance monitoring and database indexes."""

import importlib.util
import uuid
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from sqlalchemy import Index

from app.agents.models import Agent, AgentEnvironment, AgentRiskTier, AgentStatus
from app.governance.executor import ToolExecutor
from app.governance.models import (
    AgentRun,
    ApprovalRequest,
    ExecutionStatus,
    GovernanceDecision,
    GovernanceViolationCode,
    RunStatus,
    ToolRequest,
)
from app.governance.schemas import ToolInvocationRequest
from app.governance.service import GovernanceService
from app.risk.models import RiskAssessment
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


def _get_migration_module() -> Any:
    migration_path = (
        Path(__file__).resolve().parent.parent.parent
        / "alembic"
        / "versions"
        / "e59b2f6a9c40_add_eval_duration_and_governance_indexes.py"
    )
    spec = importlib.util.spec_from_file_location("migration_8_2", migration_path)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


# ==============================================================================
# A. Model and Schema Validation Tests
# ==============================================================================


def test_tool_request_evaluation_duration_ms_field() -> None:
    """Test ToolRequest evaluation_duration_ms accepts float and None, and rejects negative values."""
    now = datetime.now(UTC)
    req_id = uuid.uuid4()
    org_id = uuid.uuid4()
    agent_id = uuid.uuid4()
    tool_id = uuid.uuid4()
    version_id = uuid.uuid4()

    # 1. Accepts None (historical record compatibility)
    req_historical = ToolRequest(
        id=req_id,
        organization_id=org_id,
        agent_id=agent_id,
        tool_id=tool_id,
        tool_version_id=version_id,
        decision=GovernanceDecision.ALLOW,
        arguments={"x": 1},
        arguments_hash="hash123",
        violation_codes=[],
        environment="development",
        evaluated_at=now,
        evaluation_duration_ms=None,
    )
    assert req_historical.evaluation_duration_ms is None

    # 2. Accepts fractional sub-millisecond precision
    req_measured = ToolRequest(
        id=uuid.uuid4(),
        organization_id=org_id,
        agent_id=agent_id,
        tool_id=tool_id,
        tool_version_id=version_id,
        decision=GovernanceDecision.ALLOW,
        arguments={"x": 1},
        arguments_hash="hash123",
        violation_codes=[],
        environment="development",
        evaluated_at=now,
        evaluation_duration_ms=14.872341,
    )
    assert req_measured.evaluation_duration_ms == 14.872341

    # 3. Accepts zero
    req_zero = ToolRequest(
        id=uuid.uuid4(),
        organization_id=org_id,
        agent_id=agent_id,
        tool_id=tool_id,
        tool_version_id=version_id,
        decision=GovernanceDecision.ALLOW,
        arguments={"x": 1},
        arguments_hash="hash123",
        violation_codes=[],
        environment="development",
        evaluated_at=now,
        evaluation_duration_ms=0.0,
    )
    assert req_zero.evaluation_duration_ms == 0.0

    # 4. Rejects negative values via validator
    with pytest.raises(ValueError, match="must be non-negative"):
        ToolRequest(
            id=uuid.uuid4(),
            organization_id=org_id,
            agent_id=agent_id,
            tool_id=tool_id,
            tool_version_id=version_id,
            decision=GovernanceDecision.ALLOW,
            arguments={"x": 1},
            arguments_hash="hash123",
            violation_codes=[],
            environment="development",
            evaluated_at=now,
            evaluation_duration_ms=-0.001,
        )


# ==============================================================================
# B. Database Index Strategy & Table Args Verification
# ==============================================================================


def test_database_indexes_definitions() -> None:
    """Verify that all required Phase 8.2 composite indexes are declared on models with correct columns."""
    # 1. ToolRequest composite indexes
    tool_request_indexes = {idx.name: idx for idx in ToolRequest.__table_args__ if isinstance(idx, Index)}

    assert "ix_tool_requests_org_evaluated" in tool_request_indexes
    idx_org_eval = tool_request_indexes["ix_tool_requests_org_evaluated"]
    assert [c.name for c in idx_org_eval.columns] == ["organization_id", "evaluated_at"]

    assert "ix_tool_requests_org_decision_evaluated" in tool_request_indexes
    idx_org_dec = tool_request_indexes["ix_tool_requests_org_decision_evaluated"]
    assert [c.name for c in idx_org_dec.columns] == ["organization_id", "decision", "evaluated_at"]

    assert "ix_tool_requests_org_agent_evaluated" in tool_request_indexes
    idx_org_agent = tool_request_indexes["ix_tool_requests_org_agent_evaluated"]
    assert [c.name for c in idx_org_agent.columns] == ["organization_id", "agent_id", "evaluated_at"]

    assert "ix_tool_requests_org_tool_evaluated" in tool_request_indexes
    idx_org_tool = tool_request_indexes["ix_tool_requests_org_tool_evaluated"]
    assert [c.name for c in idx_org_tool.columns] == ["organization_id", "tool_id", "evaluated_at"]

    # 2. RiskAssessment composite index
    risk_assessment_indexes = {idx.name: idx for idx in RiskAssessment.__table_args__ if isinstance(idx, Index)}
    assert "ix_risk_assessments_org_assessed" in risk_assessment_indexes
    idx_risk = risk_assessment_indexes["ix_risk_assessments_org_assessed"]
    assert [c.name for c in idx_risk.columns] == ["organization_id", "assessed_at"]

    # 3. ApprovalRequest composite index
    approval_indexes = {idx.name: idx for idx in ApprovalRequest.__table_args__ if isinstance(idx, Index)}
    assert "ix_approval_requests_org_created" in approval_indexes
    idx_appr = approval_indexes["ix_approval_requests_org_created"]
    assert [c.name for c in idx_appr.columns] == ["organization_id", "created_at"]


def test_alembic_migration_metadata_and_reversibility() -> None:
    """Verify Alembic migration revision chain and upgrade/downgrade structure."""
    migration_8_2 = _get_migration_module()
    assert migration_8_2.revision == "e59b2f6a9c40"
    assert migration_8_2.down_revision == "d48a1e5f8b30"
    assert hasattr(migration_8_2, "upgrade")
    assert hasattr(migration_8_2, "downgrade")


# ==============================================================================
# C. Governance Evaluation Latency Measurement & Persistence Tests
# ==============================================================================


def _setup_mock_entities(
    org_id: uuid.UUID,
    agent_id: uuid.UUID,
    tool_id: uuid.UUID,
    tool_ver_id: uuid.UUID,
    access_type: ToolAccessType = ToolAccessType.READ,
    approval_req: ToolApprovalRequirement = ToolApprovalRequirement.NOT_REQUIRED,
) -> tuple[Agent, Tool, ToolVersion, AgentToolPermission]:
    now = datetime.now(UTC)
    agent = Agent(
        id=agent_id,
        organization_id=org_id,
        name="perf-agent",
        slug="perf-agent",
        status=AgentStatus.ACTIVE,
        environment=AgentEnvironment.DEVELOPMENT,
        risk_tier=AgentRiskTier.LOW,
        model_provider="openai",
        model_name="gpt-4o",
        created_at=now,
        updated_at=now,
    )
    tool = Tool(
        id=tool_id,
        organization_id=org_id,
        name="perf-tool",
        slug="echo",
        owner_user_id=uuid.uuid4(),
        status=ToolStatus.ACTIVE,
        risk_level=ToolRiskLevel.LOW,
        access_type=access_type,
        reversibility=ToolReversibility.REVERSIBLE,
        data_classification=ToolDataClassification.INTERNAL,
        approval_requirement=approval_req,
        timeout_seconds=10,
        created_at=now,
        updated_at=now,
    )
    tool_ver = ToolVersion(
        id=tool_ver_id,
        tool_id=tool_id,
        version="1.0.0",
        input_schema=None,
        status=ToolVersionStatus.PUBLISHED,
        created_at=now,
        updated_at=now,
    )
    perm = AgentToolPermission(
        id=uuid.uuid4(),
        agent_id=agent_id,
        tool_id=tool_id,
        allowed=True,
        created_by=uuid.uuid4(),
        created_at=now,
        updated_at=now,
    )
    return agent, tool, tool_ver, perm


def _make_perf_mock_db(
    org_id: uuid.UUID,
    run_id: uuid.UUID,
    agent: Agent,
    tool: Tool | None,
    tool_ver: ToolVersion | None,
    perm: AgentToolPermission | None,
) -> tuple[AsyncMock, list[ToolRequest]]:
    db = AsyncMock()
    persisted_requests: list[ToolRequest] = []

    run = AgentRun(
        id=run_id,
        organization_id=org_id,
        agent_id=agent.id,
        status=RunStatus.RUNNING,
        environment="development",
        started_at=datetime.now(UTC),
    )

    def execute_side_effect(query: Any) -> Any:
        query_str = str(query).lower()
        mock_result = MagicMock()

        if "from agent_runs" in query_str:
            mock_result.scalar_one_or_none.return_value = run
        elif "from tool_requests" in query_str:
            mock_result.scalar_one_or_none.return_value = None
        elif "from agents" in query_str:
            mock_result.scalar_one_or_none.return_value = agent
        elif "from tools" in query_str:
            mock_result.scalar_one_or_none.return_value = tool
        elif "from tool_versions" in query_str:
            mock_result.scalar_one_or_none.return_value = tool_ver
        elif "from agent_tool_permissions" in query_str:
            mock_result.scalar_one_or_none.return_value = perm
        elif "from risk_configurations" in query_str or "from policy_versions" in query_str:
            mock_result.scalar_one_or_none.return_value = None
        else:
            mock_result.scalar_one_or_none.return_value = None

        return mock_result

    def sync_add(obj: Any) -> None:
        if isinstance(obj, ToolRequest):
            persisted_requests.append(obj)
        if hasattr(obj, "id") and getattr(obj, "id", None) is None:
            obj.id = uuid.uuid4()

    db.add = MagicMock(side_effect=sync_add)
    db.flush = AsyncMock()
    db.commit = AsyncMock()
    db.rollback = AsyncMock()
    db.execute.side_effect = execute_side_effect
    return db, persisted_requests


@pytest.mark.asyncio
async def test_invoke_tool_persists_evaluation_duration_on_allow() -> None:
    """Test that ALLOW decision persists deterministic evaluation duration excluding tool execution."""
    org_id = uuid.uuid4()
    run_id = uuid.uuid4()
    agent_id = uuid.uuid4()
    tool_id = uuid.uuid4()
    tool_ver_id = uuid.uuid4()

    agent, tool, tool_ver, perm = _setup_mock_entities(org_id, agent_id, tool_id, tool_ver_id)
    db, persisted_requests = _make_perf_mock_db(org_id, run_id, agent, tool, tool_ver, perm)

    executor = ToolExecutor()
    service = GovernanceService(executor=executor)

    # Deterministic clock mocking: 12.5 milliseconds elapsed in _evaluate_policy
    # Start: 1_000_000_000 ns, End: 1_012_500_000 ns -> 12.5 ms
    clock_values = [1_000_000_000, 1_012_500_000]

    with patch("time.perf_counter_ns", side_effect=clock_values):
        response = await service.invoke_tool(
            db=db,
            organization_id=org_id,
            run_id=run_id,
            request=ToolInvocationRequest(
                agent_id=agent_id,
                tool_id=tool_id,
                tool_version_id=tool_ver_id,
                arguments={"msg": "timing test"},
            ),
        )

    assert response.decision == GovernanceDecision.ALLOW
    assert response.execution_status == ExecutionStatus.SUCCESS
    assert len(persisted_requests) == 1

    tool_req = persisted_requests[0]
    assert tool_req.evaluation_duration_ms == 12.5
    assert response.evaluation_duration_ms == 12.5


@pytest.mark.asyncio
async def test_invoke_tool_persists_duration_on_mandatory_deny() -> None:
    """Test that mandatory platform check DENY (e.g. unknown tool) persists evaluation duration."""
    org_id = uuid.uuid4()
    run_id = uuid.uuid4()
    agent_id = uuid.uuid4()
    tool_id = uuid.uuid4()
    tool_ver_id = uuid.uuid4()

    agent, _, _, _ = _setup_mock_entities(org_id, agent_id, tool_id, tool_ver_id)
    # Tool not found -> DENY UNKNOWN_TOOL
    db, persisted_requests = _make_perf_mock_db(org_id, run_id, agent, None, None, None)

    service = GovernanceService()
    clock_values = [2_000_000_000, 2_005_250_000]  # 5.25 ms

    with patch("time.perf_counter_ns", side_effect=clock_values):
        response = await service.invoke_tool(
            db=db,
            organization_id=org_id,
            run_id=run_id,
            request=ToolInvocationRequest(
                agent_id=agent_id,
                tool_id=tool_id,
                tool_version_id=tool_ver_id,
                arguments={},
            ),
        )

    assert response.decision == GovernanceDecision.DENY
    assert GovernanceViolationCode.UNKNOWN_TOOL in response.violation_codes
    assert len(persisted_requests) == 1

    tool_req = persisted_requests[0]
    assert tool_req.evaluation_duration_ms == 5.25
    assert response.evaluation_duration_ms == 5.25


@pytest.mark.asyncio
async def test_invoke_tool_persists_duration_on_require_approval() -> None:
    """Test that REQUIRE_APPROVAL outcome persists evaluation duration before human review."""
    org_id = uuid.uuid4()
    run_id = uuid.uuid4()
    agent_id = uuid.uuid4()
    tool_id = uuid.uuid4()
    tool_ver_id = uuid.uuid4()

    agent, tool, tool_ver, perm = _setup_mock_entities(
        org_id,
        agent_id,
        tool_id,
        tool_ver_id,
        approval_req=ToolApprovalRequirement.REQUIRED,
    )
    db, persisted_requests = _make_perf_mock_db(org_id, run_id, agent, tool, tool_ver, perm)

    service = GovernanceService()
    clock_values = [3_000_000_000, 3_018_750_000]  # 18.75 ms

    with patch("time.perf_counter_ns", side_effect=clock_values):
        response = await service.invoke_tool(
            db=db,
            organization_id=org_id,
            run_id=run_id,
            request=ToolInvocationRequest(
                agent_id=agent_id,
                tool_id=tool_id,
                tool_version_id=tool_ver_id,
                arguments={},
            ),
        )

    assert response.decision == GovernanceDecision.REQUIRE_APPROVAL
    assert len(persisted_requests) == 1

    tool_req = persisted_requests[0]
    assert tool_req.evaluation_duration_ms == 18.75
    assert response.evaluation_duration_ms == 18.75


@pytest.mark.asyncio
async def test_invoke_tool_duration_excludes_tool_execution() -> None:
    """Verify that tool execution time (e.g. 100ms slow tool) is strictly excluded
    from governance evaluation duration.
    """
    org_id = uuid.uuid4()
    run_id = uuid.uuid4()
    agent_id = uuid.uuid4()
    tool_id = uuid.uuid4()
    tool_ver_id = uuid.uuid4()

    agent, tool, tool_ver, perm = _setup_mock_entities(org_id, agent_id, tool_id, tool_ver_id)
    db, persisted_requests = _make_perf_mock_db(org_id, run_id, agent, tool, tool_ver, perm)

    # Slow tool executor (simulating 150ms tool runtime)
    executor = ToolExecutor()
    mock_execute = AsyncMock(
        return_value=MagicMock(
            status=ExecutionStatus.SUCCESS,
            result={"output": "slow-done"},
            error_message=None,
            duration_ms=150.0,
        )
    )
    executor.execute = mock_execute  # type: ignore[method-assign]
    service = GovernanceService(executor=executor)

    # Clock: evaluation pipeline takes only 8.0 ms
    clock_values = [5_000_000_000, 5_008_000_000]

    with patch("time.perf_counter_ns", side_effect=clock_values):
        response = await service.invoke_tool(
            db=db,
            organization_id=org_id,
            run_id=run_id,
            request=ToolInvocationRequest(
                agent_id=agent_id,
                tool_id=tool_id,
                tool_version_id=tool_ver_id,
                arguments={"heavy": "operation"},
            ),
        )

    assert response.decision == GovernanceDecision.ALLOW
    tool_req = persisted_requests[0]

    # Evaluation duration must be 8.0 ms, NOT including the 150.0 ms tool execution
    assert tool_req.evaluation_duration_ms == 8.0
    assert response.evaluation_duration_ms == 8.0


@pytest.mark.asyncio
async def test_invoke_tool_persists_duration_on_risk_deny() -> None:
    """Test that DENY caused by risk engine score exceeding threshold persists evaluation duration."""
    org_id = uuid.uuid4()
    run_id = uuid.uuid4()
    agent_id = uuid.uuid4()
    tool_id = uuid.uuid4()
    tool_ver_id = uuid.uuid4()

    agent, tool, tool_ver, perm = _setup_mock_entities(org_id, agent_id, tool_id, tool_ver_id)
    db, persisted_requests = _make_perf_mock_db(org_id, run_id, agent, tool, tool_ver, perm)

    service = GovernanceService()
    service._evaluate_policy = AsyncMock(  # type: ignore[method-assign]
        return_value=(
            GovernanceDecision.DENY,
            [GovernanceViolationCode.CRITICAL_RISK_THRESHOLD_EXCEEDED],
            "Risk score (95) exceeds critical deny threshold",
            tool,
            tool_ver,
        )
    )

    clock_values = [6_000_000_000, 6_022_400_000]  # 22.4 ms
    with patch("time.perf_counter_ns", side_effect=clock_values):
        response = await service.invoke_tool(
            db=db,
            organization_id=org_id,
            run_id=run_id,
            request=ToolInvocationRequest(
                agent_id=agent_id,
                tool_id=tool_id,
                tool_version_id=tool_ver_id,
                arguments={"risky": "payload"},
            ),
        )

    assert response.decision == GovernanceDecision.DENY
    assert len(persisted_requests) == 1
    tool_req = persisted_requests[0]
    assert tool_req.evaluation_duration_ms == 22.4
    assert response.evaluation_duration_ms == 22.4


@pytest.mark.asyncio
async def test_invoke_tool_persists_duration_on_policy_deny() -> None:
    """Test that DENY caused by declarative policy evaluation persists evaluation duration."""
    org_id = uuid.uuid4()
    run_id = uuid.uuid4()
    agent_id = uuid.uuid4()
    tool_id = uuid.uuid4()
    tool_ver_id = uuid.uuid4()

    agent, tool, tool_ver, perm = _setup_mock_entities(org_id, agent_id, tool_id, tool_ver_id)
    db, persisted_requests = _make_perf_mock_db(org_id, run_id, agent, tool, tool_ver, perm)

    service = GovernanceService()
    service._evaluate_policy = AsyncMock(  # type: ignore[method-assign]
        return_value=(
            GovernanceDecision.DENY,
            ["PROD_RESTRICTED_TOOL_POLICY"],
            "Denied by active organization policy: Production Restricted Tools",
            tool,
            tool_ver,
        )
    )

    clock_values = [7_000_000_000, 7_014_150_000]  # 14.15 ms
    with patch("time.perf_counter_ns", side_effect=clock_values):
        response = await service.invoke_tool(
            db=db,
            organization_id=org_id,
            run_id=run_id,
            request=ToolInvocationRequest(
                agent_id=agent_id,
                tool_id=tool_id,
                tool_version_id=tool_ver_id,
                arguments={"action": "restricted_prod_op"},
            ),
        )

    assert response.decision == GovernanceDecision.DENY
    assert len(persisted_requests) == 1
    tool_req = persisted_requests[0]
    assert tool_req.evaluation_duration_ms == 14.15
    assert response.evaluation_duration_ms == 14.15
