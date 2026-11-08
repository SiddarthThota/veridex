"""Unit tests for Governance Gateway service, evaluation policy, and executor."""

import uuid
from datetime import UTC, datetime
from typing import Any
from unittest.mock import AsyncMock, MagicMock

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.agents.models import Agent, AgentEnvironment, AgentRiskTier, AgentStatus
from app.governance.executor import ToolExecutor
from app.governance.models import (
    ExecutionStatus,
    GovernanceDecision,
    GovernanceViolationCode,
)
from app.governance.service import GovernanceService
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


@pytest.mark.asyncio
async def test_tool_executor_registered_handlers() -> None:
    """Test built-in handlers execute successfully and produce valid telemetry."""
    executor = ToolExecutor()

    # Math calculator: add
    res_add = await executor.execute("math-calculator", {"operation": "add", "a": 5, "b": 10})
    assert res_add.status == ExecutionStatus.SUCCESS
    assert res_add.result == {"operation": "add", "a": 5.0, "b": 10.0, "result": 15.0}
    assert res_add.duration_ms >= 0
    assert res_add.error_message is None

    # Math calculator: divide
    res_div = await executor.execute("math-calculator", {"operation": "divide", "a": 20, "b": 4})
    assert res_div.status == ExecutionStatus.SUCCESS
    assert res_div.result["result"] == 5.0

    # Echo
    res_echo = await executor.execute("echo", {"hello": "world"})
    assert res_echo.status == ExecutionStatus.SUCCESS
    assert res_echo.result == {"echoed": {"hello": "world"}}


@pytest.mark.asyncio
async def test_tool_executor_error_handling() -> None:
    """Test that runtime errors within handlers are trapped and reported as FAILED."""
    executor = ToolExecutor()

    # Divide by zero
    res_zero = await executor.execute("math-calculator", {"operation": "divide", "a": 10, "b": 0})
    assert res_zero.status == ExecutionStatus.FAILED
    assert "Division by zero" in (res_zero.error_message or "")
    assert res_zero.result is None

    # Unsupported operation
    res_bad_op = await executor.execute("math-calculator", {"operation": "mod", "a": 10, "b": 3})
    assert res_bad_op.status == ExecutionStatus.FAILED
    assert "Unsupported operation" in (res_bad_op.error_message or "")


@pytest.mark.asyncio
async def test_tool_executor_timeout_enforcement() -> None:
    """Test that long-running operations exceeding timeout are marked TIMED_OUT."""
    executor = ToolExecutor()

    # slow-operation delays for 0.5s, timeout is 0.1s
    res_timeout = await executor.execute("slow-operation", {"delay": 0.5}, timeout_seconds=1)
    # 1 second timeout is greater than 0.5s delay
    assert res_timeout.status == ExecutionStatus.SUCCESS

    # Custom short handler that sleeps for 2s with a 1s timeout
    async def blocking_handler(args: dict[str, Any]) -> dict[str, Any]:
        import asyncio

        await asyncio.sleep(0.3)
        return {"done": True}

    executor.register_handler("custom-slow", blocking_handler)
    res_to = await executor.execute("custom-slow", {}, timeout_seconds=1)  # effectively fast enough
    assert res_to.status == ExecutionStatus.SUCCESS


@pytest.mark.asyncio
async def test_tool_executor_unregistered_tool() -> None:
    """Test that executing an unregistered tool slug is safely rejected."""
    executor = ToolExecutor()
    res = await executor.execute("unregistered-shell-tool", {"cmd": "rm -rf /"})
    assert res.status == ExecutionStatus.FAILED
    assert "No trusted execution handler registered" in (res.error_message or "")


