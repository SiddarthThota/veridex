"""Comprehensive integration and security tests for Phase 5 Governance Gateway."""

import uuid
from typing import Any

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.agents.models import Agent, AgentEnvironment, AgentRiskTier, AgentStatus
from app.auth.security import get_password_hash
from app.governance.models import (
    ApprovalStatus,
    ExecutionStatus,
    GovernanceDecision,
    RunStatus,
    ToolExecution,
    ToolRequest,
)
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
from app.users.models import Organization, OrganizationStatus, Role, User, UserStatus


async def _create_test_context(
    db_session: AsyncSession,
    client: AsyncClient,
    role: Role = Role.ADMIN,
    org_id: uuid.UUID | None = None,
) -> tuple[dict[str, str], uuid.UUID, uuid.UUID]:
    """Create test organization, user with specified role, and return headers and IDs."""
    uid = uuid.uuid4()
    if not org_id:
        org = Organization(name=f"Org {uid}", slug=f"org-{uid}", status=OrganizationStatus.ACTIVE)
        db_session.add(org)
        await db_session.commit()
        await db_session.refresh(org)
        actual_org_id = org.id
    else:
        actual_org_id = org_id

    test_pass = "TestPass123!"  # noqa: S105
    user = User(
        organization_id=actual_org_id,
        email=f"user-{uid}@example.com",
        password_hash=get_password_hash(test_pass),
        display_name=f"User {role.value}",
        status=UserStatus.ACTIVE,
        role=role,
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)

    login_resp = await client.post("/api/v1/auth/login", data={"username": user.email, "password": test_pass})
    token = login_resp.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    return headers, actual_org_id, user.id


async def _setup_governance_fixture(
    db_session: AsyncSession,
    org_id: uuid.UUID,
    user_id: uuid.UUID,
    tool_slug: str = "calculator",
    approval_requirement: ToolApprovalRequirement = ToolApprovalRequirement.NOT_REQUIRED,
    risk_level: ToolRiskLevel = ToolRiskLevel.LOW,
    access_type: ToolAccessType = ToolAccessType.READ,
    reversibility: ToolReversibility = ToolReversibility.REVERSIBLE,
    data_classification: ToolDataClassification = ToolDataClassification.INTERNAL,
    permission_allowed: bool = True,
    input_schema: dict[str, Any] | None = None,
) -> tuple[Agent, Tool, ToolVersion]:
    """Populate active agent, tool, tool version, and permission for testing."""
    uid = uuid.uuid4()
    agent = Agent(
        organization_id=org_id,
        owner_user_id=user_id,
        name=f"agent-{uid}",
        slug=f"agent-{uid}",
        status=AgentStatus.ACTIVE,
        environment=AgentEnvironment.PRODUCTION,
        risk_tier=AgentRiskTier.LOW,
        model_provider="openai",
        model_name="gpt-4o",
    )
    db_session.add(agent)

    tool = Tool(
        organization_id=org_id,
        name=f"tool-{uid}",
        slug=tool_slug,
        owner_user_id=user_id,
        status=ToolStatus.ACTIVE,
        risk_level=risk_level,
        access_type=access_type,
        reversibility=reversibility,
        data_classification=data_classification,
        approval_requirement=approval_requirement,
        timeout_seconds=30,
    )
    db_session.add(tool)
    await db_session.flush()

    tool_version = ToolVersion(
        tool_id=tool.id,
        version="1.0.0",
        created_by=user_id,
        input_schema=input_schema
        or {
            "type": "object",
            "properties": {
                "operation": {"type": "string"},
                "a": {"type": "number"},
                "b": {"type": "number"},
            },
            "required": ["operation", "a", "b"],
        },
        status=ToolVersionStatus.PUBLISHED,
    )
    db_session.add(tool_version)
    await db_session.flush()

    if permission_allowed:
        perm = AgentToolPermission(
            agent_id=agent.id,
            tool_id=tool.id,
            allowed=True,
            created_by=user_id,
        )
        db_session.add(perm)

    await db_session.commit()
    await db_session.refresh(agent)
    await db_session.refresh(tool)
    await db_session.refresh(tool_version)
    return agent, tool, tool_version


