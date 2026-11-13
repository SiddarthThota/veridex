"""Comprehensive integration tests for Phase 8.4: Analytics REST APIs & Role-Based Access Control.

Verifies:
1. Canonical Endpoints:
   - GET /api/v1/analytics/overview
   - GET /api/v1/analytics/trends
   - GET /api/v1/analytics/risk-distribution
   - GET /api/v1/analytics/agents
   - GET /api/v1/analytics/tools
   - GET /api/v1/analytics/anomalies
2. RBAC Enforcement:
   - Unauthenticated requests return 401.
   - ADMIN, SECURITY_ANALYST, and AUDITOR are allowed (200).
   - AGENT_OPERATOR and VIEWER are forbidden (403).
3. Tenant Isolation:
   - Organization A cannot view Organization B analytics.
   - Organization ID query parameter tampering (?organization_id=...) is rejected with 400.
4. Input Validation & Error Mapping:
   - Inverted/equal time ranges, >90 day ranges, >14 day hourly granularity, invalid pagination (422).
5. Read-Only Guarantee:
   - Zero database mutations occur during analytics API calls.
6. OpenAPI Schema:
   - All 6 endpoints and response schemas registered cleanly.
"""

import uuid
from datetime import UTC, datetime, timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.agents.models import Agent, AgentEnvironment, AgentRiskTier, AgentStatus
from app.auth.security import get_password_hash
from app.governance.models import (
    ApprovalRequest,
    ApprovalStatus,
    ExecutionStatus,
    GovernanceDecision,
    ToolExecution,
    ToolRequest,
)
from app.risk.models import RiskAssessment, RiskLevel
from app.tools.models import (
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


async def _create_test_user(
    db: AsyncSession,
    client: AsyncClient,
    role: Role,
    org_id: uuid.UUID | None = None,
) -> tuple[dict[str, str], uuid.UUID, uuid.UUID]:
    """Helper to create an organization, user, and return JWT authorization headers."""
    uid = uuid.uuid4()
    if org_id is None:
        org = Organization(name=f"Analytics Org {uid}", slug=f"analytics-org-{uid}", status=OrganizationStatus.ACTIVE)
        db.add(org)
        await db.commit()
        await db.refresh(org)
        actual_org_id = org.id
    else:
        actual_org_id = org_id

    password = "TestPassword123!"
    user = User(
        organization_id=actual_org_id,
        email=f"analytics-{role.value.lower()}-{uid}@example.com",
        password_hash=get_password_hash(password),
        display_name=f"User {role.value}",
        status=UserStatus.ACTIVE,
        role=role,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)

    login_res = await client.post("/api/v1/auth/login", data={"username": user.email, "password": password})
    assert login_res.status_code == 200, f"Login failed: {login_res.text}"
    token = login_res.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}, actual_org_id, user.id


