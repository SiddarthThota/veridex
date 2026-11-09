"""Comprehensive integration and security tests for Phase 6 Policy Engine."""

import uuid
from typing import Any

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.agents.models import Agent, AgentEnvironment, AgentRiskTier, AgentStatus
from app.auth.security import get_password_hash
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
) -> tuple[Agent, Tool, ToolVersion]:
    """Populate active agent, tool, tool version, and permission for testing."""
    uid = uuid.uuid4()
    agent = Agent(
        organization_id=org_id,
        owner_user_id=user_id,
        name=f"agent-{uid}",
        slug=f"agent-{uid}",
        status=AgentStatus.ACTIVE,
        environment=AgentEnvironment.DEVELOPMENT,
        risk_tier=AgentRiskTier.LOW,
        model_provider="openai",
        model_name="gpt-4o",
    )
    tool = Tool(
        organization_id=org_id,
        name=f"Tool {uid}",
        slug=tool_slug,
        owner_user_id=user_id,
        status=ToolStatus.ACTIVE,
        approval_requirement=approval_requirement,
        risk_level=risk_level,
        access_type=access_type,
        reversibility=reversibility,
        data_classification=data_classification,
        timeout_seconds=30,
    )
    db_session.add_all([agent, tool])
    await db_session.commit()
    await db_session.refresh(agent)
    await db_session.refresh(tool)

    tool_version = ToolVersion(
        tool_id=tool.id,
        version="1.0.0",
        created_by=user_id,
        input_schema={
            "type": "object",
            "properties": {"a": {"type": "number"}, "b": {"type": "number"}, "operation": {"type": "string"}},
            "required": ["a", "b"],
        },
        status=ToolVersionStatus.PUBLISHED,
    )
    db_session.add(tool_version)
    await db_session.commit()
    await db_session.refresh(tool_version)

    tool.current_version_id = tool_version.id

    perm = AgentToolPermission(
        agent_id=agent.id,
        tool_id=tool.id,
        allowed=True,
        created_by=user_id,
    )
    db_session.add(perm)
    await db_session.commit()

    return agent, tool, tool_version


async def _get_initial_version_id(client: AsyncClient, policy_id: str, headers: dict[str, str]) -> str:
    """Helper to fetch initial version ID for a newly created policy."""
    resp = await client.get(f"/api/v1/policies/{policy_id}/versions", headers=headers)
    assert resp.status_code == 200
    versions = resp.json()
    assert len(versions) > 0
    return str(versions[0]["id"])


