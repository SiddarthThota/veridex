"""Unit tests for Phase 5 Governance Models and Integrity Hashing."""

import uuid
from datetime import UTC, datetime

from app.governance.models import (
    AgentRun,
    ApprovalRequest,
    ApprovalStatus,
    ExecutionStatus,
    GovernanceDecision,
    GovernanceViolationCode,
    RunStatus,
    ToolExecution,
    ToolRequest,
    compute_arguments_hash,
)


def test_governance_enums() -> None:
    """Verify governance enums contain required lifecycle and security states."""
    assert RunStatus.PENDING == "PENDING"
    assert RunStatus.RUNNING == "RUNNING"
    assert RunStatus.COMPLETED == "COMPLETED"
    assert RunStatus.FAILED == "FAILED"
    assert RunStatus.CANCELLED == "CANCELLED"

    assert GovernanceDecision.ALLOW == "ALLOW"
    assert GovernanceDecision.DENY == "DENY"
    assert GovernanceDecision.REQUIRE_APPROVAL == "REQUIRE_APPROVAL"

    assert ExecutionStatus.PENDING == "PENDING"
    assert ExecutionStatus.RUNNING == "RUNNING"
    assert ExecutionStatus.SUCCESS == "SUCCESS"
    assert ExecutionStatus.FAILED == "FAILED"
    assert ExecutionStatus.TIMED_OUT == "TIMED_OUT"

    assert ApprovalStatus.PENDING == "PENDING"
    assert ApprovalStatus.APPROVED == "APPROVED"
    assert ApprovalStatus.REJECTED == "REJECTED"
    assert ApprovalStatus.EXPIRED == "EXPIRED"

    # Verify key security violation codes
    expected_codes = {
        "UNKNOWN_AGENT",
        "INACTIVE_AGENT",
        "UNKNOWN_TOOL",
        "INACTIVE_TOOL",
        "UNPUBLISHED_TOOL_VERSION",
        "ORGANIZATION_MISMATCH",
        "PERMISSION_DENIED",
        "INVALID_ARGUMENTS",
        "APPROVAL_REQUIRED",
        "HIGH_RISK_RESTRICTION",
        "IRREVERSIBLE_WRITE_RESTRICTION",
        "RESTRICTED_DATA_ACCESS",
        "RATE_LIMIT_EXCEEDED",
        "ARGUMENTS_HASH_MISMATCH",
        "DUPLICATE_APPROVAL_PROCESSING",
    }
    actual_codes = {code.value for code in GovernanceViolationCode}
    assert expected_codes.issubset(actual_codes)


def test_compute_arguments_hash_determinism() -> None:
    """Verify compute_arguments_hash is deterministic and key-order independent."""
    version_id = uuid.uuid4()
    args_1 = {"customer_id": "cust-123", "dry_run": False, "limit": 10}
    args_2 = {"limit": 10, "customer_id": "cust-123", "dry_run": False}

    hash_1 = compute_arguments_hash(version_id, args_1)
    hash_2 = compute_arguments_hash(version_id, args_2)

    assert len(hash_1) == 64  # SHA-256 hex string
    assert hash_1 == hash_2  # Key ordering independence


def test_compute_arguments_hash_sensitivity() -> None:
    """Verify hash changes on modified arguments or different tool version."""
    version_id_1 = uuid.uuid4()
    version_id_2 = uuid.uuid4()
    args_1 = {"query": "SELECT * FROM users"}
    args_2 = {"query": "SELECT * FROM customers"}

    hash_v1_args1 = compute_arguments_hash(version_id_1, args_1)
    hash_v2_args1 = compute_arguments_hash(version_id_2, args_1)
    hash_v1_args2 = compute_arguments_hash(version_id_1, args_2)

    assert hash_v1_args1 != hash_v2_args1
    assert hash_v1_args1 != hash_v1_args2


def test_agent_run_model_instantiation() -> None:
    """Verify AgentRun model instantiation and attributes."""
    org_id = uuid.uuid4()
    agent_id = uuid.uuid4()
    user_id = uuid.uuid4()
    now = datetime.now(UTC)

    run = AgentRun(
        organization_id=org_id,
        agent_id=agent_id,
        user_id=user_id,
        status=RunStatus.PENDING,
        environment="PRODUCTION",
        trace_id="trace-abc-123",
        input_prompt="Summarize customer accounts",
        started_at=now,
    )

    assert run.organization_id == org_id
    assert run.agent_id == agent_id
    assert run.user_id == user_id
    assert run.status == RunStatus.PENDING
    assert run.environment == "PRODUCTION"
    assert run.trace_id == "trace-abc-123"
    assert run.input_prompt == "Summarize customer accounts"
    assert run.started_at == now
    assert run.completed_at is None


def test_tool_request_and_execution_models() -> None:
    """Verify ToolRequest and ToolExecution model instantiation with integrity hash."""
    org_id = uuid.uuid4()
    agent_id = uuid.uuid4()
    tool_id = uuid.uuid4()
    tool_version_id = uuid.uuid4()
    run_id = uuid.uuid4()
    now = datetime.now(UTC)

    arguments = {"account_id": "acc-999"}
    arg_hash = compute_arguments_hash(tool_version_id, arguments)

    req = ToolRequest(
        run_id=run_id,
        organization_id=org_id,
        agent_id=agent_id,
        tool_id=tool_id,
        tool_version_id=tool_version_id,
        decision=GovernanceDecision.ALLOW,
        arguments=arguments,
        arguments_hash=arg_hash,
        violation_codes=[],
        reason="Pre-approved read-only query",
        environment="STAGING",
        evaluated_at=now,
    )

    assert req.tool_version_id == tool_version_id
    assert req.arguments_hash == arg_hash
    assert req.decision == GovernanceDecision.ALLOW
    assert req.violation_codes == []

    exec_record = ToolExecution(
        tool_request_id=req.id,
        status=ExecutionStatus.SUCCESS,
        result={"status": "ok", "balance": 1500},
        duration_ms=45,
        executed_at=now,
    )

    assert exec_record.status == ExecutionStatus.SUCCESS
    assert exec_record.result == {"status": "ok", "balance": 1500}
    assert exec_record.duration_ms == 45


def test_approval_request_model() -> None:
    """Verify ApprovalRequest model links to ToolRequest and stores integrity hash."""
    org_id = uuid.uuid4()
    tool_req_id = uuid.uuid4()
    user_id = uuid.uuid4()
    tool_version_id = uuid.uuid4()
    args = {"drop_table": True}
    int_hash = compute_arguments_hash(tool_version_id, args)

    approval = ApprovalRequest(
        tool_request_id=tool_req_id,
        organization_id=org_id,
        status=ApprovalStatus.PENDING,
        integrity_hash=int_hash,
        requested_by_user_id=user_id,
    )

    assert approval.tool_request_id == tool_req_id
    assert approval.organization_id == org_id
    assert approval.status == ApprovalStatus.PENDING
    assert approval.integrity_hash == int_hash
    assert approval.reviewed_by_user_id is None
    assert approval.reviewed_at is None