async def _seed_analytics_data(
    db: AsyncSession,
    org_id: uuid.UUID,
    user_id: uuid.UUID,
) -> tuple[Agent, Tool, ToolVersion]:
    """Seed test agent, tool, invocations, executions, approvals, and risk assessments."""
    uid = uuid.uuid4()
    agent = Agent(
        organization_id=org_id,
        owner_user_id=user_id,
        name=f"Agent {uid}",
        slug=f"agent-{uid}",
        status=AgentStatus.ACTIVE,
        environment=AgentEnvironment.PRODUCTION,
        risk_tier=AgentRiskTier.LOW,
        model_provider="mock",
        model_name="mock-model",
    )
    db.add(agent)
    await db.commit()
    await db.refresh(agent)

    tool = Tool(
        organization_id=org_id,
        owner_user_id=user_id,
        name=f"Tool {uid}",
        slug=f"tool-{uid}",
        status=ToolStatus.ACTIVE,
        risk_level=ToolRiskLevel.LOW,
        access_type=ToolAccessType.READ,
        reversibility=ToolReversibility.REVERSIBLE,
        data_classification=ToolDataClassification.INTERNAL,
        approval_requirement=ToolApprovalRequirement.NOT_REQUIRED,
    )
    db.add(tool)
    await db.commit()
    await db.refresh(tool)

    version = ToolVersion(
        tool_id=tool.id,
        version="1.0.0",
        created_by=user_id,
        status=ToolVersionStatus.PUBLISHED,
    )
    db.add(version)
    await db.commit()
    await db.refresh(version)

    t0 = datetime(2026, 11, 1, 12, 0, 0, tzinfo=UTC)

    # 3 ToolRequests: 2 ALLOW, 1 DENY
    req1 = ToolRequest(
        organization_id=org_id,
        agent_id=agent.id,
        tool_id=tool.id,
        tool_version_id=version.id,
        decision=GovernanceDecision.ALLOW,
        arguments={"action": "test1"},
        arguments_hash="hash1",
        evaluated_at=t0 + timedelta(hours=1),
        evaluation_duration_ms=12.5,
    )
    req2 = ToolRequest(
        organization_id=org_id,
        agent_id=agent.id,
        tool_id=tool.id,
        tool_version_id=version.id,
        decision=GovernanceDecision.ALLOW,
        arguments={"action": "test2"},
        arguments_hash="hash2",
        evaluated_at=t0 + timedelta(hours=2),
        evaluation_duration_ms=18.0,
    )
    req3 = ToolRequest(
        organization_id=org_id,
        agent_id=agent.id,
        tool_id=tool.id,
        tool_version_id=version.id,
        decision=GovernanceDecision.DENY,
        arguments={"action": "test3"},
        arguments_hash="hash3",
        evaluated_at=t0 + timedelta(hours=3),
        evaluation_duration_ms=8.0,
    )
    db.add_all([req1, req2, req3])
    await db.commit()

    # Tool Execution on req1
    exec1 = ToolExecution(
        tool_request_id=req1.id,
        status=ExecutionStatus.SUCCESS,
        duration_ms=150,
        executed_at=t0 + timedelta(hours=1, minutes=1),
    )
    db.add(exec1)

    # Approval Request on req2
    app1 = ApprovalRequest(
        tool_request_id=req2.id,
        organization_id=org_id,
        status=ApprovalStatus.APPROVED,
        integrity_hash="app_h1",
        created_at=t0 + timedelta(hours=2),
    )
    db.add(app1)

    # Risk Assessment
    ra1 = RiskAssessment(
        organization_id=org_id,
        agent_id=agent.id,
        tool_id=tool.id,
        tool_version_id=version.id,
        risk_score=45,
        risk_level=RiskLevel.MEDIUM,
        subscore_tool=45.0,
        subscore_data=45.0,
        subscore_agent=45.0,
        subscore_context=45.0,
        heuristics_matched=[],
        assessed_at=t0 + timedelta(hours=1),
    )
    db.add(ra1)
    await db.commit()

    return agent, tool, version


# ==============================================================================
# 1. Authentication & RBAC Tests
# ==============================================================================


@pytest.mark.asyncio
async def test_analytics_endpoints_require_authentication(client: AsyncClient) -> None:
    """Verify all 6 analytics endpoints return 401 when called without a bearer token."""
    endpoints = [
        "/api/v1/analytics/overview",
        "/api/v1/analytics/trends",
        "/api/v1/analytics/risk-distribution",
        "/api/v1/analytics/agents",
        "/api/v1/analytics/tools",
        "/api/v1/analytics/anomalies",
    ]
    for ep in endpoints:
        resp = await client.get(ep)
        assert resp.status_code == 401, f"Expected 401 for unauthenticated {ep}, got {resp.status_code}"


@pytest.mark.asyncio
async def test_analytics_rbac_authorized_roles(db_session: AsyncSession, client: AsyncClient) -> None:
    """Verify ADMIN, SECURITY_ANALYST, and AUDITOR can access analytics endpoints (200 OK)."""
    authorized_roles = [Role.ADMIN, Role.SECURITY_ANALYST, Role.AUDITOR]
    endpoints = [
        "/api/v1/analytics/overview",
        "/api/v1/analytics/trends",
        "/api/v1/analytics/risk-distribution",
        "/api/v1/analytics/agents",
        "/api/v1/analytics/tools",
        "/api/v1/analytics/anomalies",
    ]

    for role in authorized_roles:
        headers, org_id, user_id = await _create_test_user(db_session, client, role)
        await _seed_analytics_data(db_session, org_id, user_id)

        for ep in endpoints:
            resp = await client.get(ep, headers=headers)
            assert resp.status_code == 200, f"Role {role.value} should access {ep}, got {resp.status_code}: {resp.text}"


@pytest.mark.asyncio
async def test_analytics_rbac_forbidden_roles(db_session: AsyncSession, client: AsyncClient) -> None:
    """Verify AGENT_OPERATOR and VIEWER receive 403 Forbidden across all analytics endpoints."""
    forbidden_roles = [Role.AGENT_OPERATOR, Role.VIEWER]
    endpoints = [
        "/api/v1/analytics/overview",
        "/api/v1/analytics/trends",
        "/api/v1/analytics/risk-distribution",
        "/api/v1/analytics/agents",
        "/api/v1/analytics/tools",
        "/api/v1/analytics/anomalies",
    ]

    for role in forbidden_roles:
        headers, org_id, user_id = await _create_test_user(db_session, client, role)

        for ep in endpoints:
            resp = await client.get(ep, headers=headers)
            assert resp.status_code == 403, f"Role {role.value} must receive 403 for {ep}, got {resp.status_code}"