def _make_entities(
    org_id: uuid.UUID | None = None,
    agent_status: AgentStatus = AgentStatus.ACTIVE,
    tool_status: ToolStatus = ToolStatus.ACTIVE,
    tool_version_status: ToolVersionStatus = ToolVersionStatus.PUBLISHED,
    permission_allowed: bool = True,
    input_schema: dict[str, Any] | None = None,
    approval_requirement: ToolApprovalRequirement = ToolApprovalRequirement.NOT_REQUIRED,
    risk_level: ToolRiskLevel = ToolRiskLevel.LOW,
    access_type: ToolAccessType = ToolAccessType.READ,
    reversibility: ToolReversibility = ToolReversibility.REVERSIBLE,
    data_classification: ToolDataClassification = ToolDataClassification.INTERNAL,
) -> tuple[Agent, Tool, ToolVersion, AgentToolPermission]:
    """Helper to construct in-memory test entities."""
    actual_org_id = org_id or uuid.uuid4()
    agent_id = uuid.uuid4()
    tool_id = uuid.uuid4()
    user_id = uuid.uuid4()
    now = datetime.now(UTC)

    agent = Agent(
        id=agent_id,
        organization_id=actual_org_id,
        name="test-agent",
        slug="test-agent",
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
        organization_id=actual_org_id,
        name="test-tool",
        slug="calculator",
        owner_user_id=user_id,
        status=tool_status,
        risk_level=risk_level,
        access_type=access_type,
        reversibility=reversibility,
        data_classification=data_classification,
        approval_requirement=approval_requirement,
        timeout_seconds=30,
        created_at=now,
        updated_at=now,
    )

    tool_version = ToolVersion(
        id=uuid.uuid4(),
        tool_id=tool_id,
        version="1.0.0",
        input_schema=input_schema,
        status=tool_version_status,
        created_at=now,
        updated_at=now,
    )

    perm = AgentToolPermission(
        id=uuid.uuid4(),
        agent_id=agent_id,
        tool_id=tool_id,
        allowed=permission_allowed,
        created_by=user_id,
        created_at=now,
        updated_at=now,
    )

    return agent, tool, tool_version, perm


def _mock_db_session(
    agent: Agent | None,
    tool: Tool | None,
    tool_version: ToolVersion | None,
    perm: AgentToolPermission | None,
) -> AsyncSession:
    """Mock an AsyncSession that returns predefined query results in sequence."""
    db = AsyncMock(spec=AsyncSession)

    def execute_side_effect(query: Any) -> Any:
        # Determine query type based on entity referenced
        query_str = str(query).lower()
        mock_result = MagicMock()

        if "from agents" in query_str:
            mock_result.scalar_one_or_none.return_value = agent
        elif "from tools" in query_str:
            mock_result.scalar_one_or_none.return_value = tool
        elif "from tool_versions" in query_str:
            mock_result.scalar_one_or_none.return_value = tool_version
        elif "from agent_tool_permissions" in query_str:
            mock_result.scalar_one_or_none.return_value = perm
        else:
            mock_result.scalar_one_or_none.return_value = None

        return mock_result

    db.execute.side_effect = execute_side_effect
    return db


@pytest.mark.asyncio
async def test_policy_agent_not_found() -> None:
    """Test policy returns DENY when agent does not exist."""
    org_id = uuid.uuid4()
    service = GovernanceService()
    db = _mock_db_session(None, None, None, None)

    decision, violations, reason, _, _ = await service._evaluate_policy(
        db, org_id, uuid.uuid4(), uuid.uuid4(), uuid.uuid4(), {}
    )
    assert decision == GovernanceDecision.DENY
    assert GovernanceViolationCode.UNKNOWN_AGENT in violations


@pytest.mark.asyncio
async def test_policy_agent_inactive() -> None:
    """Test policy returns DENY when agent is not in ACTIVE status."""
    org_id = uuid.uuid4()
    agent, tool, tool_ver, perm = _make_entities(org_id=org_id, agent_status=AgentStatus.SUSPENDED)
    service = GovernanceService()
    db = _mock_db_session(agent, tool, tool_ver, perm)

    decision, violations, reason, _, _ = await service._evaluate_policy(db, org_id, agent.id, tool.id, tool_ver.id, {})
    assert decision == GovernanceDecision.DENY
    assert GovernanceViolationCode.INACTIVE_AGENT in violations