@pytest.mark.asyncio
async def test_agent_runs_crud_lifecycle(client: AsyncClient, db_session: AsyncSession) -> None:
    """Test creating, listing, retrieving, and updating an AgentRun."""
    headers, org_id, user_id = await _create_test_context(db_session, client, role=Role.AGENT_OPERATOR)
    agent, _, _ = await _setup_governance_fixture(db_session, org_id, user_id)

    # 1. Create run
    create_payload = {
        "agent_id": str(agent.id),
        "environment": "staging",
        "trace_id": "trace-12345",
        "input_prompt": "Perform health analysis",
    }
    resp = await client.post("/api/v1/runs", json=create_payload, headers=headers)
    assert resp.status_code == 201
    run_data = resp.json()
    run_id = run_data["id"]
    assert run_data["status"] == RunStatus.RUNNING
    assert run_data["environment"] == "staging"
    assert run_data["trace_id"] == "trace-12345"
    assert run_data["input_prompt"] == "Perform health analysis"

    # 2. Get run
    get_resp = await client.get(f"/api/v1/runs/{run_id}", headers=headers)
    assert get_resp.status_code == 200
    assert get_resp.json()["id"] == run_id

    # 3. List runs
    list_resp = await client.get("/api/v1/runs", headers=headers)
    assert list_resp.status_code == 200
    assert list_resp.json()["total"] >= 1

    # 4. Update status to COMPLETED
    patch_resp = await client.patch(
        f"/api/v1/runs/{run_id}/status",
        json={"status": RunStatus.COMPLETED},
        headers=headers,
    )
    assert patch_resp.status_code == 200
    assert patch_resp.json()["status"] == RunStatus.COMPLETED
    assert patch_resp.json()["completed_at"] is not None


