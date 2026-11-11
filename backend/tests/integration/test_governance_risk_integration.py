"""Comprehensive integration tests for Phase 7.3: Governance Gateway & Policy Engine Integration.

Verifies:
1. 5-Stage Precedence Pipeline:
   - Stage 1: Mandatory Platform Floor (unknown agent, inactive agent, tool not found, inactive tool,
     unpublished version, permission denied, schema validation failure).
   - Stage 2: Risk Denial Pre-Check (score >= deny_threshold returns DENY with CRITICAL_RISK_THRESHOLD_EXCEEDED).
   - Stage 3: Declarative Policy Engine Evaluation with trusted context.risk_score / context.risk_level injection.
     Policy DENY is absolute. Policy ALLOW never overrides risk denial.
   - Stage 4: Approval Synthesis (score >= approval_threshold triggers REQUIRE_APPROVAL; platform baseline
     safety triggers cannot be overridden by policy ALLOW).
   - Stage 5: Clean ALLOW when all checks, thresholds, and policies pass.
2. Risk Assessment Persistence & Auditability:
   - ToolRequest.risk_assessment_id and RiskAssessment.tool_request_id bidirectional linkage.
   - Snapshot, scoring algorithm version, 4 subscores, factor breakdown, explanation, and timestamps.
   - Dry-run evaluate does NOT persist RiskAssessment records.
   - Idempotency key replay returns cached result with zero duplicate assessments.
   - Fail-closed behavior on evaluation or persistence error.
3. Multi-Tenant Isolation:
   - Separate organization risk configurations and assessments are strictly isolated.
"""

import uuid
from unittest.mock import patch