@pytest.mark.asyncio
async def test_policy_crud_and_lifecycle(client: AsyncClient, db_session: AsyncSession) -> None:
    """Verify policy creation, updates, and state machine lifecycle transitions."""
    headers, org_id, _ = await _create_test_context(db_session, client, Role.ADMIN)

    # 1. Create Policy
    create_payload = {
        "name": "Data Classification Guardrail",
        "description": "Block restricted data exposure",
        "policy_type": "COMPLIANCE",
        "priority": 150,
    }
    resp = await client.post("/api/v1/policies", json=create_payload, headers=headers)
    assert resp.status_code == 201
    policy_data = resp.json()
    assert policy_data["name"] == "Data Classification Guardrail"
    assert policy_data["status"] == "DRAFT"
    assert policy_data["priority"] == 150
    assert policy_data["current_version_id"] is None  # Initial draft has not yet been published
    policy_id = policy_data["id"]

    # 2. Get Policy
    resp = await client.get(f"/api/v1/policies/{policy_id}", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["id"] == policy_id

    # 3. Check Version List (initial draft version 1 created automatically)
    resp = await client.get(f"/api/v1/policies/{policy_id}/versions", headers=headers)
    assert resp.status_code == 200
    versions = resp.json()
    assert len(versions) == 1
    assert versions[0]["version_number"] == 1
    assert versions[0]["status"] == "DRAFT"

    # 4. Update Policy Metadata
    resp = await client.patch(
        f"/api/v1/policies/{policy_id}",
        json={"description": "Updated guardrail description", "priority": 200},
        headers=headers,
    )
    assert resp.status_code == 200
    assert resp.json()["description"] == "Updated guardrail description"
    assert resp.json()["priority"] == 200

    # 5. Premature activation check: cannot activate without a published version
    bad_act_resp = await client.patch(
        f"/api/v1/policies/{policy_id}/status",
        json={"status": "ACTIVE"},
        headers=headers,
    )
    assert bad_act_resp.status_code == 400
    assert "without a published version" in bad_act_resp.json()["detail"].lower()

    # 6. Publish Version 1 (automatically activates DRAFT policy)
    pub_resp = await client.post(
        f"/api/v1/policies/{policy_id}/versions/{versions[0]['id']}/publish",
        json={"changelog": "Initial publish"},
        headers=headers,
    )
    assert pub_resp.status_code == 200

    # Verify policy transitioned to ACTIVE and current_version_id is set
    pol_active = await client.get(f"/api/v1/policies/{policy_id}", headers=headers)
    assert pol_active.status_code == 200
    assert pol_active.json()["status"] == "ACTIVE"
    assert pol_active.json()["current_version_id"] == versions[0]["id"]

    # 7. Lifecycle transition: ACTIVE -> INACTIVE
    resp = await client.patch(
        f"/api/v1/policies/{policy_id}/status",
        json={"status": "INACTIVE"},
        headers=headers,
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "INACTIVE"

    # 8. Lifecycle transition: INACTIVE -> ARCHIVED
    resp = await client.patch(
        f"/api/v1/policies/{policy_id}/status",
        json={"status": "ARCHIVED"},
        headers=headers,
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "ARCHIVED"

    # 9. Disallowed transition: ARCHIVED -> ACTIVE raises 400
    resp = await client.patch(
        f"/api/v1/policies/{policy_id}/status",
        json={"status": "ACTIVE"},
        headers=headers,
    )
    assert resp.status_code == 400
    assert "archived" in resp.json()["detail"].lower()


@pytest.mark.asyncio
async def test_policy_version_and_rule_immutability(client: AsyncClient, db_session: AsyncSession) -> None:
    """Verify draft rule editing, version publishing, immutability, and branching."""
    headers, org_id, _ = await _create_test_context(db_session, client, Role.ADMIN)

    # 1. Create Policy (comes with draft version 1)
    resp = await client.post(
        "/api/v1/policies",
        json={"name": "Finance Limit Policy", "policy_type": "FINANCIAL", "priority": 100},
        headers=headers,
    )
    assert resp.status_code == 201
    policy_id = resp.json()["id"]
    version_id = await _get_initial_version_id(client, policy_id, headers)

    # 2. Add rule to draft version
    rule_payload = {
        "rule_name": "Limit Transfers to $10,000",
        "description": "Deny transfers exceeding ten thousand",
        "action": "DENY",
        "violation_code": "AMOUNT_EXCEEDED",
        "remediation_message": "Transfer amount must not exceed 10000",
        "condition_tree": {
            "combinator": "AND",
            "conditions": [
                {"field": "arguments.amount", "operator": "GREATER_THAN", "value": 10000},
            ],
        },
    }
    resp = await client.post(
        f"/api/v1/policies/{policy_id}/versions/{version_id}/rules", json=rule_payload, headers=headers
    )
    assert resp.status_code == 201
    rule_data = resp.json()
    rule_id = rule_data["id"]
    assert rule_data["action"] == "DENY"

    # 3. Update rule on draft version
    resp = await client.patch(
        f"/api/v1/policies/{policy_id}/versions/{version_id}/rules/{rule_id}",
        json={"description": "Updated limit rule"},
        headers=headers,
    )
    assert resp.status_code == 200
    assert resp.json()["description"] == "Updated limit rule"

    # 4. Publish Version 1
    resp = await client.post(
        f"/api/v1/policies/{policy_id}/versions/{version_id}/publish",
        json={"changelog": "Initial published limit rule"},
        headers=headers,
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "PUBLISHED"

    # Verify policy current_version_id points to published version 1
    pol_resp = await client.get(f"/api/v1/policies/{policy_id}", headers=headers)
    assert pol_resp.json()["current_version_id"] == version_id

    # 5. IMMUTABILITY ENFORCEMENT: Adding a rule to PUBLISHED version returns 409 Conflict
    resp = await client.post(
        f"/api/v1/policies/{policy_id}/versions/{version_id}/rules",
        json=rule_payload,
        headers=headers,
    )
    assert resp.status_code == 409
    assert "immutable" in resp.json()["detail"].lower()

    # 6. IMMUTABILITY ENFORCEMENT: Updating a rule on PUBLISHED version returns 409 Conflict
    resp = await client.patch(
        f"/api/v1/policies/{policy_id}/versions/{version_id}/rules/{rule_id}",
        json={"description": "Illegal change"},
        headers=headers,
    )
    assert resp.status_code == 409
    assert "immutable" in resp.json()["detail"].lower()

    # 7. IMMUTABILITY ENFORCEMENT: Deleting a rule on PUBLISHED version returns 409 Conflict
    resp = await client.delete(
        f"/api/v1/policies/{policy_id}/versions/{version_id}/rules/{rule_id}",
        headers=headers,
    )
    assert resp.status_code == 409
    assert "immutable" in resp.json()["detail"].lower()

    # 8. Branch Version 2: clones rules into a new DRAFT version
    resp = await client.post(
        f"/api/v1/policies/{policy_id}/versions",
        json={"changelog": "Drafting version 2 with updated thresholds"},
        headers=headers,
    )
    assert resp.status_code == 201
    v2_data = resp.json()
    assert v2_data["version_number"] == 2
    assert v2_data["status"] == "DRAFT"
    assert len(v2_data["rules"]) == 1
    v2_id = v2_data["id"]

    # 9. Modify cloned rule on Version 2
    v2_rule_id = v2_data["rules"][0]["id"]
    resp = await client.patch(
        f"/api/v1/policies/{policy_id}/versions/{v2_id}/rules/{v2_rule_id}",
        json={"remediation_message": "Version 2 limit exceeded"},
        headers=headers,
    )
    assert resp.status_code == 200
    assert resp.json()["remediation_message"] == "Version 2 limit exceeded"

    # 10. Publish Version 2
    resp = await client.post(
        f"/api/v1/policies/{policy_id}/versions/{v2_id}/publish",
        json={"changelog": "Released version 2"},
        headers=headers,
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "PUBLISHED"

    # 11. Verify Version 1 transitioned to RETIRED and Policy current_version_id points to v2
    resp = await client.get(f"/api/v1/policies/{policy_id}/versions", headers=headers)
    assert resp.status_code == 200
    versions = resp.json()
    v1_check = next(v for v in versions if v["id"] == version_id)
    v2_check = next(v for v in versions if v["id"] == v2_id)
    assert v1_check["status"] == "RETIRED"
    assert v2_check["status"] == "PUBLISHED"

    pol_check = await client.get(f"/api/v1/policies/{policy_id}", headers=headers)
    assert pol_check.json()["current_version_id"] == v2_id


@pytest.mark.asyncio
async def test_policy_rbac(client: AsyncClient, db_session: AsyncSession) -> None:
    """Verify strict RBAC enforcement across policy operations."""
    admin_headers, org_id, _ = await _create_test_context(db_session, client, Role.ADMIN)
    analyst_headers, _, _ = await _create_test_context(db_session, client, Role.SECURITY_ANALYST, org_id=org_id)
    operator_headers, _, _ = await _create_test_context(db_session, client, Role.AGENT_OPERATOR, org_id=org_id)
    auditor_headers, _, _ = await _create_test_context(db_session, client, Role.AUDITOR, org_id=org_id)
    viewer_headers, _, _ = await _create_test_context(db_session, client, Role.VIEWER, org_id=org_id)

    # 1. Admin creates policy -> 201
    resp = await client.post(
        "/api/v1/policies",
        json={"name": "Admin Policy", "policy_type": "SECURITY", "priority": 50},
        headers=admin_headers,
    )
    assert resp.status_code == 201

    # 2. Security Analyst can create policy -> 201
    resp = await client.post(
        "/api/v1/policies",
        json={"name": "Analyst Policy", "policy_type": "COMPLIANCE", "priority": 60},
        headers=analyst_headers,
    )
    assert resp.status_code == 201

    # 3. Agent Operator cannot create policy -> 403 Forbidden
    resp = await client.post(
        "/api/v1/policies",
        json={"name": "Operator Policy", "policy_type": "OPERATIONAL", "priority": 10},
        headers=operator_headers,
    )
    assert resp.status_code == 403

    # 4. Auditor cannot create policy -> 403 Forbidden
    resp = await client.post(
        "/api/v1/policies",
        json={"name": "Auditor Policy", "policy_type": "COMPLIANCE", "priority": 10},
        headers=auditor_headers,
    )
    assert resp.status_code == 403

    # 5. Viewer cannot create policy -> 403 Forbidden
    resp = await client.post(
        "/api/v1/policies",
        json={"name": "Viewer Policy", "policy_type": "SECURITY", "priority": 10},
        headers=viewer_headers,
    )
    assert resp.status_code == 403

    # 6. Read permissions: Viewer, Auditor, Operator CAN read policies -> 200 OK
    for h in [viewer_headers, auditor_headers, operator_headers]:
        resp = await client.get("/api/v1/policies", headers=h)
        assert resp.status_code == 200
        assert resp.json()["total"] >= 2


@pytest.mark.asyncio
async def test_policy_multi_tenant_isolation(client: AsyncClient, db_session: AsyncSession) -> None:
    """Verify that policies cannot be accessed or manipulated across organization boundaries."""
    org1_headers, org1_id, _ = await _create_test_context(db_session, client, Role.ADMIN)
    org2_headers, org2_id, _ = await _create_test_context(db_session, client, Role.ADMIN)

    # 1. Org 1 creates policy
    resp = await client.post(
        "/api/v1/policies",
        json={"name": "Org 1 Confidential Policy", "policy_type": "SECURITY", "priority": 100},
        headers=org1_headers,
    )
    assert resp.status_code == 201
    policy_id = resp.json()["id"]
    version_id = await _get_initial_version_id(client, policy_id, org1_headers)

    # 2. Org 2 tries to GET Org 1 policy -> 404 Not Found
    resp = await client.get(f"/api/v1/policies/{policy_id}", headers=org2_headers)
    assert resp.status_code == 404

    # 3. Org 2 tries to modify Org 1 policy -> 404 Not Found
    resp = await client.patch(
        f"/api/v1/policies/{policy_id}",
        json={"name": "Hacked Policy"},
        headers=org2_headers,
    )
    assert resp.status_code == 404

    # 4. Org 2 tries to add rule to Org 1 policy -> 404 Not Found
    resp = await client.post(
        f"/api/v1/policies/{policy_id}/versions/{version_id}/rules",
        json={
            "rule_name": "Intruder Rule",
            "action": "DENY",
            "condition_tree": {
                "combinator": "AND",
                "conditions": [{"field": "arguments.x", "operator": "EQUALS", "value": 1}],
            },
        },
        headers=org2_headers,
    )
    assert resp.status_code == 404

    # 5. Org 2 lists policies -> returns 0 (Org 1's policies are hidden)
    resp = await client.get("/api/v1/policies", headers=org2_headers)
    assert resp.status_code == 200
    assert resp.json()["total"] == 0


@pytest.mark.asyncio
async def test_policy_ast_validation_and_redos_rejection(client: AsyncClient, db_session: AsyncSession) -> None:
    """Verify that malicious ASTs (nesting depth, condition count, ReDoS) are rejected."""
    headers, org_id, _ = await _create_test_context(db_session, client, Role.ADMIN)

    resp = await client.post(
        "/api/v1/policies",
        json={"name": "AST Guard Policy", "policy_type": "SECURITY", "priority": 100},
        headers=headers,
    )
    policy_id = resp.json()["id"]
    version_id = await _get_initial_version_id(client, policy_id, headers)

    # 1. Depth > 5 rejected
    deep_ast: dict[str, Any] = {"combinator": "AND", "conditions": [{"field": "a", "operator": "EQUALS", "value": 1}]}
    for _ in range(6):
        deep_ast = {"combinator": "AND", "conditions": [deep_ast]}

    resp = await client.post(
        f"/api/v1/policies/{policy_id}/versions/{version_id}/rules",
        json={
            "rule_name": "Deep Nesting Rule",
            "action": "DENY",
            "condition_tree": deep_ast,
        },
        headers=headers,
    )
    assert resp.status_code in (400, 422)
    assert "depth" in str(resp.json().get("detail", "")).lower() or "5" in str(resp.json().get("detail", ""))

    # 2. Condition count > 20 rejected
    many_conditions = [{"field": f"arg_{i}", "operator": "EQUALS", "value": i} for i in range(25)]
    resp = await client.post(
        f"/api/v1/policies/{policy_id}/versions/{version_id}/rules",
        json={
            "rule_name": "Excessive Conditions Rule",
            "action": "DENY",
            "condition_tree": {"combinator": "AND", "conditions": many_conditions},
        },
        headers=headers,
    )
    assert resp.status_code in (400, 422)
    assert "conditions" in str(resp.json().get("detail", "")).lower()

    # 3. Catastrophic ReDoS regex rejected
    resp = await client.post(
        f"/api/v1/policies/{policy_id}/versions/{version_id}/rules",
        json={
            "rule_name": "ReDoS Rule",
            "action": "DENY",
            "condition_tree": {
                "combinator": "AND",
                "conditions": [
                    {"field": "arguments.text", "operator": "REGEX_MATCH", "value": "(a+)+$"},
                ],
            },
        },
        headers=headers,
    )
    assert resp.status_code in (400, 422)
    detail_lower = str(resp.json().get("detail", "")).lower()
    assert "redos" in detail_lower or "regex" in detail_lower


@pytest.mark.asyncio
async def test_policy_simulation_endpoint(client: AsyncClient, db_session: AsyncSession) -> None:
    """Verify dry-run simulation of policy evaluation without executing any tool."""
    headers, org_id, user_id = await _create_test_context(db_session, client, Role.ADMIN)
    agent, tool, tool_version = await _setup_governance_fixture(db_session, org_id, user_id)

    # 1. Create and publish policy with DENY rule for operation == "drop_table"
    resp = await client.post(
        "/api/v1/policies",
        json={"name": "SQL Guard", "policy_type": "SECURITY", "priority": 100},
        headers=headers,
    )
    policy_id = resp.json()["id"]
    version_id = await _get_initial_version_id(client, policy_id, headers)

    await client.post(
        f"/api/v1/policies/{policy_id}/versions/{version_id}/rules",
        json={
            "rule_name": "Block DROP",
            "action": "DENY",
            "violation_code": "DESTRUCTIVE_COMMAND",
            "remediation_message": "DROP TABLE is forbidden",
            "condition_tree": {
                "combinator": "AND",
                "conditions": [
                    {"field": "arguments.operation", "operator": "EQUALS", "value": "drop_table"},
                ],
            },
        },
        headers=headers,
    )

    await client.post(
        f"/api/v1/policies/{policy_id}/versions/{version_id}/publish",
        json={"changelog": "Published SQL Guard"},
        headers=headers,
    )

    # Activate policy
    await client.patch(f"/api/v1/policies/{policy_id}/status", json={"status": "ACTIVE"}, headers=headers)

    # 2. Simulate matching payload -> DENY
    sim_payload = {
        "agent_id": str(agent.id),
        "tool_id": str(tool.id),
        "tool_version_id": str(tool_version.id),
        "arguments": {"operation": "drop_table", "a": 1, "b": 2},
    }
    resp = await client.post("/api/v1/policies/simulate", json=sim_payload, headers=headers)
    assert resp.status_code == 200
    sim_data = resp.json()
    assert sim_data["decision"] == "DENY"
    assert "DESTRUCTIVE_COMMAND" in sim_data["violation_codes"]
    assert "DROP TABLE is forbidden" in sim_data["remediation_messages"]
    assert len(sim_data["matched_policies"]) == 1

    # 3. Simulate non-matching payload -> ALLOW
    sim_payload_clean = {
        "agent_id": str(agent.id),
        "tool_id": str(tool.id),
        "tool_version_id": str(tool_version.id),
        "arguments": {"operation": "add", "a": 1, "b": 2},
    }
    resp = await client.post("/api/v1/policies/simulate", json=sim_payload_clean, headers=headers)
    assert resp.status_code == 200
    assert resp.json()["decision"] == "ALLOW"
    assert len(resp.json()["matched_policies"]) == 0


@pytest.mark.asyncio
async def test_governance_integration_with_active_policies(client: AsyncClient, db_session: AsyncSession) -> None:
    """Verify Governance Gateway invocation evaluates active policies and records audit traces."""
    headers, org_id, user_id = await _create_test_context(db_session, client, Role.ADMIN)
    agent, tool, tool_version = await _setup_governance_fixture(db_session, org_id, user_id)

    # 1. Create an active AgentRun via API
    run_resp = await client.post(
        "/api/v1/runs",
        json={"agent_id": str(agent.id), "environment": "DEVELOPMENT"},
        headers=headers,
    )
    assert run_resp.status_code == 201
    run_id = run_resp.json()["id"]

    # 2. Create and publish an active DENY policy for a > 100
    resp = await client.post(
        "/api/v1/policies",
        json={"name": "Max Input Threshold", "policy_type": "OPERATIONAL", "priority": 100},
        headers=headers,
    )
    policy_id = resp.json()["id"]
    version_id = await _get_initial_version_id(client, policy_id, headers)

    await client.post(
        f"/api/v1/policies/{policy_id}/versions/{version_id}/rules",
        json={
            "rule_name": "Limit argument a",
            "action": "DENY",
            "violation_code": "VALUE_OUT_OF_BOUNDS",
            "remediation_message": "Parameter 'a' must be <= 100",
            "condition_tree": {
                "combinator": "AND",
                "conditions": [
                    {"field": "arguments.a", "operator": "GREATER_THAN", "value": 100},
                ],
            },
        },
        headers=headers,
    )
    await client.post(
        f"/api/v1/policies/{policy_id}/versions/{version_id}/publish",
        json={"changelog": "Threshold v1"},
        headers=headers,
    )
    await client.patch(f"/api/v1/policies/{policy_id}/status", json={"status": "ACTIVE"}, headers=headers)

    # 3. Invocation with a = 150 (violates policy) -> Governance DENY
    inv_payload_blocked = {
        "agent_id": str(agent.id),
        "tool_id": str(tool.id),
        "tool_version_id": str(tool_version.id),
        "arguments": {"a": 150, "b": 10},
    }
    resp = await client.post(f"/api/v1/runs/{run_id}/invocations", json=inv_payload_blocked, headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["decision"] == "DENY"
    assert "VALUE_OUT_OF_BOUNDS" in data["violation_codes"]
    assert "Parameter 'a' must be <= 100" in data["reason"]

    # Verify audit trail records policy evaluation
    inv_list_resp = await client.get(f"/api/v1/runs/{run_id}/invocations", headers=headers)
    assert inv_list_resp.status_code == 200
    audit_item = inv_list_resp.json()["items"][0]
    assert audit_item["decision"] == "DENY"
    assert audit_item["policy_evaluations"] is not None
    assert audit_item["policy_evaluations"]["decision"] == "DENY"
    assert len(audit_item["policy_evaluations"]["matched_policies"]) == 1

    # 4. Invocation with a = 50 (clean) -> Governance ALLOW & Execute
    inv_payload_allowed = {
        "agent_id": str(agent.id),
        "tool_id": str(tool.id),
        "tool_version_id": str(tool_version.id),
        "arguments": {"operation": "add", "a": 50, "b": 10},
    }
    resp = await client.post(f"/api/v1/runs/{run_id}/invocations", json=inv_payload_allowed, headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["decision"] == "ALLOW"
    assert data["execution_status"] == "SUCCESS"
    assert data["result"]["result"] == 60


@pytest.mark.asyncio
async def test_governance_policy_require_approval_and_inviolable_floor(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    """Verify REQUIRE_APPROVAL policy escalation and platform baseline safety floor precedence."""
    headers, org_id, user_id = await _create_test_context(db_session, client, Role.ADMIN)
    agent, tool, tool_version = await _setup_governance_fixture(db_session, org_id, user_id)

    # 1. Create an active AgentRun via API
    run_resp = await client.post(
        "/api/v1/runs",
        json={"agent_id": str(agent.id), "environment": "DEVELOPMENT"},
        headers=headers,
    )
    assert run_resp.status_code == 201
    run_id = run_resp.json()["id"]

    # 2. Create and publish policy with REQUIRE_APPROVAL for a == 42
    resp = await client.post(
        "/api/v1/policies",
        json={"name": "Approval Trigger Policy", "policy_type": "SECURITY", "priority": 100},
        headers=headers,
    )
    policy_id = resp.json()["id"]
    version_id = await _get_initial_version_id(client, policy_id, headers)

    await client.post(
        f"/api/v1/policies/{policy_id}/versions/{version_id}/rules",
        json={
            "rule_name": "Require approval for 42",
            "action": "REQUIRE_APPROVAL",
            "remediation_message": "Magic number 42 requires human operator confirmation",
            "condition_tree": {
                "combinator": "AND",
                "conditions": [
                    {"field": "arguments.a", "operator": "EQUALS", "value": 42},
                ],
            },
        },
        headers=headers,
    )
    await client.post(
        f"/api/v1/policies/{policy_id}/versions/{version_id}/publish",
        json={"changelog": "Approval policy"},
        headers=headers,
    )
    await client.patch(f"/api/v1/policies/{policy_id}/status", json={"status": "ACTIVE"}, headers=headers)

    # Invocation with a = 42 -> triggers REQUIRE_APPROVAL
    resp = await client.post(
        f"/api/v1/runs/{run_id}/invocations",
        json={
            "agent_id": str(agent.id),
            "tool_id": str(tool.id),
            "tool_version_id": str(tool_version.id),
            "arguments": {"a": 42, "b": 8},
        },
        headers=headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["decision"] == "REQUIRE_APPROVAL"
    assert data["approval_request_id"] is not None
    assert "Magic number 42 requires human operator confirmation" in data["reason"]

    # 3. Inviolable baseline floor precedence:
    # Even if a policy says ALLOW, if the tool has CRITICAL risk, it MUST require approval.
    tool.risk_level = ToolRiskLevel.CRITICAL
    await db_session.commit()

    # Create ALLOW policy for a == 10
    resp = await client.post(
        "/api/v1/policies",
        json={"name": "Permissive Policy", "policy_type": "OPERATIONAL", "priority": 10},
        headers=headers,
    )
    p2_id = resp.json()["id"]
    p2_v_id = await _get_initial_version_id(client, p2_id, headers)
    await client.post(
        f"/api/v1/policies/{p2_id}/versions/{p2_v_id}/rules",
        json={
            "rule_name": "Always allow ten",
            "action": "ALLOW",
            "condition_tree": {
                "combinator": "AND",
                "conditions": [{"field": "arguments.a", "operator": "EQUALS", "value": 10}],
            },
        },
        headers=headers,
    )
    await client.post(
        f"/api/v1/policies/{p2_id}/versions/{p2_v_id}/publish",
        json={"changelog": "Allow ten"},
        headers=headers,
    )
    await client.patch(f"/api/v1/policies/{p2_id}/status", json={"status": "ACTIVE"}, headers=headers)

    # Invocation with a = 10: Policy says ALLOW, but tool risk is CRITICAL -> must be REQUIRE_APPROVAL
    resp = await client.post(
        f"/api/v1/runs/{run_id}/invocations",
        json={
            "agent_id": str(agent.id),
            "tool_id": str(tool.id),
            "tool_version_id": str(tool_version.id),
            "arguments": {"a": 10, "b": 5},
        },
        headers=headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["decision"] == "REQUIRE_APPROVAL"
    assert "CRITICAL risk level" in data["reason"]