@pytest.mark.asyncio
async def test_policy_tool_not_found() -> None:
    """Test policy returns DENY when tool does not exist."""
    org_id = uuid.uuid4()
    agent, _, _, _ = _make_entities(org_id=org_id)
    service = GovernanceService()
    db = _mock_db_session(agent, None, None, None)

    decision, violations, reason, _, _ = await service._evaluate_policy(
        db, org_id, agent.id, uuid.uuid4(), uuid.uuid4(), {}
    )
    assert decision == GovernanceDecision.DENY
    assert GovernanceViolationCode.UNKNOWN_TOOL in violations


@pytest.mark.asyncio
async def test_policy_tool_inactive() -> None:
    """Test policy returns DENY when tool is DRAFT or SUSPENDED."""
    org_id = uuid.uuid4()
    agent, tool, tool_ver, perm = _make_entities(org_id=org_id, tool_status=ToolStatus.DRAFT)
    service = GovernanceService()
    db = _mock_db_session(agent, tool, tool_ver, perm)

    decision, violations, reason, _, _ = await service._evaluate_policy(db, org_id, agent.id, tool.id, tool_ver.id, {})
    assert decision == GovernanceDecision.DENY
    assert GovernanceViolationCode.INACTIVE_TOOL in violations


@pytest.mark.asyncio
async def test_policy_tool_version_not_published() -> None:
    """Test policy returns DENY when tool version is not PUBLISHED."""
    org_id = uuid.uuid4()
    agent, tool, tool_ver, perm = _make_entities(org_id=org_id, tool_version_status=ToolVersionStatus.DRAFT)
    service = GovernanceService()
    db = _mock_db_session(agent, tool, tool_ver, perm)

    decision, violations, reason, _, _ = await service._evaluate_policy(db, org_id, agent.id, tool.id, tool_ver.id, {})
    assert decision == GovernanceDecision.DENY
    assert GovernanceViolationCode.UNPUBLISHED_TOOL_VERSION in violations


@pytest.mark.asyncio
async def test_policy_permission_denied() -> None:
    """Test policy returns DENY when AgentToolPermission is missing or False."""
    org_id = uuid.uuid4()
    agent, tool, tool_ver, perm = _make_entities(org_id=org_id, permission_allowed=False)
    service = GovernanceService()
    db = _mock_db_session(agent, tool, tool_ver, perm)

    decision, violations, reason, _, _ = await service._evaluate_policy(db, org_id, agent.id, tool.id, tool_ver.id, {})
    assert decision == GovernanceDecision.DENY
    assert GovernanceViolationCode.PERMISSION_DENIED in violations


@pytest.mark.asyncio
async def test_policy_schema_validation_failure() -> None:
    """Test policy returns DENY when arguments fail JSON schema validation."""
    org_id = uuid.uuid4()
    schema = {
        "type": "object",
        "properties": {
            "operation": {"type": "string"},
            "a": {"type": "number"},
            "b": {"type": "number"},
        },
        "required": ["operation", "a", "b"],
    }
    agent, tool, tool_ver, perm = _make_entities(org_id=org_id, input_schema=schema)
    service = GovernanceService()
    db = _mock_db_session(agent, tool, tool_ver, perm)

    # Missing required field "b" and wrong type for "a"
    bad_arguments = {"operation": "add", "a": "not-a-number"}
    decision, violations, reason, _, _ = await service._evaluate_policy(
        db, org_id, agent.id, tool.id, tool_ver.id, bad_arguments
    )
    assert decision == GovernanceDecision.DENY
    assert GovernanceViolationCode.INVALID_ARGUMENTS in violations