# ==============================================================================
# 2. Multi-Tenant Isolation Tests
# ==============================================================================


@pytest.mark.asyncio
async def test_analytics_tenant_isolation(db_session: AsyncSession, client: AsyncClient) -> None:
    """Verify Organization A analytics are strictly invisible to Organization B."""
    # Org A with seeded data
    headers_a, org_a_id, user_a_id = await _create_test_user(db_session, client, Role.ADMIN)
    await _seed_analytics_data(db_session, org_a_id, user_a_id)

    # Org B with zero activity
    headers_b, org_b_id, user_b_id = await _create_test_user(db_session, client, Role.ADMIN)

    start = "2026-11-01T00:00:00Z"
    end = "2026-11-02T00:00:00Z"

    # Query overview for Org A
    resp_a = await client.get(f"/api/v1/analytics/overview?start_time={start}&end_time={end}", headers=headers_a)
    assert resp_a.status_code == 200
    data_a = resp_a.json()
    assert data_a["total_invocations"] == 3
    assert data_a["total_tool_executions"] == 1
    assert data_a["total_approvals"] == 1

    # Query overview for Org B (must return 0s, never Org A numbers)
    resp_b = await client.get(f"/api/v1/analytics/overview?start_time={start}&end_time={end}", headers=headers_b)
    assert resp_b.status_code == 200
    data_b = resp_b.json()
    assert data_b["total_invocations"] == 0
    assert data_b["total_tool_executions"] == 0
    assert data_b["total_approvals"] == 0


@pytest.mark.asyncio
async def test_analytics_rejects_organization_id_query_tampering(db_session: AsyncSession, client: AsyncClient) -> None:
    """Verify any attempt to supply ?organization_id=... is rejected with 400 Bad Request."""
    headers, org_id, user_id = await _create_test_user(db_session, client, Role.ADMIN)
    fake_org_id = uuid.uuid4()

    endpoints = [
        f"/api/v1/analytics/overview?organization_id={fake_org_id}",
        f"/api/v1/analytics/trends?organization_id={fake_org_id}",
        f"/api/v1/analytics/risk-distribution?organization_id={fake_org_id}",
        f"/api/v1/analytics/agents?organization_id={fake_org_id}",
        f"/api/v1/analytics/tools?organization_id={fake_org_id}",
        f"/api/v1/analytics/anomalies?organization_id={fake_org_id}",
    ]
    for ep in endpoints:
        resp = await client.get(ep, headers=headers)
        assert resp.status_code == 400, f"Expected 400 for tampering on {ep}, got {resp.status_code}"
        assert "Custom organization_id parameter is prohibited" in resp.json()["detail"]


# ==============================================================================
# 3. Canonical Endpoint Correctness Tests
# ==============================================================================


@pytest.mark.asyncio
async def test_overview_endpoint_contract(db_session: AsyncSession, client: AsyncClient) -> None:
    """Verify GET /api/v1/analytics/overview fields and calculation semantics."""
    headers, org_id, user_id = await _create_test_user(db_session, client, Role.ADMIN)
    await _seed_analytics_data(db_session, org_id, user_id)

    start = "2026-11-01T00:00:00Z"
    end = "2026-11-02T00:00:00Z"
    resp = await client.get(f"/api/v1/analytics/overview?start_time={start}&end_time={end}", headers=headers)
    assert resp.status_code == 200
    data = resp.json()

    assert data["total_invocations"] == 3
    assert data["allow_count"] == 2
    assert data["deny_count"] == 1
    assert data["require_approval_count"] == 0
    assert data["allow_percentage"] == round(2 / 3 * 100, 2)
    assert data["deny_percentage"] == round(1 / 3 * 100, 2)
    assert data["total_tool_executions"] == 1
    assert data["total_approvals"] == 1
    assert data["approved_approvals"] == 1
    assert data["approval_resolution_rate"] == 1.0


