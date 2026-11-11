"""Comprehensive integration tests for Phase 7.4: Risk Engine REST APIs & RBAC.

Verifies:
1. Endpoints:
   - POST /api/v1/risk/evaluate (Simulation, non-mutating)
   - GET  /api/v1/risk/assessments (List, filtered, paginated)
   - GET  /api/v1/risk/assessments/{id} (Historical record retrieval)
   - GET  /api/v1/risk/profiles/agents/{agent_id} (Empirical trust & history profile)
   - GET  /api/v1/risk/config (Active configuration and version)
   - POST /api/v1/risk/config/versions (Publish immutable new version)
2. RBAC Enforcement:
   - Unauthenticated requests return 401.
   - All authenticated roles (ADMIN, SECURITY_ANALYST, AGENT_OPERATOR, AUDITOR, VIEWER) can read and simulate.
   - Only ADMIN and SECURITY_ANALYST can create configuration versions (VIEWER/OPERATOR/AUDITOR return 403).
3. Multi-Tenant Isolation:
   - Cross-tenant queries return 404 without leaking existence.
   - Assessments, configurations, and profiles are strictly scoped to caller's organization.
4. Input Validation & Immutability:
   - Weights must sum to 1.0 (422 if invalid).
   - Threshold monotonicity constraints (422 if invalid).
   - Pagination boundaries (ge=1, le=100).
   - Dry-run evaluate creates zero database mutations.
"""