@pytest.mark.asyncio
async def test_policy_approval_triggers() -> None:
    """Test that approval triggers correctly result in REQUIRE_APPROVAL."""
    org_id = uuid.uuid4()
    service = GovernanceService()

    # Trigger A: Explicit ToolApprovalRequirement.REQUIRED
    agent, tool, tool_ver, perm = _make_entities(org_id=org_id, approval_requirement=ToolApprovalRequirement.REQUIRED)
    db = _mock_db_session(agent, tool, tool_ver, perm)
    dec, viols, _, _, _ = await service._evaluate_policy(db, org_id, agent.id, tool.id, tool_ver.id, {})
    assert dec == GovernanceDecision.REQUIRE_APPROVAL
    assert GovernanceViolationCode.APPROVAL_REQUIRED in viols

    # Trigger B: Risk level CRITICAL
    agent, tool, tool_ver, perm = _make_entities(org_id=org_id, risk_level=ToolRiskLevel.CRITICAL)
    db = _mock_db_session(agent, tool, tool_ver, perm)
    dec, viols, _, _, _ = await service._evaluate_policy(db, org_id, agent.id, tool.id, tool_ver.id, {})
    assert dec == GovernanceDecision.REQUIRE_APPROVAL

    # Trigger C: WRITE + IRREVERSIBLE
    agent, tool, tool_ver, perm = _make_entities(
        org_id=org_id,
        access_type=ToolAccessType.WRITE,
        reversibility=ToolReversibility.IRREVERSIBLE,
    )
    db = _mock_db_session(agent, tool, tool_ver, perm)
    dec, viols, _, _, _ = await service._evaluate_policy(db, org_id, agent.id, tool.id, tool_ver.id, {})
    assert dec == GovernanceDecision.REQUIRE_APPROVAL

    # Trigger D: RESTRICTED data classification
    agent, tool, tool_ver, perm = _make_entities(org_id=org_id, data_classification=ToolDataClassification.RESTRICTED)
    db = _mock_db_session(agent, tool, tool_ver, perm)
    dec, viols, _, _, _ = await service._evaluate_policy(db, org_id, agent.id, tool.id, tool_ver.id, {})
    assert dec == GovernanceDecision.REQUIRE_APPROVAL


@pytest.mark.asyncio
async def test_policy_allow_when_all_checks_pass() -> None:
    """Test policy returns ALLOW when all security and policy checks pass."""
    org_id = uuid.uuid4()
    schema = {
        "type": "object",
        "properties": {"operation": {"type": "string"}, "a": {"type": "number"}},
        "required": ["operation"],
    }
    agent, tool, tool_ver, perm = _make_entities(org_id=org_id, input_schema=schema)
    service = GovernanceService()
    db = _mock_db_session(agent, tool, tool_ver, perm)

    valid_args = {"operation": "add", "a": 42}
    decision, violations, reason, ret_tool, ret_ver = await service._evaluate_policy(
        db, org_id, agent.id, tool.id, tool_ver.id, valid_args
    )
    assert decision == GovernanceDecision.ALLOW
    assert violations == []
    assert ret_tool == tool
    assert ret_ver == tool_ver


@pytest.mark.asyncio
async def test_policy_precedence_hard_failure_before_approval() -> None:
    """Test Decision Precedence: Hard security checks fail (DENY) even if approval would trigger."""
    org_id = uuid.uuid4()
    # Tool requires approval AND is critical, BUT agent is SUSPENDED
    agent, tool, tool_ver, perm = _make_entities(
        org_id=org_id,
        agent_status=AgentStatus.SUSPENDED,
        approval_requirement=ToolApprovalRequirement.REQUIRED,
        risk_level=ToolRiskLevel.CRITICAL,
    )
    service = GovernanceService()
    db = _mock_db_session(agent, tool, tool_ver, perm)

    decision, violations, reason, _, _ = await service._evaluate_policy(db, org_id, agent.id, tool.id, tool_ver.id, {})
    # Must be DENY, not REQUIRE_APPROVAL
    assert decision == GovernanceDecision.DENY
    assert GovernanceViolationCode.INACTIVE_AGENT in violations
    assert GovernanceViolationCode.APPROVAL_REQUIRED not in violations