@pytest.mark.asyncio
async def test_trends_endpoint_contract(db_session: AsyncSession, client: AsyncClient) -> None:
    """Verify GET /api/v1/analytics/trends supports hourly and daily granularity."""
    headers, org_id, user_id = await _create_test_user(db_session, client, Role.SECURITY_ANALYST)
    await _seed_analytics_data(db_session, org_id, user_id)

    start = "2026-11-01T10:00:00Z"
    end = "2026-11-01T15:00:00Z"

    # Hourly
    resp_hour = await client.get(
        f"/api/v1/analytics/trends?start_time={start}&end_time={end}&granularity=hour",
        headers=headers,
    )
    assert resp_hour.status_code == 200
    data_hour = resp_hour.json()
    assert data_hour["granularity"] == "hour"
    assert len(data_hour["buckets"]) == 5

    # Daily
    resp_day = await client.get(
        f"/api/v1/analytics/trends?start_time={start}&end_time={end}&granularity=day",
        headers=headers,
    )
    assert resp_day.status_code == 200
    data_day = resp_day.json()
    assert data_day["granularity"] == "day"
    assert len(data_day["buckets"]) == 1


@pytest.mark.asyncio
async def test_risk_distribution_endpoint_contract(db_session: AsyncSession, client: AsyncClient) -> None:
    """Verify GET /api/v1/analytics/risk-distribution response structure and 10 buckets."""
    headers, org_id, user_id = await _create_test_user(db_session, client, Role.AUDITOR)
    await _seed_analytics_data(db_session, org_id, user_id)

    start = "2026-11-01T00:00:00Z"
    end = "2026-11-02T00:00:00Z"
    resp = await client.get(
        f"/api/v1/analytics/risk-distribution?start_time={start}&end_time={end}",
        headers=headers,
    )
    assert resp.status_code == 200
    data = resp.json()

    assert data["total_assessments"] == 1
    assert data["medium_count"] == 1
    assert data["average_risk_score"] == 45.0
    assert len(data["histogram"]) == 10
    bucket_labels = [b["range_label"] for b in data["histogram"]]
    assert "[0,10)" in bucket_labels
    assert "[90,100]" in bucket_labels


@pytest.mark.asyncio
async def test_agents_and_tools_pagination_endpoints(db_session: AsyncSession, client: AsyncClient) -> None:
    """Verify paginated agent and tool analytics endpoints."""
    headers, org_id, user_id = await _create_test_user(db_session, client, Role.ADMIN)
    agent, tool, _ = await _seed_analytics_data(db_session, org_id, user_id)

    start = "2026-11-01T00:00:00Z"
    end = "2026-11-02T00:00:00Z"

    # Agents
    resp_agents = await client.get(
        f"/api/v1/analytics/agents?start_time={start}&end_time={end}&page=1&page_size=10",
        headers=headers,
    )
    assert resp_agents.status_code == 200
    data_agents = resp_agents.json()
    assert data_agents["pagination"]["total_items"] == 1
    assert len(data_agents["items"]) == 1
    agent_item = data_agents["items"][0]
    assert agent_item["agent_id"] == str(agent.id)
    assert agent_item["total_invocations"] == 3
    assert agent_item["historical_denial_rate"] == round(1 / 3, 4)

    # Tools
    resp_tools = await client.get(
        f"/api/v1/analytics/tools?start_time={start}&end_time={end}&page=1&page_size=10",
        headers=headers,
    )
    assert resp_tools.status_code == 200
    data_tools = resp_tools.json()
    assert data_tools["pagination"]["total_items"] == 1
    assert len(data_tools["items"]) == 1
    tool_item = data_tools["items"][0]
    assert tool_item["tool_id"] == str(tool.id)
    assert tool_item["invocation_count"] == 3
    assert tool_item["execution_count"] == 1
    assert tool_item["execution_success_count"] == 1


@pytest.mark.asyncio
async def test_anomalies_endpoint_contract(db_session: AsyncSession, client: AsyncClient) -> None:
    """Verify GET /api/v1/analytics/anomalies returns the 3 evaluation findings."""
    headers, org_id, user_id = await _create_test_user(db_session, client, Role.SECURITY_ANALYST)

    eval_time = "2026-11-08T12:00:00Z"
    resp = await client.get(f"/api/v1/analytics/anomalies?evaluation_time={eval_time}", headers=headers)
    assert resp.status_code == 200
    data = resp.json()

    assert data["organization_id"] == str(org_id)
    assert len(data["findings"]) == 3
    finding_types = [f["anomaly_type"] for f in data["findings"]]
    assert "DENIAL_RATE_SPIKE" in finding_types
    assert "CRITICAL_RISK_SURGE" in finding_types
    assert "LATENCY_SLA_DEGRADATION" in finding_types


# ==============================================================================
# 4. Input Validation & Error Handling Tests
# ==============================================================================