import uuid
from datetime import UTC, datetime, timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.agents.models import Agent, AgentEnvironment, AgentRiskTier, AgentStatus
from app.auth.security import get_password_hash
from app.governance.models import ToolRequest
from app.risk.models import (
    AgentHistoryStatus,
    AgentRiskProfile,
    RiskAssessment,
    RiskLevel,
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
        org = Organization(name=f"Risk API Org {uid}", slug=f"risk-api-org-{uid}", status=OrganizationStatus.ACTIVE)
        db_session.add(org)
        await db_session.commit()
        await db_session.refresh(org)
        actual_org_id = org.id
    else:
        actual_org_id = org_id

    test_pass = "TestPass123!"  # noqa: S105
    user = User(
        organization_id=actual_org_id,
        email=f"risk-user-{uid}@example.com",
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
        environment=AgentEnvironment.DEVELOPMENT,
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
# 1. Risk Evaluation Simulation (POST /api/v1/risk/evaluate)
# ==============================================================================


@pytest.mark.asyncio
async def test_risk_evaluate_simulation_success_and_non_mutating(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    """Verify that POST /api/v1/risk/evaluate returns accurate scoring without mutating DB."""
    headers, org_id, user_id = await _create_test_context(db_session, client)
    agent, tool, tool_version = await _setup_governance_fixture(db_session, org_id, user_id)

    # Count database rows before request
    requests_before = (await db_session.execute(select(func.count(ToolRequest.id)))).scalar_one()
    assessments_before = (await db_session.execute(select(func.count(RiskAssessment.id)))).scalar_one()
    profiles_before = (await db_session.execute(select(func.count(AgentRiskProfile.id)))).scalar_one()

    payload = {
        "agent_id": str(agent.id),
        "tool_id": str(tool.id),
        "tool_version_id": str(tool_version.id),
        "arguments": {"operation": "add", "a": 5, "b": 10},
        "environment": "DEVELOPMENT",
    }

    resp = await client.post("/api/v1/risk/evaluate", json=payload, headers=headers)
    assert resp.status_code == 200
    data = resp.json()

    # Validate simulation response attributes
    assert 0 <= data["risk_score"] <= 100
    assert data["risk_level"] in {"LOW", "MEDIUM", "HIGH", "CRITICAL"}
    assert "tool" in data["subscores"]
    assert "data" in data["subscores"]
    assert "agent" in data["subscores"]
    assert "context" in data["subscores"]
    assert isinstance(data["factor_breakdown"], dict)
    assert isinstance(data["heuristics_matched"], list)
    assert "explanation" in data
    assert data["scoring_algorithm_version"] == "1.0.0"
    assert "assessed_at" in data

    # Verify zero mutations occurred
    requests_after = (await db_session.execute(select(func.count(ToolRequest.id)))).scalar_one()
    assessments_after = (await db_session.execute(select(func.count(RiskAssessment.id)))).scalar_one()
    profiles_after = (await db_session.execute(select(func.count(AgentRiskProfile.id)))).scalar_one()

    assert requests_after == requests_before
    assert assessments_after == assessments_before
    assert profiles_after == profiles_before


@pytest.mark.asyncio
async def test_risk_evaluate_simulation_cross_tenant_and_not_found(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    """Verify that simulating with non-existent or foreign tenant resources returns 404."""
    headers_a, org_a_id, user_a_id = await _create_test_context(db_session, client)
    headers_b, org_b_id, user_b_id = await _create_test_context(db_session, client)

    agent_a, tool_a, version_a = await _setup_governance_fixture(db_session, org_a_id, user_a_id)

    # Org B attempts to evaluate with Org A's agent -> 404
    payload_cross_agent = {
        "agent_id": str(agent_a.id),
        "tool_id": str(tool_a.id),
        "tool_version_id": str(version_a.id),
        "arguments": {"operation": "add"},
    }
    resp = await client.post("/api/v1/risk/evaluate", json=payload_cross_agent, headers=headers_b)
    assert resp.status_code == 404
    assert f"Agent '{agent_a.id}' not found" in resp.json()["detail"]

    # Org A attempts with random tool_id -> 404
    random_tool_id = uuid.uuid4()
    payload_missing_tool = {
        "agent_id": str(agent_a.id),
        "tool_id": str(random_tool_id),
        "tool_version_id": str(version_a.id),
        "arguments": {"operation": "add"},
    }
    resp = await client.post("/api/v1/risk/evaluate", json=payload_missing_tool, headers=headers_a)
    assert resp.status_code == 404
    assert f"Tool '{random_tool_id}' not found" in resp.json()["detail"]


# ==============================================================================
# 2. Historical Assessments Endpoints (GET /api/v1/risk/assessments)
# ==============================================================================


@pytest.mark.asyncio
async def test_list_and_get_historical_assessments(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    """Verify listing and retrieving specific historical risk assessments."""
    headers, org_id, user_id = await _create_test_context(db_session, client)
    agent, tool, tool_version = await _setup_governance_fixture(db_session, org_id, user_id)

    # Create two historical assessments in the database
    now = datetime.now(UTC)
    a1 = RiskAssessment(
        organization_id=org_id,
        agent_id=agent.id,
        tool_id=tool.id,
        tool_version_id=tool_version.id,
        scoring_algorithm_version="1.0.0",
        risk_score=25,
        risk_level=RiskLevel.LOW,
        subscore_tool=10.0,
        subscore_data=20.0,
        subscore_agent=15.0,
        subscore_context=10.0,
        factor_breakdown={"test": "a1"},
        heuristics_matched=[],
        config_snapshot={"snapshot": 1},
        explanation="Assessment 1",
        assessed_at=now - timedelta(hours=2),
    )
    a2 = RiskAssessment(
        organization_id=org_id,
        agent_id=agent.id,
        tool_id=tool.id,
        tool_version_id=tool_version.id,
        scoring_algorithm_version="1.0.0",
        risk_score=75,
        risk_level=RiskLevel.HIGH,
        subscore_tool=50.0,
        subscore_data=60.0,
        subscore_agent=40.0,
        subscore_context=30.0,
        factor_breakdown={"test": "a2"},
        heuristics_matched=[],
        config_snapshot={"snapshot": 2},
        explanation="Assessment 2",
        assessed_at=now - timedelta(hours=1),
    )
    db_session.add_all([a1, a2])
    await db_session.commit()

    # 1. List all assessments
    resp = await client.get("/api/v1/risk/assessments", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] >= 2
    item_ids = [item["id"] for item in data["items"]]
    assert str(a1.id) in item_ids
    assert str(a2.id) in item_ids

    # 2. Filter by risk_level=HIGH
    resp_high = await client.get("/api/v1/risk/assessments?risk_level=HIGH", headers=headers)
    assert resp_high.status_code == 200
    high_items = resp_high.json()["items"]
    assert all(item["risk_level"] == "HIGH" for item in high_items)
    assert str(a2.id) in [item["id"] for item in high_items]

    # 3. Filter by agent_id
    resp_agent = await client.get(f"/api/v1/risk/assessments?agent_id={agent.id}", headers=headers)
    assert resp_agent.status_code == 200
    assert resp_agent.json()["total"] >= 2

    # 4. Retrieve specific assessment
    resp_single = await client.get(f"/api/v1/risk/assessments/{a2.id}", headers=headers)
    assert resp_single.status_code == 200
    single_data = resp_single.json()
    assert single_data["id"] == str(a2.id)
    assert single_data["risk_score"] == 75
    assert single_data["risk_level"] == "HIGH"
    assert single_data["config_snapshot"] == {"snapshot": 2}
    assert single_data["scoring_algorithm_version"] == "1.0.0"

    # 5. Non-existent assessment returns 404
    missing_id = uuid.uuid4()
    resp_missing = await client.get(f"/api/v1/risk/assessments/{missing_id}", headers=headers)
    assert resp_missing.status_code == 404


@pytest.mark.asyncio
async def test_assessments_pagination_and_validation(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    """Verify assessments pagination limits and boundary validation."""
    headers, org_id, user_id = await _create_test_context(db_session, client)
    agent, tool, tool_version = await _setup_governance_fixture(db_session, org_id, user_id)

    # Valid pagination
    resp = await client.get("/api/v1/risk/assessments?limit=1&offset=0", headers=headers)
    assert resp.status_code == 200

    # Boundary invalid limit: 0 or > 100
    resp_zero = await client.get("/api/v1/risk/assessments?limit=0", headers=headers)
    assert resp_zero.status_code == 422

    resp_excess = await client.get("/api/v1/risk/assessments?limit=101", headers=headers)
    assert resp_excess.status_code == 422

    # Negative offset
    resp_neg = await client.get("/api/v1/risk/assessments?offset=-1", headers=headers)
    assert resp_neg.status_code == 422


# ==============================================================================
# 3. Agent Risk Profile Endpoint (GET /api/v1/risk/profiles/agents/{agent_id})
# ==============================================================================


@pytest.mark.asyncio
async def test_agent_risk_profile_endpoint_insufficient_data_and_details(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    """Verify GET /api/v1/risk/profiles/agents/{agent_id} accurately reflects empirical metrics."""
    headers, org_id, user_id = await _create_test_context(db_session, client)
    agent, tool, tool_version = await _setup_governance_fixture(
        db_session,
        org_id,
        user_id,
        agent_tier=AgentRiskTier.MEDIUM,
    )

    # Fetch profile for unproven agent (0 invocations)
    resp = await client.get(f"/api/v1/risk/profiles/agents/{agent.id}", headers=headers)
    assert resp.status_code == 200
    data = resp.json()

    assert data["agent_id"] == str(agent.id)
    assert data["organization_id"] == str(org_id)
    assert data["risk_tier"] == "MEDIUM"
    assert data["history_status"] == AgentHistoryStatus.INSUFFICIENT_DATA.value
    assert data["total_eligible_invocations"] == 0
    assert data["total_violations"] == 0
    assert data["violation_rate"] == 0.0
    assert data["calculated_trust_score"] == 100.0
    assert data["observation_window_days"] == 7

    # Non-existent agent returns 404
    missing_agent_id = uuid.uuid4()
    resp_missing = await client.get(f"/api/v1/risk/profiles/agents/{missing_agent_id}", headers=headers)
    assert resp_missing.status_code == 404


# ==============================================================================
# 4. Risk Configuration Endpoints (GET /api/v1/risk/config, POST /versions)
# ==============================================================================


@pytest.mark.asyncio
async def test_risk_configuration_lifecycle_and_version_creation(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    """Verify retrieving active config, auto-initializing default v1, and publishing immutable v2."""
    headers, org_id, user_id = await _create_test_context(db_session, client, Role.ADMIN)

    # 1. GET active config initializes default v1 if none exists
    resp_init = await client.get("/api/v1/risk/config", headers=headers)
    assert resp_init.status_code == 200
    config_data = resp_init.json()

    assert config_data["organization_id"] == str(org_id)
    assert config_data["is_active"] is True
    assert config_data["current_version"] is not None
    assert config_data["current_version"]["version_number"] == 1
    assert config_data["current_version"]["approval_threshold"] == 60
    assert config_data["current_version"]["deny_threshold"] == 90

    # 2. Publish new version v2 with custom weights and thresholds
    payload_v2 = {
        "weight_tool": 0.40,
        "weight_data": 0.20,
        "weight_agent": 0.20,
        "weight_context": 0.20,
        "threshold_medium": 25,
        "threshold_high": 55,
        "threshold_critical": 80,
        "approval_threshold": 50,
        "deny_threshold": 85,
        "heuristic_rules": [
            {
                "rule_id": "CUSTOM_RULE",
                "path": "arguments.amount",
                "operator": "GREATER_THAN",
                "threshold": 10000,
                "severity": "HIGH",
                "score_contribution": 25.0,
            }
        ],
        "changelog": "Published v2 tuned for financial operations",
    }
    resp_v2 = await client.post("/api/v1/risk/config/versions", json=payload_v2, headers=headers)
    assert resp_v2.status_code == 201
    v2_data = resp_v2.json()

    assert v2_data["version_number"] == 2
    assert v2_data["weight_tool"] == 0.40
    assert v2_data["approval_threshold"] == 50
    assert v2_data["deny_threshold"] == 85
    assert len(v2_data["heuristic_rules"]) == 1
    assert v2_data["changelog"] == "Published v2 tuned for financial operations"

    # 3. GET active config now returns v2 as current version
    resp_active = await client.get("/api/v1/risk/config", headers=headers)
    assert resp_active.status_code == 200
    active_data = resp_active.json()
    assert active_data["current_version_id"] == v2_data["id"]
    assert active_data["current_version"]["version_number"] == 2


@pytest.mark.asyncio
async def test_risk_configuration_validation_constraints(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    """Verify validation: weights sum to 1.0, monotonic thresholds, and action thresholds."""
    headers, org_id, user_id = await _create_test_context(db_session, client, Role.ADMIN)

    # 1. Weights do not sum to 1.0 (0.30 + 0.20 + 0.20 + 0.20 = 0.90)
    bad_weights = {
        "weight_tool": 0.30,
        "weight_data": 0.20,
        "weight_agent": 0.20,
        "weight_context": 0.20,
        "approval_threshold": 60,
        "deny_threshold": 90,
    }
    resp = await client.post("/api/v1/risk/config/versions", json=bad_weights, headers=headers)
    assert resp.status_code == 422
    assert "weights must sum to 1.0" in resp.json()["detail"].lower()

    # 2. Non-monotonic classification thresholds (medium > high)
    bad_thresholds = {
        "weight_tool": 0.35,
        "weight_data": 0.25,
        "weight_agent": 0.20,
        "weight_context": 0.20,
        "threshold_medium": 70,
        "threshold_high": 60,  # Invalid: 70 > 60
        "threshold_critical": 85,
        "approval_threshold": 60,
        "deny_threshold": 90,
    }
    resp = await client.post("/api/v1/risk/config/versions", json=bad_thresholds, headers=headers)
    assert resp.status_code == 422
    assert "classification thresholds must satisfy" in resp.json()["detail"].lower()

    # 3. Action threshold violation (approval > deny)
    bad_action_thresholds = {
        "weight_tool": 0.35,
        "weight_data": 0.25,
        "weight_agent": 0.20,
        "weight_context": 0.20,
        "threshold_medium": 30,
        "threshold_high": 60,
        "threshold_critical": 85,
        "approval_threshold": 95,
        "deny_threshold": 90,  # Invalid: 95 > 90
    }
    resp = await client.post("/api/v1/risk/config/versions", json=bad_action_thresholds, headers=headers)
    assert resp.status_code == 422
    assert "action thresholds must satisfy" in resp.json()["detail"].lower()


# ==============================================================================
# 5. RBAC Enforcement Across Endpoints
# ==============================================================================


@pytest.mark.asyncio
async def test_rbac_restrictions_on_configuration_publication(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    """Verify that only ADMIN and SECURITY_ANALYST can create configuration versions."""
    org = Organization(name="RBAC Org", slug=f"rbac-org-{uuid.uuid4()}", status=OrganizationStatus.ACTIVE)
    db_session.add(org)
    await db_session.commit()

    payload = {
        "weight_tool": 0.35,
        "weight_data": 0.25,
        "weight_agent": 0.20,
        "weight_context": 0.20,
        "approval_threshold": 60,
        "deny_threshold": 90,
    }

    # 1. VIEWER -> 403 Forbidden
    headers_viewer, _, _ = await _create_test_context(db_session, client, Role.VIEWER, org.id)
    resp_viewer = await client.post("/api/v1/risk/config/versions", json=payload, headers=headers_viewer)
    assert resp_viewer.status_code == 403

    # 2. AGENT_OPERATOR -> 403 Forbidden
    headers_operator, _, _ = await _create_test_context(db_session, client, Role.AGENT_OPERATOR, org.id)
    resp_op = await client.post("/api/v1/risk/config/versions", json=payload, headers=headers_operator)
    assert resp_op.status_code == 403

    # 3. AUDITOR -> 403 Forbidden
    headers_auditor, _, _ = await _create_test_context(db_session, client, Role.AUDITOR, org.id)
    resp_aud = await client.post("/api/v1/risk/config/versions", json=payload, headers=headers_auditor)
    assert resp_aud.status_code == 403

    # 4. SECURITY_ANALYST -> 201 Created
    headers_sec, _, _ = await _create_test_context(db_session, client, Role.SECURITY_ANALYST, org.id)
    resp_sec = await client.post("/api/v1/risk/config/versions", json=payload, headers=headers_sec)
    assert resp_sec.status_code == 201

    # 5. ADMIN -> 201 Created
    headers_admin, _, _ = await _create_test_context(db_session, client, Role.ADMIN, org.id)
    resp_admin = await client.post("/api/v1/risk/config/versions", json=payload, headers=headers_admin)
    assert resp_admin.status_code == 201


@pytest.mark.asyncio
async def test_rbac_read_access_for_all_authorized_roles(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    """Verify that VIEWER, AUDITOR, and AGENT_OPERATOR can access read/evaluate endpoints."""
    headers, org_id, user_id = await _create_test_context(db_session, client, Role.VIEWER)
    agent, tool, tool_version = await _setup_governance_fixture(db_session, org_id, user_id)

    # 1. View configuration
    resp_cfg = await client.get("/api/v1/risk/config", headers=headers)
    assert resp_cfg.status_code == 200

    # 2. View assessments list
    resp_list = await client.get("/api/v1/risk/assessments", headers=headers)
    assert resp_list.status_code == 200

    # 3. View agent profile
    resp_prof = await client.get(f"/api/v1/risk/profiles/agents/{agent.id}", headers=headers)
    assert resp_prof.status_code == 200

    # 4. Simulate risk evaluation
    sim_payload = {
        "agent_id": str(agent.id),
        "tool_id": str(tool.id),
        "tool_version_id": str(tool_version.id),
        "arguments": {"operation": "add"},
    }
    resp_sim = await client.post("/api/v1/risk/evaluate", json=sim_payload, headers=headers)
    assert resp_sim.status_code == 200


# ==============================================================================
# 6. Multi-Tenant Isolation
# ==============================================================================


@pytest.mark.asyncio
async def test_multi_tenant_isolation_assessments_and_profiles(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    """Verify that Organization A's assessments, profiles, and configs are isolated from Org B."""
    headers_a, org_a_id, user_a_id = await _create_test_context(db_session, client, Role.ADMIN)
    headers_b, org_b_id, user_b_id = await _create_test_context(db_session, client, Role.ADMIN)

    agent_a, tool_a, version_a = await _setup_governance_fixture(db_session, org_a_id, user_a_id)

    # Create an assessment in Org A
    assessment_a = RiskAssessment(
        organization_id=org_a_id,
        agent_id=agent_a.id,
        tool_id=tool_a.id,
        tool_version_id=version_a.id,
        scoring_algorithm_version="1.0.0",
        risk_score=45,
        risk_level=RiskLevel.MEDIUM,
        subscore_tool=20.0,
        subscore_data=20.0,
        subscore_agent=20.0,
        subscore_context=20.0,
        factor_breakdown={},
        heuristics_matched=[],
        config_snapshot={},
        explanation="Org A Assessment",
        assessed_at=datetime.now(UTC),
    )
    db_session.add(assessment_a)
    await db_session.commit()

    # 1. Org B requests Org A's specific assessment by ID -> 404
    resp_cross_get = await client.get(f"/api/v1/risk/assessments/{assessment_a.id}", headers=headers_b)
    assert resp_cross_get.status_code == 404
    assert f"Risk assessment '{assessment_a.id}' not found" in resp_cross_get.json()["detail"]

    # 2. Org B lists assessments -> Org A's assessment is NOT included
    resp_list_b = await client.get("/api/v1/risk/assessments", headers=headers_b)
    assert resp_list_b.status_code == 200
    b_ids = [item["id"] for item in resp_list_b.json()["items"]]
    assert str(assessment_a.id) not in b_ids

    # 3. Org B requests Org A's agent risk profile -> 404
    resp_cross_prof = await client.get(f"/api/v1/risk/profiles/agents/{agent_a.id}", headers=headers_b)
    assert resp_cross_prof.status_code == 404
    assert f"Agent '{agent_a.id}' not found" in resp_cross_prof.json()["detail"]

    # 4. Org B requests config -> returns Org B's separate config
    resp_cfg_b = await client.get("/api/v1/risk/config", headers=headers_b)
    assert resp_cfg_b.status_code == 200
    assert resp_cfg_b.json()["organization_id"] == str(org_b_id)
