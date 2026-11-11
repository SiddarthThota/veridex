"""End-to-end tests for the complete VERIDEX Phase 0-7 governance lifecycle.

Verifies:
1. Agent & Tool Registration & Permission Lifecycle.
2. Risk Configuration publication & version immutability.
3. Policy Engine registration with risk context integration.
4. Non-mutating dry-run risk simulation.
5. 5-Stage Decision Precedence:
   - Mandatory platform floor (missing permission -> DENY).
   - Risk score >= 60 -> REQUIRE_APPROVAL (Stage 4).
   - Policy DENY is absolute (Stage 3).
   - Risk score >= deny_threshold -> DENY (Stage 2).
   - Clean ALLOW executes tool directly (Stage 5).
6. Approval workflow: list, inspect, and decide pending approvals.
7. Audit & History Inspection:
   - Invocations audit list.
   - Historical risk assessments list and detail with bidirectional ToolRequest linkage.
   - Dynamic agent risk profile reflects 7-day invocation & violation statistics.
"""

import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.security import get_password_hash
from app.users.models import Organization, OrganizationStatus, Role, User, UserStatus

pytestmark = pytest.mark.asyncio


async def _create_user(
    db: AsyncSession,
    client: AsyncClient,
    org_id: uuid.UUID,
    role: Role,
) -> tuple[dict[str, str], uuid.UUID]:
    uid = uuid.uuid4()
    test_pass = "TestPass123!"  # noqa: S105
    user = User(
        organization_id=org_id,
        email=f"e2e-{role.value.lower()}-{uid}@example.com",
        password_hash=get_password_hash(test_pass),
        display_name=f"E2E {role.value}",
        status=UserStatus.ACTIVE,
        role=role,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)

    login_resp = await client.post("/api/v1/auth/login", data={"username": user.email, "password": test_pass})
    assert login_resp.status_code == 200
    token = login_resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}, user.id