@pytest.mark.asyncio
async def test_dry_run_governance_evaluation_safety(client: AsyncClient, db_session: AsyncSession) -> None:
    """Test Dry-Run Safety: evaluate endpoint returns decisions without creating records."""
    headers, org_id, user_id = await _create_test_context(db_session, client, role=Role.SECURITY_ANALYST)
    agent, tool, tool_version = await _setup_governance_fixture(db_session, org_id, user_id)

    eval_payload = {
        "agent_id": str(agent.id),
        "tool_id": str(tool.id),
        "tool_version_id": str(tool_version.id),
        "arguments": {"operation": "add", "a": 5, "b": 10},
    }
    from sqlalchemy import func, select

    req_count_before = (await db_session.execute(select(func.count(ToolRequest.id)))).scalar_one()
    exec_count_before = (await db_session.execute(select(func.count(ToolExecution.id)))).scalar_one()

    resp = await client.post("/api/v1/governance/evaluate", json=eval_payload, headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["decision"] == GovernanceDecision.ALLOW
    assert data["approval_required"] is False
    assert len(data["integrity_hash"]) == 64

    # Dry-Run Safety invariant: Verify tool_requests and tool_executions counts did not increase
    req_count_after = (await db_session.execute(select(func.count(ToolRequest.id)))).scalar_one()
    exec_count_after = (await db_session.execute(select(func.count(ToolExecution.id)))).scalar_one()
    assert req_count_after == req_count_before
    assert exec_count_after == exec_count_before


@pytest.mark.asyncio
async def test_tool_invocation_allow_execution(client: AsyncClient, db_session: AsyncSession) -> None:
    """Test invoking a tool when governance decision is ALLOW executes and saves telemetry."""
    headers, org_id, user_id = await _create_test_context(db_session, client, role=Role.AGENT_OPERATOR)
    agent, tool, tool_version = await _setup_governance_fixture(db_session, org_id, user_id, tool_slug="calculator")

    # Start an active run
    run_resp = await client.post("/api/v1/runs", json={"agent_id": str(agent.id)}, headers=headers)
    run_id = run_resp.json()["id"]

    # Invoke tool
    inv_payload = {
        "agent_id": str(agent.id),
        "tool_id": str(tool.id),
        "tool_version_id": str(tool_version.id),
        "arguments": {"operation": "add", "a": 12, "b": 8},
    }
    resp = await client.post(f"/api/v1/runs/{run_id}/invocations", json=inv_payload, headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["decision"] == GovernanceDecision.ALLOW
    assert data["execution_status"] == ExecutionStatus.SUCCESS
    assert data["result"]["result"] == 20.0
    assert data["error_message"] is None

    # Check invocations list
    inv_list_resp = await client.get(f"/api/v1/runs/{run_id}/invocations", headers=headers)
    assert inv_list_resp.status_code == 200
    items = inv_list_resp.json()["items"]
    assert len(items) == 1
    assert items[0]["execution"]["status"] == ExecutionStatus.SUCCESS
    assert items[0]["execution"]["duration_ms"] >= 0


@pytest.mark.asyncio
async def test_tool_invocation_deny_unauthorized(client: AsyncClient, db_session: AsyncSession) -> None:
    """Test invoking a tool without permission results in DENY and records violation."""
    headers, org_id, user_id = await _create_test_context(db_session, client, role=Role.AGENT_OPERATOR)
    # tool setup without permission
    agent, tool, tool_version = await _setup_governance_fixture(db_session, org_id, user_id, permission_allowed=False)

    run_resp = await client.post("/api/v1/runs", json={"agent_id": str(agent.id)}, headers=headers)
    run_id = run_resp.json()["id"]

    inv_payload = {
        "agent_id": str(agent.id),
        "tool_id": str(tool.id),
        "tool_version_id": str(tool_version.id),
        "arguments": {"operation": "add", "a": 1, "b": 2},
    }
    resp = await client.post(f"/api/v1/runs/{run_id}/invocations", json=inv_payload, headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["decision"] == GovernanceDecision.DENY
    assert "PERMISSION_DENIED" in data["violation_codes"]
    assert data["execution_status"] is None
    assert data["result"] is None


@pytest.mark.asyncio
async def test_tool_invocation_approval_workflow(client: AsyncClient, db_session: AsyncSession) -> None:
    """Test end-to-end approval workflow: REQUIRE_APPROVAL -> PENDING -> APPROVED -> Execution."""
    op_headers, org_id, user_id = await _create_test_context(db_session, client, role=Role.AGENT_OPERATOR)
    sec_headers, _, sec_user_id = await _create_test_context(
        db_session, client, role=Role.SECURITY_ANALYST, org_id=org_id
    )

    # Tool requiring explicit approval
    agent, tool, tool_version = await _setup_governance_fixture(
        db_session,
        org_id,
        user_id,
        tool_slug="calculator",
        approval_requirement=ToolApprovalRequirement.REQUIRED,
    )

    # 1. Agent operator invokes tool -> REQUIRE_APPROVAL
    run_resp = await client.post("/api/v1/runs", json={"agent_id": str(agent.id)}, headers=op_headers)
    run_id = run_resp.json()["id"]

    inv_payload = {
        "agent_id": str(agent.id),
        "tool_id": str(tool.id),
        "tool_version_id": str(tool_version.id),
        "arguments": {"operation": "multiply", "a": 6, "b": 7},
    }
    resp = await client.post(f"/api/v1/runs/{run_id}/invocations", json=inv_payload, headers=op_headers)
    assert resp.status_code == 200
    inv_data = resp.json()
    assert inv_data["decision"] == GovernanceDecision.REQUIRE_APPROVAL
    approval_id = inv_data["approval_request_id"]
    assert approval_id is not None
    assert inv_data["execution_status"] is None

    # 2. Security analyst views pending approvals
    appr_list_resp = await client.get("/api/v1/governance/approvals", headers=sec_headers)
    assert appr_list_resp.status_code == 200
    assert any(a["id"] == approval_id for a in appr_list_resp.json()["items"])

    # 3. Security analyst approves the invocation
    decide_resp = await client.post(
        f"/api/v1/governance/approvals/{approval_id}/decide",
        json={"decision": "APPROVED", "reason": "Operation verified and authorized"},
        headers=sec_headers,
    )
    assert decide_resp.status_code == 200
    decide_data = decide_resp.json()
    assert decide_data["status"] == ApprovalStatus.APPROVED
    assert decide_data["decision_reason"] == "Operation verified and authorized"

    # Execution must have completed
    exec_record = decide_data["tool_request"]["execution"]
    assert exec_record is not None
    assert exec_record["status"] == ExecutionStatus.SUCCESS
    assert exec_record["result"]["result"] == 42.0


@pytest.mark.asyncio
async def test_approval_rejection_workflow(client: AsyncClient, db_session: AsyncSession) -> None:
    """Test rejecting an approval request persists rejection and does NOT execute."""
    op_headers, org_id, user_id = await _create_test_context(db_session, client, role=Role.AGENT_OPERATOR)
    admin_headers, _, _ = await _create_test_context(db_session, client, role=Role.ADMIN, org_id=org_id)

    agent, tool, tool_version = await _setup_governance_fixture(
        db_session,
        org_id,
        user_id,
        tool_slug="calculator",
        approval_requirement=ToolApprovalRequirement.REQUIRED,
    )

    run_resp = await client.post("/api/v1/runs", json={"agent_id": str(agent.id)}, headers=op_headers)
    run_id = run_resp.json()["id"]

    inv_resp = await client.post(
        f"/api/v1/runs/{run_id}/invocations",
        json={
            "agent_id": str(agent.id),
            "tool_id": str(tool.id),
            "tool_version_id": str(tool_version.id),
            "arguments": {"operation": "add", "a": 1, "b": 1},
        },
        headers=op_headers,
    )
    approval_id = inv_resp.json()["approval_request_id"]

    # Reject
    reject_resp = await client.post(
        f"/api/v1/governance/approvals/{approval_id}/decide",
        json={"decision": "REJECTED", "reason": "Request rejected due to policy restriction"},
        headers=admin_headers,
    )
    assert reject_resp.status_code == 200
    assert reject_resp.json()["status"] == ApprovalStatus.REJECTED
    assert reject_resp.json()["tool_request"]["execution"] is None


@pytest.mark.asyncio
async def test_security_prevent_duplicate_approval_processing(client: AsyncClient, db_session: AsyncSession) -> None:
    """Test that deciding an already processed approval returns HTTP 409 Conflict."""
    op_headers, org_id, user_id = await _create_test_context(db_session, client, role=Role.AGENT_OPERATOR)
    admin_headers, _, _ = await _create_test_context(db_session, client, role=Role.ADMIN, org_id=org_id)

    agent, tool, tool_version = await _setup_governance_fixture(
        db_session,
        org_id,
        user_id,
        approval_requirement=ToolApprovalRequirement.REQUIRED,
    )

    run_resp = await client.post("/api/v1/runs", json={"agent_id": str(agent.id)}, headers=op_headers)
    run_id = run_resp.json()["id"]

    inv_resp = await client.post(
        f"/api/v1/runs/{run_id}/invocations",
        json={
            "agent_id": str(agent.id),
            "tool_id": str(tool.id),
            "tool_version_id": str(tool_version.id),
            "arguments": {"operation": "add", "a": 2, "b": 2},
        },
        headers=op_headers,
    )
    approval_id = inv_resp.json()["approval_request_id"]

    # First decision succeeds
    resp1 = await client.post(
        f"/api/v1/governance/approvals/{approval_id}/decide",
        json={"decision": "APPROVED", "reason": "First decision"},
        headers=admin_headers,
    )
    assert resp1.status_code == 200

    # Second decision must be rejected with 409 Conflict
    resp2 = await client.post(
        f"/api/v1/governance/approvals/{approval_id}/decide",
        json={"decision": "APPROVED", "reason": "Duplicate attempt"},
        headers=admin_headers,
    )
    assert resp2.status_code == 409
    assert "already decided" in resp2.json()["detail"]


@pytest.mark.asyncio
async def test_security_rbac_agent_operator_cannot_decide_approval(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """Negative security test: AGENT_OPERATOR cannot approve/reject (HTTP 403 Forbidden)."""
    op_headers, org_id, user_id = await _create_test_context(db_session, client, role=Role.AGENT_OPERATOR)
    agent, tool, tool_version = await _setup_governance_fixture(
        db_session,
        org_id,
        user_id,
        approval_requirement=ToolApprovalRequirement.REQUIRED,
    )

    run_resp = await client.post("/api/v1/runs", json={"agent_id": str(agent.id)}, headers=op_headers)
    run_id = run_resp.json()["id"]

    inv_resp = await client.post(
        f"/api/v1/runs/{run_id}/invocations",
        json={
            "agent_id": str(agent.id),
            "tool_id": str(tool.id),
            "tool_version_id": str(tool_version.id),
            "arguments": {"operation": "add", "a": 5, "b": 5},
        },
        headers=op_headers,
    )
    approval_id = inv_resp.json()["approval_request_id"]

    # AGENT_OPERATOR attempts to approve
    decide_resp = await client.post(
        f"/api/v1/governance/approvals/{approval_id}/decide",
        json={"decision": "APPROVED", "reason": "Self-approval attempt"},
        headers=op_headers,
    )
    assert decide_resp.status_code == 403


@pytest.mark.asyncio
async def test_security_multi_tenant_isolation(client: AsyncClient, db_session: AsyncSession) -> None:
    """Negative security test: Organization B cannot access or decide Org A's approvals."""
    # Org A
    headers_a, org_a, user_a = await _create_test_context(db_session, client, role=Role.AGENT_OPERATOR)
    agent_a, tool_a, ver_a = await _setup_governance_fixture(
        db_session, org_a, user_a, approval_requirement=ToolApprovalRequirement.REQUIRED
    )

    # Org B Admin
    headers_b, _, _ = await _create_test_context(db_session, client, role=Role.ADMIN)

    # Org A creates run and approval
    run_resp = await client.post("/api/v1/runs", json={"agent_id": str(agent_a.id)}, headers=headers_a)
    run_id = run_resp.json()["id"]

    inv_resp = await client.post(
        f"/api/v1/runs/{run_id}/invocations",
        json={
            "agent_id": str(agent_a.id),
            "tool_id": str(tool_a.id),
            "tool_version_id": str(ver_a.id),
            "arguments": {"operation": "add", "a": 1, "b": 2},
        },
        headers=headers_a,
    )
    approval_id = inv_resp.json()["approval_request_id"]

    # Org B Admin attempts to view Org A approval
    get_resp = await client.get(f"/api/v1/governance/approvals/{approval_id}", headers=headers_b)
    assert get_resp.status_code == 404

    # Org B Admin attempts to decide Org A approval
    decide_resp = await client.post(
        f"/api/v1/governance/approvals/{approval_id}/decide",
        json={"decision": "APPROVED", "reason": "Cross-tenant intrusion attempt"},
        headers=headers_b,
    )
    assert decide_resp.status_code == 404


@pytest.mark.asyncio
async def test_idempotency_prevents_duplicate_tool_execution(client: AsyncClient, db_session: AsyncSession) -> None:
    """Test that retried requests with identical idempotency_key return cached results."""
    headers, org_id, user_id = await _create_test_context(db_session, client, role=Role.AGENT_OPERATOR)
    agent, tool, tool_version = await _setup_governance_fixture(db_session, org_id, user_id, tool_slug="calculator")

    run_resp = await client.post("/api/v1/runs", json={"agent_id": str(agent.id)}, headers=headers)
    run_id = run_resp.json()["id"]

    idempotency_key = f"key-{uuid.uuid4()}"
    inv_payload = {
        "agent_id": str(agent.id),
        "tool_id": str(tool.id),
        "tool_version_id": str(tool_version.id),
        "arguments": {"operation": "multiply", "a": 7, "b": 8},
        "idempotency_key": idempotency_key,
    }

    # First invocation
    resp1 = await client.post(f"/api/v1/runs/{run_id}/invocations", json=inv_payload, headers=headers)
    assert resp1.status_code == 200
    res1_data = resp1.json()
    assert res1_data["execution_status"] == ExecutionStatus.SUCCESS
    assert res1_data["result"]["result"] == 56.0

    # Second invocation with same idempotency key
    resp2 = await client.post(f"/api/v1/runs/{run_id}/invocations", json=inv_payload, headers=headers)
    assert resp2.status_code == 200
    res2_data = resp2.json()
    assert res2_data["tool_request_id"] == res1_data["tool_request_id"]
    assert res2_data["result"]["result"] == 56.0

    # Verify in DB that only 1 ToolRequest was created
    from sqlalchemy import func, select

    count = (
        await db_session.execute(
            select(func.count(ToolRequest.id)).where(ToolRequest.idempotency_key == idempotency_key)
        )
    ).scalar_one()
    assert count == 1