import pytest
from httpx import AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.agents.models import Agent, AgentEnvironment, AgentRiskTier, AgentStatus
from app.auth.security import get_password_hash
from app.governance.models import (
    GovernanceDecision,
    GovernanceViolationCode,
    ToolRequest,
)
from app.governance.service import governance_service
from app.risk.models import (
    RiskAssessment,
    RiskConfiguration,
    RiskConfigurationVersion,
    RiskLevel,
)
from app.risk.service import RiskEngineService
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
        org = Organization(name=f"Risk Test Org {uid}", slug=f"risk-org-{uid}", status=OrganizationStatus.ACTIVE)
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
    agent_status: AgentStatus = AgentStatus.ACTIVE,
    agent_tier: AgentRiskTier = AgentRiskTier.LOW,
    tool_status: ToolStatus = ToolStatus.ACTIVE,
    version_status: ToolVersionStatus = ToolVersionStatus.PUBLISHED,
) -> tuple[Agent, Tool, ToolVersion]:
    """Populate agent, tool, version, and permission for testing."""
    uid = uuid.uuid4()
    agent = Agent(
        organization_id=org_id,
        owner_user_id=user_id,
        name=f"agent-{uid}",
        slug=f"agent-{uid}",
        status=agent_status,
        environment=AgentEnvironment.PRODUCTION,
        risk_tier=agent_tier,
        model_provider="openai",
        model_name="gpt-4o",
    )
    db_session.add(agent)

    tool = Tool(
        organization_id=org_id,
        name=f"tool-{uid}",
        slug=tool_slug,
        owner_user_id=user_id,
        status=tool_status,
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
        input_schema={
            "type": "object",
            "properties": {
                "operation": {"type": "string"},
                "a": {"type": "number"},
                "b": {"type": "number"},
                "command": {"type": "string"},
                "target": {"type": "string"},
            },
            "required": ["operation"],
        },
        status=version_status,
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


# ==============================================================================
# 1. Risk Threshold Enforcement Tests
# ==============================================================================


@pytest.mark.asyncio
async def test_risk_threshold_allow_when_below_thresholds(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    """Verify clean ALLOW when risk score is below approval_threshold (60) and deny_threshold (90)."""
    headers, org_id, user_id = await _create_test_context(db_session, client)
    agent, tool, tool_version = await _setup_governance_fixture(
        db_session,
        org_id,
        user_id,
        risk_level=ToolRiskLevel.LOW,
        access_type=ToolAccessType.READ,
        reversibility=ToolReversibility.REVERSIBLE,
        data_classification=ToolDataClassification.PUBLIC,
    )

    run_resp = await client.post(
        "/api/v1/runs",
        json={"agent_id": str(agent.id), "environment": "DEVELOPMENT"},
        headers=headers,
    )
    assert run_resp.status_code == 201
    run_id = run_resp.json()["id"]

    inv_payload = {
        "agent_id": str(agent.id),
        "tool_id": str(tool.id),
        "tool_version_id": str(tool_version.id),
        "arguments": {"operation": "add", "a": 5, "b": 10},
    }
    resp = await client.post(f"/api/v1/runs/{run_id}/invocations", json=inv_payload, headers=headers)
    assert resp.status_code == 200
    data = resp.json()

    assert data["decision"] == "ALLOW"
    assert data["execution_status"] == "SUCCESS"
    assert data["violation_codes"] == []

    # Verify RiskAssessment persistence
    req_stmt = select(ToolRequest).where(ToolRequest.id == uuid.UUID(data["tool_request_id"]))
    tool_req = (await db_session.execute(req_stmt)).scalar_one()
    assert tool_req.risk_assessment_id is not None

    risk_stmt = select(RiskAssessment).where(RiskAssessment.id == tool_req.risk_assessment_id)
    assessment = (await db_session.execute(risk_stmt)).scalar_one()
    assert assessment.risk_score < 60
    assert assessment.risk_level in {RiskLevel.LOW, RiskLevel.MEDIUM}
    assert assessment.tool_request_id == tool_req.id


@pytest.mark.asyncio
async def test_risk_threshold_require_approval_when_score_exceeds_approval_threshold(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    """Verify REQUIRE_APPROVAL when risk score >= approval_threshold (60) but < deny_threshold (90)."""
    headers, org_id, user_id = await _create_test_context(db_session, client)
    # Configure an active RiskConfigurationVersion with approval_threshold=20
    config = RiskConfiguration(organization_id=org_id, is_active=True)
    db_session.add(config)
    await db_session.commit()
    await db_session.refresh(config)

    config_v1 = RiskConfigurationVersion(
        risk_configuration_id=config.id,
        version_number=1,
        approval_threshold=10,  # Sensitive approval threshold (score is ~12)
        deny_threshold=90,
    )
    db_session.add(config_v1)
    await db_session.commit()
    await db_session.refresh(config_v1)

    config.current_version_id = config_v1.id
    await db_session.commit()

    agent, tool, tool_version = await _setup_governance_fixture(
        db_session,
        org_id,
        user_id,
        risk_level=ToolRiskLevel.LOW,
        access_type=ToolAccessType.READ,
        reversibility=ToolReversibility.REVERSIBLE,
        data_classification=ToolDataClassification.INTERNAL,
    )

    run_resp = await client.post(
        "/api/v1/runs",
        json={"agent_id": str(agent.id), "environment": "DEVELOPMENT"},
        headers=headers,
    )
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

    assert data["decision"] == "REQUIRE_APPROVAL"
    assert "APPROVAL_REQUIRED" in data["violation_codes"]
    assert "exceeds approval threshold" in data["reason"]
    assert data["approval_request_id"] is not None

    # Verify RiskAssessment has the custom config_version_id recorded
    req_stmt = select(ToolRequest).where(ToolRequest.id == uuid.UUID(data["tool_request_id"]))
    tool_req = (await db_session.execute(req_stmt)).scalar_one()
    assert tool_req.risk_assessment_id is not None

    risk_stmt = select(RiskAssessment).where(RiskAssessment.id == tool_req.risk_assessment_id)
    assessment = (await db_session.execute(risk_stmt)).scalar_one()
    assert assessment.config_version_id == config_v1.id
    assert assessment.risk_score >= 10


@pytest.mark.asyncio
async def test_risk_threshold_critical_deny_precheck(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    """Verify Stage 2 Risk Denial Pre-Check: risk_score >= deny_threshold returns DENY immediately."""
    headers, org_id, user_id = await _create_test_context(db_session, client)

    # Configure custom deny threshold = 15 (score in PRODUCTION is ~17)
    config = RiskConfiguration(organization_id=org_id, is_active=True)
    db_session.add(config)
    await db_session.commit()
    await db_session.refresh(config)

    config_v1 = RiskConfigurationVersion(
        risk_configuration_id=config.id,
        version_number=1,
        approval_threshold=10,
        deny_threshold=15,  # Very strict deny threshold
    )
    db_session.add(config_v1)
    await db_session.commit()
    await db_session.refresh(config_v1)

    config.current_version_id = config_v1.id
    await db_session.commit()

    agent, tool, tool_version = await _setup_governance_fixture(
        db_session,
        org_id,
        user_id,
        risk_level=ToolRiskLevel.LOW,
        access_type=ToolAccessType.READ,
        reversibility=ToolReversibility.REVERSIBLE,
        data_classification=ToolDataClassification.INTERNAL,
    )

    run_resp = await client.post(
        "/api/v1/runs",
        json={"agent_id": str(agent.id), "environment": "PRODUCTION"},
        headers=headers,
    )
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

    assert data["decision"] == "DENY"
    assert GovernanceViolationCode.CRITICAL_RISK_THRESHOLD_EXCEEDED.value in data["violation_codes"]
    assert "exceeds critical deny threshold" in data["reason"]

    # Verify RiskAssessment persisted even on risk denial
    req_stmt = select(ToolRequest).where(ToolRequest.id == uuid.UUID(data["tool_request_id"]))
    tool_req = (await db_session.execute(req_stmt)).scalar_one()
    assert tool_req.risk_assessment_id is not None


# ==============================================================================
# 2. Decision Precedence Tests
# ==============================================================================


@pytest.mark.asyncio
async def test_precedence_stage1_platform_floor_halts_before_risk_evaluation(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    """Verify Stage 1 platform floor failure denies immediately without creating RiskAssessment."""
    headers, org_id, user_id = await _create_test_context(db_session, client)
    # Agent is INACTIVE
    agent, tool, tool_version = await _setup_governance_fixture(
        db_session,
        org_id,
        user_id,
        agent_status=AgentStatus.SUSPENDED,
    )

    # Direct service call to verify _evaluate_policy Stage 1 behavior
    decision, violations, reason, _tool, _tool_version = await governance_service._evaluate_policy(
        db=db_session,
        organization_id=org_id,
        agent_id=agent.id,
        tool_id=tool.id,
        tool_version_id=tool_version.id,
        arguments={"operation": "add"},
    )

    assert decision == GovernanceDecision.DENY
    assert GovernanceViolationCode.INACTIVE_AGENT in violations
    assert governance_service._last_risk_evaluation is None


@pytest.mark.asyncio
async def test_precedence_policy_allow_cannot_override_risk_deny(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    """Verify that a declarative policy ALLOW cannot override a risk-based DENY."""
    headers, org_id, user_id = await _create_test_context(db_session, client)

    # Set up organization with deny_threshold=10 (score is ~12)
    config = RiskConfiguration(organization_id=org_id, is_active=True)
    db_session.add(config)
    await db_session.commit()
    config_v = RiskConfigurationVersion(
        risk_configuration_id=config.id,
        version_number=1,
        approval_threshold=5,
        deny_threshold=10,
    )
    db_session.add(config_v)
    await db_session.commit()
    config.current_version_id = config_v.id
    await db_session.commit()

    agent, tool, tool_version = await _setup_governance_fixture(db_session, org_id, user_id)

    # Create active policy with ALLOW action
    p_resp = await client.post(
        "/api/v1/policies",
        json={"name": "Explicit Allow Policy", "policy_type": "SECURITY", "priority": 100},
        headers=headers,
    )
    policy_id = p_resp.json()["id"]

    v_list = await client.get(f"/api/v1/policies/{policy_id}/versions", headers=headers)
    v_id = v_list.json()[0]["id"]

    await client.post(
        f"/api/v1/policies/{policy_id}/versions/{v_id}/rules",
        json={
            "rule_name": "Always Allow Rule",
            "action": "ALLOW",
            "condition_tree": {
                "combinator": "AND",
                "conditions": [{"field": "agent.environment", "operator": "EQUALS", "value": "PRODUCTION"}],
            },
        },
        headers=headers,
    )
    await client.post(f"/api/v1/policies/{policy_id}/versions/{v_id}/publish", headers=headers)

    run_resp = await client.post(
        "/api/v1/runs",
        json={"agent_id": str(agent.id), "environment": "DEVELOPMENT"},
        headers=headers,
    )
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

    # Pre-check at Stage 2 stopped evaluation with DENY before Policy ALLOW could take effect
    assert data["decision"] == "DENY"
    assert GovernanceViolationCode.CRITICAL_RISK_THRESHOLD_EXCEEDED.value in data["violation_codes"]


@pytest.mark.asyncio
async def test_precedence_policy_deny_is_absolute(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    """Verify that when risk score is low (< 60), an active Policy DENY still forces DENY."""
    headers, org_id, user_id = await _create_test_context(db_session, client)
    agent, tool, tool_version = await _setup_governance_fixture(
        db_session,
        org_id,
        user_id,
        risk_level=ToolRiskLevel.LOW,
        access_type=ToolAccessType.READ,
        reversibility=ToolReversibility.REVERSIBLE,
        data_classification=ToolDataClassification.PUBLIC,
    )

    # Create active policy with DENY action
    p_resp = await client.post(
        "/api/v1/policies",
        json={"name": "Strict Deny Policy", "policy_type": "SECURITY", "priority": 100},
        headers=headers,
    )
    policy_id = p_resp.json()["id"]

    v_list = await client.get(f"/api/v1/policies/{policy_id}/versions", headers=headers)
    v_id = v_list.json()[0]["id"]

    await client.post(
        f"/api/v1/policies/{policy_id}/versions/{v_id}/rules",
        json={
            "rule_name": "Deny Add Operations",
            "action": "DENY",
            "remediation_message": "Add operations are strictly forbidden",
            "violation_code": "CUSTOM_OPERATION_DENIED",
            "condition_tree": {
                "combinator": "AND",
                "conditions": [{"field": "arguments.operation", "operator": "EQUALS", "value": "add"}],
            },
        },
        headers=headers,
    )
    await client.post(f"/api/v1/policies/{policy_id}/versions/{v_id}/publish", headers=headers)

    run_resp = await client.post(
        "/api/v1/runs",
        json={"agent_id": str(agent.id), "environment": "DEVELOPMENT"},
        headers=headers,
    )
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

    assert data["decision"] == "DENY"
    assert "CUSTOM_OPERATION_DENIED" in data["violation_codes"]
    assert "Add operations are strictly forbidden" in data["reason"]


@pytest.mark.asyncio
async def test_precedence_platform_baseline_safety_overrides_policy_allow(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    """Verify platform baseline safety floor (e.g. CRITICAL tool) forces REQUIRE_APPROVAL.

    Safety floor cannot be bypassed even if Policy returns ALLOW.
    """
    headers, org_id, user_id = await _create_test_context(db_session, client)
    # Tool has CRITICAL risk level
    agent, tool, tool_version = await _setup_governance_fixture(
        db_session,
        org_id,
        user_id,
        risk_level=ToolRiskLevel.CRITICAL,
    )

    # Publish an ALLOW policy
    p_resp = await client.post(
        "/api/v1/policies",
        json={"name": "Permissive Policy", "policy_type": "OPERATIONAL", "priority": 10},
        headers=headers,
    )
    policy_id = p_resp.json()["id"]
    v_list = await client.get(f"/api/v1/policies/{policy_id}/versions", headers=headers)
    v_id = v_list.json()[0]["id"]

    await client.post(
        f"/api/v1/policies/{policy_id}/versions/{v_id}/rules",
        json={
            "rule_name": "Allow Rule",
            "action": "ALLOW",
            "condition_tree": {
                "combinator": "AND",
                "conditions": [{"field": "agent.risk_tier", "operator": "EQUALS", "value": "LOW"}],
            },
        },
        headers=headers,
    )
    await client.post(f"/api/v1/policies/{policy_id}/versions/{v_id}/publish", headers=headers)

    run_resp = await client.post(
        "/api/v1/runs",
        json={"agent_id": str(agent.id), "environment": "DEVELOPMENT"},
        headers=headers,
    )
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

    # Stage 4 synthesized approval because Tool has CRITICAL risk level
    assert data["decision"] == "REQUIRE_APPROVAL"
    assert "Tool has CRITICAL risk level" in data["reason"]


# ==============================================================================
# 3. Policy Engine Context Injection & Spoofing Resistance
# ==============================================================================


@pytest.mark.asyncio
async def test_policy_context_injection_and_spoofing_defense(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    """Verify active policies can evaluate injected context.risk_score, and client spoofing attempts fail."""
    headers, org_id, user_id = await _create_test_context(db_session, client)
    agent, tool, tool_version = await _setup_governance_fixture(
        db_session,
        org_id,
        user_id,
        risk_level=ToolRiskLevel.LOW,
        access_type=ToolAccessType.READ,
        reversibility=ToolReversibility.REVERSIBLE,
        data_classification=ToolDataClassification.INTERNAL,
    )

    # Create policy triggering on server-injected context.risk_score >= 20
    p_resp = await client.post(
        "/api/v1/policies",
        json={"name": "Risk Context Inspector Policy", "policy_type": "SECURITY", "priority": 100},
        headers=headers,
    )
    policy_id = p_resp.json()["id"]
    v_list = await client.get(f"/api/v1/policies/{policy_id}/versions", headers=headers)
    v_id = v_list.json()[0]["id"]

    await client.post(
        f"/api/v1/policies/{policy_id}/versions/{v_id}/rules",
        json={
            "rule_name": "Inspect context.risk_score",
            "action": "REQUIRE_APPROVAL",
            "remediation_message": "Policy detected server-injected risk score >= 10",
            "violation_code": "ELEVATED_RISK_DETECTED",
            "condition_tree": {
                "combinator": "AND",
                "conditions": [
                    {"field": "context.risk_score", "operator": "GREATER_THAN_OR_EQUAL", "value": 10},
                ],
            },
        },
        headers=headers,
    )
    await client.post(f"/api/v1/policies/{policy_id}/versions/{v_id}/publish", headers=headers)

    run_resp = await client.post(
        "/api/v1/runs",
        json={"agent_id": str(agent.id), "environment": "DEVELOPMENT"},
        headers=headers,
    )
    run_id = run_resp.json()["id"]

    # Invocation with spoofing attempt in arguments: {"context": {"risk_score": 0}, "risk_score": 0}
    # Server calculates true risk score (~22) and puts it in context.risk_score.
    inv_payload = {
        "agent_id": str(agent.id),
        "tool_id": str(tool.id),
        "tool_version_id": str(tool_version.id),
        "arguments": {
            "operation": "add",
            "a": 1,
            "b": 2,
            "context": {"risk_score": 0},
            "risk_score": 0,
        },
    }
    resp = await client.post(f"/api/v1/runs/{run_id}/invocations", json=inv_payload, headers=headers)
    assert resp.status_code == 200
    data = resp.json()

    assert data["decision"] == "REQUIRE_APPROVAL"
    assert "ELEVATED_RISK_DETECTED" in data["violation_codes"]
    assert "Policy detected server-injected risk score >= 10" in data["reason"]


# ==============================================================================
# 4. Assessment Persistence, Auditability, and Idempotency
# ==============================================================================


@pytest.mark.asyncio
async def test_risk_assessment_persistence_and_bidirectional_linkage(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    """Verify bidirectional link between ToolRequest and RiskAssessment, subscores, snapshot, and metadata."""
    headers, org_id, user_id = await _create_test_context(db_session, client)
    agent, tool, tool_version = await _setup_governance_fixture(db_session, org_id, user_id)

    run_resp = await client.post(
        "/api/v1/runs",
        json={"agent_id": str(agent.id), "environment": "DEVELOPMENT"},
        headers=headers,
    )
    run_id = run_resp.json()["id"]

    inv_payload = {
        "agent_id": str(agent.id),
        "tool_id": str(tool.id),
        "tool_version_id": str(tool_version.id),
        "arguments": {"operation": "add", "a": 10, "b": 20},
    }
    resp = await client.post(f"/api/v1/runs/{run_id}/invocations", json=inv_payload, headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    tool_request_id = uuid.UUID(data["tool_request_id"])

    # Query ToolRequest
    tool_req = (await db_session.execute(select(ToolRequest).where(ToolRequest.id == tool_request_id))).scalar_one()

    assert tool_req.risk_assessment_id is not None

    # Query RiskAssessment
    assessment = (
        await db_session.execute(select(RiskAssessment).where(RiskAssessment.id == tool_req.risk_assessment_id))
    ).scalar_one()

    # Verify bidirectional link
    assert assessment.tool_request_id == tool_request_id
    assert assessment.agent_id == agent.id
    assert assessment.tool_id == tool.id
    assert assessment.tool_version_id == tool_version.id
    assert assessment.scoring_algorithm_version == "1.0.0"

    # Verify scores and breakdown
    assert 0 <= assessment.risk_score <= 100
    assert 0 <= assessment.subscore_tool <= 100
    assert 0 <= assessment.subscore_data <= 100
    assert 0 <= assessment.subscore_agent <= 100
    assert 0 <= assessment.subscore_context <= 100
    assert isinstance(assessment.factor_breakdown, dict)
    assert isinstance(assessment.heuristics_matched, list)
    assert isinstance(assessment.config_snapshot, dict)
    assert assessment.explanation is not None
    assert assessment.assessed_at is not None


@pytest.mark.asyncio
async def test_dry_run_governance_evaluate_does_not_persist_assessment(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    """Verify that dry-run evaluate assesses risk accurately but does NOT persist RiskAssessment records."""
    headers, org_id, user_id = await _create_test_context(db_session, client)
    agent, tool, tool_version = await _setup_governance_fixture(db_session, org_id, user_id)

    assessments_before = (await db_session.execute(select(func.count(RiskAssessment.id)))).scalar_one()
    requests_before = (await db_session.execute(select(func.count(ToolRequest.id)))).scalar_one()

    evaluate_payload = {
        "agent_id": str(agent.id),
        "tool_id": str(tool.id),
        "tool_version_id": str(tool_version.id),
        "arguments": {"operation": "add", "a": 5, "b": 15},
    }
    resp = await client.post("/api/v1/governance/evaluate", json=evaluate_payload, headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["decision"] == "ALLOW"

    assessments_after = (await db_session.execute(select(func.count(RiskAssessment.id)))).scalar_one()
    requests_after = (await db_session.execute(select(func.count(ToolRequest.id)))).scalar_one()

    assert assessments_after == assessments_before
    assert requests_after == requests_before


@pytest.mark.asyncio
async def test_idempotency_prevents_duplicate_risk_assessment(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    """Verify that idempotent invocation replays cached response and creates zero duplicate assessments."""
    headers, org_id, user_id = await _create_test_context(db_session, client)
    agent, tool, tool_version = await _setup_governance_fixture(db_session, org_id, user_id)

    run_resp = await client.post(
        "/api/v1/runs",
        json={"agent_id": str(agent.id), "environment": "DEVELOPMENT"},
        headers=headers,
    )
    run_id = run_resp.json()["id"]

    idempotency_key = f"phase73-idemp-{uuid.uuid4()}"
    inv_payload = {
        "agent_id": str(agent.id),
        "tool_id": str(tool.id),
        "tool_version_id": str(tool_version.id),
        "arguments": {"operation": "add", "a": 7, "b": 8},
        "idempotency_key": idempotency_key,
    }

    # First invocation
    resp1 = await client.post(f"/api/v1/runs/{run_id}/invocations", json=inv_payload, headers=headers)
    assert resp1.status_code == 200
    data1 = resp1.json()

    count_after_first = (await db_session.execute(select(func.count(RiskAssessment.id)))).scalar_one()

    # Replay with same idempotency key
    resp2 = await client.post(f"/api/v1/runs/{run_id}/invocations", json=inv_payload, headers=headers)
    assert resp2.status_code == 200
    data2 = resp2.json()

    count_after_replay = (await db_session.execute(select(func.count(RiskAssessment.id)))).scalar_one()

    assert data1["tool_request_id"] == data2["tool_request_id"]
    assert "Idempotent replay" in data2["reason"]
    assert count_after_replay == count_after_first


@pytest.mark.asyncio
async def test_fail_closed_on_risk_evaluation_error(
    db_session: AsyncSession,
) -> None:
    """Verify Gateway fails closed (DENY with RISK_EVALUATION_FAILED) if RiskEngineService fails."""
    uid = uuid.uuid4()
    org = Organization(name=f"Fail Org {uid}", slug=f"fail-org-{uid}", status=OrganizationStatus.ACTIVE)
    db_session.add(org)
    await db_session.commit()

    user = User(
        organization_id=org.id,
        email=f"fail-{uid}@example.com",
        password_hash="fakehash",
        display_name="Fail User",
        status=UserStatus.ACTIVE,
        role=Role.ADMIN,
    )
    db_session.add(user)
    await db_session.commit()

    agent, tool, tool_version = await _setup_governance_fixture(db_session, org.id, user.id)

    # Patch evaluate_risk to simulate an unexpected internal failure
    with patch.object(RiskEngineService, "evaluate_risk", side_effect=RuntimeError("Corrupt heuristic vector")):
        decision, violations, reason, _tool, _tool_version = await governance_service._evaluate_policy(
            db=db_session,
            organization_id=org.id,
            agent_id=agent.id,
            tool_id=tool.id,
            tool_version_id=tool_version.id,
            arguments={"operation": "add"},
        )

        assert decision == GovernanceDecision.DENY
        assert GovernanceViolationCode.RISK_EVALUATION_FAILED in violations
        assert "Risk evaluation failed (fail-closed)" in reason


# ==============================================================================
# 5. Multi-Tenant Isolation
# ==============================================================================


@pytest.mark.asyncio
async def test_risk_configuration_multi_tenant_isolation(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    """Verify that Organization A's custom risk thresholds do NOT leak or affect Organization B."""
    headers_a, org_a_id, user_a_id = await _create_test_context(db_session, client)
    headers_b, org_b_id, user_b_id = await _create_test_context(db_session, client)

    # Configure Organization A with very strict approval_threshold = 10
    config_a = RiskConfiguration(organization_id=org_a_id, is_active=True)
    db_session.add(config_a)
    await db_session.commit()

    config_v_a = RiskConfigurationVersion(
        risk_configuration_id=config_a.id,
        version_number=1,
        approval_threshold=10,  # Strict threshold for Org A (score is ~12)
        deny_threshold=90,
    )
    db_session.add(config_v_a)
    await db_session.commit()
    config_a.current_version_id = config_v_a.id
    await db_session.commit()

    # Org B has default settings (approval_threshold=60)
    agent_a, tool_a, version_a = await _setup_governance_fixture(db_session, org_a_id, user_a_id)
    agent_b, tool_b, version_b = await _setup_governance_fixture(db_session, org_b_id, user_b_id)

    # Invocation in Org A -> risk score (~22) >= 15 -> REQUIRE_APPROVAL
    run_a_resp = await client.post(
        "/api/v1/runs",
        json={"agent_id": str(agent_a.id), "environment": "DEVELOPMENT"},
        headers=headers_a,
    )
    run_a_id = run_a_resp.json()["id"]

    inv_a_resp = await client.post(
        f"/api/v1/runs/{run_a_id}/invocations",
        json={
            "agent_id": str(agent_a.id),
            "tool_id": str(tool_a.id),
            "tool_version_id": str(version_a.id),
            "arguments": {"operation": "add", "a": 1, "b": 2},
        },
        headers=headers_a,
    )
    assert inv_a_resp.status_code == 200
    assert inv_a_resp.json()["decision"] == "REQUIRE_APPROVAL"

    # Invocation in Org B with identical payload -> risk score (~22) < 60 -> ALLOW
    run_b_resp = await client.post(
        "/api/v1/runs",
        json={"agent_id": str(agent_b.id), "environment": "DEVELOPMENT"},
        headers=headers_b,
    )
    run_b_id = run_b_resp.json()["id"]

    inv_b_resp = await client.post(
        f"/api/v1/runs/{run_b_id}/invocations",
        json={
            "agent_id": str(agent_b.id),
            "tool_id": str(tool_b.id),
            "tool_version_id": str(version_b.id),
            "arguments": {"operation": "add", "a": 1, "b": 2},
        },
        headers=headers_b,
    )
    assert inv_b_resp.status_code == 200
    assert inv_b_resp.json()["decision"] == "ALLOW"