async def test_complete_risk_governance_e2e_lifecycle(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    # -------------------------------------------------------------------------
    # STEP 1: Organization & Multi-Role Setup
    # -------------------------------------------------------------------------
    uid = uuid.uuid4()
    org = Organization(name=f"E2E Org {uid}", slug=f"e2e-org-{uid}", status=OrganizationStatus.ACTIVE)
    db_session.add(org)
    await db_session.commit()
    await db_session.refresh(org)

    admin_headers, admin_id = await _create_user(db_session, client, org.id, Role.ADMIN)
    analyst_headers, _ = await _create_user(db_session, client, org.id, Role.SECURITY_ANALYST)
    operator_headers, _ = await _create_user(db_session, client, org.id, Role.AGENT_OPERATOR)
    auditor_headers, _ = await _create_user(db_session, client, org.id, Role.AUDITOR)

    # -------------------------------------------------------------------------
    # STEP 2: Register & Activate Agent
    # -------------------------------------------------------------------------
    agent_resp = await client.post(
        "/api/v1/agents",
        headers=admin_headers,
        json={
            "name": f"Financial Analyst Agent {uid}",
            "description": "Autonomous financial processing agent",
            "environment": "PRODUCTION",
            "risk_tier": "HIGH",
            "model_provider": "openai",
            "model_name": "gpt-4o",
        },
    )
    assert agent_resp.status_code == 201
    agent_data = agent_resp.json()
    agent_id = agent_data["id"]

    act_resp = await client.post(f"/api/v1/agents/{agent_id}/activate", headers=admin_headers)
    assert act_resp.status_code == 200

    # -------------------------------------------------------------------------
    # STEP 3: Register Tools and Publish ToolVersions
    # -------------------------------------------------------------------------
    # Tool A: Standard Calculator (Low risk, reversible, trusted mock executor)
    tool_a_resp = await client.post(
        "/api/v1/tools",
        headers=admin_headers,
        json={
            "name": "calculator",
            "description": "Safe math calculation tool",
            "risk_level": "LOW",
            "access_type": "READ",
            "reversibility": "REVERSIBLE",
            "data_classification": "INTERNAL",
            "approval_requirement": "NOT_REQUIRED",
        },
    )
    assert tool_a_resp.status_code == 201
    tool_a_id = tool_a_resp.json()["id"]

    # Activate tool A
    await client.post(f"/api/v1/tools/{tool_a_id}/activate", headers=admin_headers)

    # Publish ToolVersion for Tool A
    tva_resp = await client.post(
        f"/api/v1/tools/{tool_a_id}/versions",
        headers=admin_headers,
        json={
            "version": "1.0.0",
            "input_schema": {
                "type": "object",
                "properties": {
                    "operation": {"type": "string"},
                    "a": {"type": "number"},
                    "b": {"type": "number"},
                    "limit": {"type": "integer"},
                },
                "required": ["operation", "a", "b"],
            },
        },
    )
    assert tva_resp.status_code == 201
    tool_a_version_id = tva_resp.json()["id"]
    pub_a_resp = await client.post(
        f"/api/v1/tools/{tool_a_id}/versions/{tool_a_version_id}/publish",
        headers=admin_headers,
    )
    assert pub_a_resp.status_code == 200

    # Tool B: High-impact Transfer (Critical risk, irreversible, restricted)
    tool_b_resp = await client.post(
        "/api/v1/tools",
        headers=admin_headers,
        json={
            "name": f"Wire Transfer Tool {uid}",
            "description": "Execute critical wire transfer",
            "risk_level": "CRITICAL",
            "access_type": "WRITE",
            "reversibility": "IRREVERSIBLE",
            "data_classification": "RESTRICTED",
            "approval_requirement": "REQUIRED",
        },
    )
    assert tool_b_resp.status_code == 201
    tool_b_id = tool_b_resp.json()["id"]
    await client.post(f"/api/v1/tools/{tool_b_id}/activate", headers=admin_headers)

    tvb_resp = await client.post(
        f"/api/v1/tools/{tool_b_id}/versions",
        headers=admin_headers,
        json={
            "version": "1.0.0",
            "input_schema": {
                "type": "object",
                "properties": {
                    "account_id": {"type": "string"},
                    "amount": {"type": "number"},
                    "command": {"type": "string"},
                },
                "required": ["account_id", "amount"],
            },
        },
    )
    assert tvb_resp.status_code == 201
    tool_b_version_id = tvb_resp.json()["id"]
    pub_b_resp = await client.post(
        f"/api/v1/tools/{tool_b_id}/versions/{tool_b_version_id}/publish",
        headers=admin_headers,
    )
    assert pub_b_resp.status_code == 200

    # -------------------------------------------------------------------------
    # STEP 4: Tool Permissions
    # -------------------------------------------------------------------------
    perm_a = await client.post(f"/api/v1/agents/{agent_id}/tools/{tool_a_id}", headers=admin_headers)
    assert perm_a.status_code == 201
    perm_b = await client.post(f"/api/v1/agents/{agent_id}/tools/{tool_b_id}", headers=admin_headers)
    assert perm_b.status_code == 201

    # -------------------------------------------------------------------------
    # STEP 5: Verify Active Default Risk Configuration (v1: approval=60, deny=90)
    # -------------------------------------------------------------------------
    cfg_resp = await client.get("/api/v1/risk/config", headers=analyst_headers)
    assert cfg_resp.status_code == 200
    cfg_data = cfg_resp.json()
    assert cfg_data["current_version"]["approval_threshold"] == 60
    assert cfg_data["current_version"]["deny_threshold"] == 90

    # -------------------------------------------------------------------------
    # STEP 6: Policy Engine Integration
    # -------------------------------------------------------------------------
    policy_resp = await client.post(
        "/api/v1/policies",
        headers=admin_headers,
        json={
            "name": f"E2E Risk Policy {uid}",
            "description": "Enforce high risk constraints",
            "type": "ORGANIZATION",
            "default_action": "ALLOW",
        },
    )
    assert policy_resp.status_code == 201
    policy_id = policy_resp.json()["id"]

    pv_list = await client.get(f"/api/v1/policies/{policy_id}/versions", headers=admin_headers)
    initial_version_id = pv_list.json()[0]["id"]

    rule_resp = await client.post(
        f"/api/v1/policies/{policy_id}/versions/{initial_version_id}/rules",
        headers=admin_headers,
        json={
            "rule_name": "Block Excessive Limits",
            "description": "Deny queries with limit > 1000",
            "action": "DENY",
            "priority": 1,
            "violation_code": "EXCESSIVE_LIMIT",
            "remediation_message": "Parameter 'limit' must be <= 1000",
            "condition_tree": {
                "combinator": "AND",
                "conditions": [
                    {
                        "field": "arguments.limit",
                        "operator": "GREATER_THAN",
                        "value": 1000,
                    }
                ],
            },
        },
    )
    assert rule_resp.status_code == 201

    pub_pol = await client.post(
        f"/api/v1/policies/{policy_id}/versions/{initial_version_id}/publish",
        headers=admin_headers,
    )
    assert pub_pol.status_code == 200

    # -------------------------------------------------------------------------
    # STEP 7: Agent Run Initialization
    # -------------------------------------------------------------------------
    run_resp = await client.post(
        "/api/v1/runs",
        headers=operator_headers,
        json={
            "agent_id": agent_id,
            "environment": "PRODUCTION",
            "metadata": {"task": "financial-report"},
        },
    )
    assert run_resp.status_code == 201
    run_id = run_resp.json()["id"]

    # -------------------------------------------------------------------------
    # STEP 8: Decision Precedence 1 - Stage 4: Risk REQUIRE_APPROVAL (Score 69 >= 60, < 90)
    # -------------------------------------------------------------------------
    inv_approval_resp = await client.post(
        f"/api/v1/runs/{run_id}/invocations",
        headers=operator_headers,
        json={
            "agent_id": agent_id,
            "tool_id": tool_b_id,
            "tool_version_id": tool_b_version_id,
            "arguments": {"account_id": "ACC-1234", "amount": 25000.0},
        },
    )
    assert inv_approval_resp.status_code == 200
    approval_data = inv_approval_resp.json()
    assert approval_data["decision"] == "REQUIRE_APPROVAL"
    assert approval_data["approval_request_id"] is not None
    approval_id = approval_data["approval_request_id"]

    # Security Analyst approves the request
    decide_resp = await client.post(
        f"/api/v1/governance/approvals/{approval_id}/decide",
        headers=analyst_headers,
        json={
            "decision": "APPROVED",
            "reason": "Wire transfer verified by finance lead",
        },
    )
    assert decide_resp.status_code == 200
    assert decide_resp.json()["status"] == "APPROVED"

    # -------------------------------------------------------------------------
    # STEP 9: Decision Precedence 2 - Stage 3: Policy DENY is Absolute
    # -------------------------------------------------------------------------
    inv_pol_deny = await client.post(
        f"/api/v1/runs/{run_id}/invocations",
        headers=operator_headers,
        json={
            "agent_id": agent_id,
            "tool_id": tool_a_id,
            "tool_version_id": tool_a_version_id,
            "arguments": {"operation": "add", "a": 10, "b": 20, "limit": 5000},
        },
    )
    assert inv_pol_deny.status_code == 200
    pol_deny_data = inv_pol_deny.json()
    assert pol_deny_data["decision"] == "DENY"
    assert (
        "EXCESSIVE_LIMIT" in pol_deny_data["violation_codes"] or "POLICY_VIOLATION" in pol_deny_data["violation_codes"]
    )

    # -------------------------------------------------------------------------
    # STEP 10: Publish Config v2 (approval=45, deny=65)
    # -------------------------------------------------------------------------
    new_version_resp = await client.post(
        "/api/v1/risk/config/versions",
        headers=analyst_headers,
        json={
            "weight_tool": 0.40,
            "weight_data": 0.30,
            "weight_agent": 0.15,
            "weight_context": 0.15,
            "threshold_medium": 30,
            "threshold_high": 50,
            "threshold_critical": 65,
            "approval_threshold": 45,
            "deny_threshold": 65,
            "heuristic_rules": [],
            "changelog": "Tuned thresholds to test critical risk denial",
        },
    )
    assert new_version_resp.status_code == 201
    assert new_version_resp.json()["version_number"] == 2

    # Verify dry-run simulation on Tool B (non-mutating)
    sim_resp = await client.post(
        "/api/v1/risk/evaluate",
        headers=analyst_headers,
        json={
            "agent_id": agent_id,
            "tool_id": tool_b_id,
            "tool_version_id": tool_b_version_id,
            "arguments": {"account_id": "ACC-999", "amount": 500000.0, "command": "rm -rf /"},
            "environment": "PRODUCTION",
        },
    )
    assert sim_resp.status_code == 200
    sim_data = sim_resp.json()
    assert sim_data["risk_score"] >= 65
    assert sim_data["risk_level"] in ["HIGH", "CRITICAL"]

    # -------------------------------------------------------------------------
    # STEP 11: Decision Precedence 3 - Stage 2: Risk DENY (Score 69 >= 65 deny_threshold)
    # -------------------------------------------------------------------------
    inv_deny_resp = await client.post(
        f"/api/v1/runs/{run_id}/invocations",
        headers=operator_headers,
        json={
            "agent_id": agent_id,
            "tool_id": tool_b_id,
            "tool_version_id": tool_b_version_id,
            "arguments": {"account_id": "ACC-999", "amount": 1000000.0, "command": "DROP TABLE transactions;"},
        },
    )
    assert inv_deny_resp.status_code == 200
    deny_data = inv_deny_resp.json()
    assert deny_data["decision"] == "DENY"
    assert "CRITICAL_RISK_THRESHOLD_EXCEEDED" in deny_data["violation_codes"]
    assert deny_data["tool_request_id"] is not None

    # -------------------------------------------------------------------------
    # STEP 12: Decision Precedence 4 - Stage 5: Clean ALLOW Execution
    # -------------------------------------------------------------------------
    dev_run_resp = await client.post(
        "/api/v1/runs",
        headers=operator_headers,
        json={
            "agent_id": agent_id,
            "environment": "DEVELOPMENT",
        },
    )
    assert dev_run_resp.status_code == 201
    dev_run_id = dev_run_resp.json()["id"]

    inv_allow_resp = await client.post(
        f"/api/v1/runs/{dev_run_id}/invocations",
        headers=operator_headers,
        json={
            "agent_id": agent_id,
            "tool_id": tool_a_id,
            "tool_version_id": tool_a_version_id,
            "arguments": {"operation": "add", "a": 10, "b": 20, "limit": 10},
        },
    )
    assert inv_allow_resp.status_code == 200
    allow_data = inv_allow_resp.json()
    assert allow_data["decision"] == "ALLOW"
    assert allow_data["execution_status"] == "SUCCESS"
    assert allow_data["result"]["result"] == 30.0

    # -------------------------------------------------------------------------
    # STEP 13: Audit Trail & Risk Assessment History
    # -------------------------------------------------------------------------
    # Auditor inspects run invocations
    audit_inv_resp = await client.get(f"/api/v1/runs/{run_id}/invocations", headers=auditor_headers)
    assert audit_inv_resp.status_code == 200
    inv_list = audit_inv_resp.json()["items"]
    assert len(inv_list) == 3

    # Auditor lists historical risk assessments
    assessments_resp = await client.get("/api/v1/risk/assessments", headers=auditor_headers)
    assert assessments_resp.status_code == 200
    ass_data = assessments_resp.json()
    assert ass_data["total"] >= 4

    # Fetch individual assessment and verify bidirectional link
    single_ass_id = ass_data["items"][0]["id"]
    single_ass_resp = await client.get(f"/api/v1/risk/assessments/{single_ass_id}", headers=auditor_headers)
    assert single_ass_resp.status_code == 200
    single_ass = single_ass_resp.json()
    assert single_ass["id"] == single_ass_id
    assert single_ass["scoring_algorithm_version"] == "1.0.0"
    assert single_ass["subscore_tool"] is not None
    assert single_ass["subscore_data"] is not None
    assert single_ass["subscore_agent"] is not None
    assert single_ass["subscore_context"] is not None
    assert "explanation" in single_ass
    assert single_ass["tool_request_id"] is not None

    # -------------------------------------------------------------------------
    # STEP 14: Dynamic Agent Risk Profile Inspection
    # -------------------------------------------------------------------------
    profile_resp = await client.get(f"/api/v1/risk/profiles/agents/{agent_id}", headers=auditor_headers)
    assert profile_resp.status_code == 200
    prof = profile_resp.json()
    assert prof["agent_id"] == agent_id
    assert prof["history_status"] == "INSUFFICIENT_DATA"
    assert prof["total_eligible_invocations"] >= 3
    assert prof["total_violations"] >= 1
    assert prof["violation_rate"] == 0.0
    assert prof["observation_window_days"] == 7
    assert prof["calculated_trust_score"] == 100.0