@pytest.mark.asyncio
async def test_analytics_input_validation_errors(db_session: AsyncSession, client: AsyncClient) -> None:
    """Verify validation boundaries: inverted ranges, >90 days, >14 days hourly, and pagination."""
    headers, org_id, user_id = await _create_test_user(db_session, client, Role.ADMIN)

    # Inverted time range (422)
    resp = await client.get(
        "/api/v1/analytics/overview?start_time=2026-11-05T00:00:00Z&end_time=2026-11-01T00:00:00Z",
        headers=headers,
    )
    assert resp.status_code == 422
    assert "strictly earlier" in resp.json()["detail"]

    # Exceeding 90 days (422)
    resp = await client.get(
        "/api/v1/analytics/overview?start_time=2026-01-01T00:00:00Z&end_time=2026-05-01T00:00:00Z",
        headers=headers,
    )
    assert resp.status_code == 422
    assert "exceeds the maximum supported boundary of 90 days" in resp.json()["detail"]

    # Hourly granularity with > 14 days (422)
    resp = await client.get(
        "/api/v1/analytics/trends?start_time=2026-11-01T00:00:00Z&end_time=2026-11-20T00:00:00Z&granularity=hour",
        headers=headers,
    )
    assert resp.status_code == 422
    assert "14 days or less" in resp.json()["detail"]

    # Unsupported granularity (422)
    resp = await client.get(
        "/api/v1/analytics/trends?granularity=second",
        headers=headers,
    )
    assert resp.status_code == 422

    # Invalid pagination: page=0 (422)
    resp = await client.get("/api/v1/analytics/agents?page=0", headers=headers)
    assert resp.status_code == 422

    # Invalid pagination: page_size=101 (422)
    resp = await client.get("/api/v1/analytics/tools?page_size=101", headers=headers)
    assert resp.status_code == 422


# ==============================================================================
# 5. Read-Only Guarantee Integration Test
# ==============================================================================


@pytest.mark.asyncio
async def test_analytics_api_strictly_read_only(db_session: AsyncSession, client: AsyncClient) -> None:
    """Verify executing API requests across all analytics endpoints causes zero database mutations."""
    headers, org_id, user_id = await _create_test_user(db_session, client, Role.ADMIN)
    await _seed_analytics_data(db_session, org_id, user_id)

    # Initial table counts
    req_cnt = (await db_session.execute(select(func.count(ToolRequest.id)))).scalar()
    exec_cnt = (await db_session.execute(select(func.count(ToolExecution.id)))).scalar()
    app_cnt = (await db_session.execute(select(func.count(ApprovalRequest.id)))).scalar()
    risk_cnt = (await db_session.execute(select(func.count(RiskAssessment.id)))).scalar()

    # Call all 6 endpoints
    await client.get("/api/v1/analytics/overview", headers=headers)
    await client.get("/api/v1/analytics/trends", headers=headers)
    await client.get("/api/v1/analytics/risk-distribution", headers=headers)
    await client.get("/api/v1/analytics/agents", headers=headers)
    await client.get("/api/v1/analytics/tools", headers=headers)
    await client.get("/api/v1/analytics/anomalies", headers=headers)

    # Verify counts remain identical
    assert (await db_session.execute(select(func.count(ToolRequest.id)))).scalar() == req_cnt
    assert (await db_session.execute(select(func.count(ToolExecution.id)))).scalar() == exec_cnt
    assert (await db_session.execute(select(func.count(ApprovalRequest.id)))).scalar() == app_cnt
    assert (await db_session.execute(select(func.count(RiskAssessment.id)))).scalar() == risk_cnt


# ==============================================================================
# 6. OpenAPI Schema Registration Test
# ==============================================================================


@pytest.mark.asyncio
async def test_analytics_openapi_schema_registration(client: AsyncClient) -> None:
    """Verify OpenAPI schema registers all 6 endpoints with their response schemas."""
    resp = await client.get("/openapi.json")
    assert resp.status_code == 200
    schema = resp.json()
    paths = schema["paths"]

    expected_endpoints = [
        "/api/v1/analytics/overview",
        "/api/v1/analytics/trends",
        "/api/v1/analytics/risk-distribution",
        "/api/v1/analytics/agents",
        "/api/v1/analytics/tools",
        "/api/v1/analytics/anomalies",
    ]
    for ep in expected_endpoints:
        assert ep in paths, f"OpenAPI missing endpoint: {ep}"
        assert "get" in paths[ep], f"Endpoint {ep} missing GET operation"
        get_op = paths[ep]["get"]
        assert "200" in get_op["responses"], f"Endpoint {ep} missing 200 response"
