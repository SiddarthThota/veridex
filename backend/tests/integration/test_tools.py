"""Integration tests for tools API."""

import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

pytestmark = pytest.mark.asyncio


async def test_viewer_cannot_create_tool(
    client: AsyncClient, viewer_token_headers: dict[str, str]
) -> None:
    response = await client.post(
        "/api/v1/tools",
        headers=viewer_token_headers,
        json={
            "name": "viewer-tool",
            "description": "viewer tool",
            "risk_level": "LOW",
            "access_type": "READ",
            "reversibility": "REVERSIBLE",
            "data_classification": "PUBLIC",
            "approval_requirement": "NOT_REQUIRED",
        },
    )
    assert response.status_code == 403


async def test_admin_create_tool_and_lifecycle(
    client: AsyncClient, admin_token_headers: dict[str, str]
) -> None:
    # 1. Create tool
    response = await client.post(
        "/api/v1/tools",
        headers=admin_token_headers,
        json={
            "name": "Customer Search",
            "description": "Search customers by email",
            "risk_level": "LOW",
            "access_type": "READ",
            "reversibility": "REVERSIBLE",
            "data_classification": "CONFIDENTIAL",
            "approval_requirement": "NOT_REQUIRED",
        },
    )
    assert response.status_code == 201
    data = response.json()
    assert data["name"] == "Customer Search"
    assert data["slug"] == "customer-search"
    assert data["status"] == "DRAFT"
    tool_id = data["id"]

    # 2. Get tool versions (should have draft)
    ver_response = await client.get(
        f"/api/v1/tools/{tool_id}/versions", headers=admin_token_headers
    )
    assert ver_response.status_code == 200
    versions = ver_response.json()
    assert len(versions) == 1
    assert versions[0]["version"] == "0.1.0-draft"
    assert versions[0]["status"] == "DRAFT"

    # 3. Activate tool
    activate_response = await client.post(
        f"/api/v1/tools/{tool_id}/activate", headers=admin_token_headers
    )
    assert activate_response.status_code == 200
    assert activate_response.json()["status"] == "ACTIVE"

    # 4. Suspend tool
    suspend_response = await client.post(
        f"/api/v1/tools/{tool_id}/suspend", headers=admin_token_headers
    )
    assert suspend_response.status_code == 200
    assert suspend_response.json()["status"] == "SUSPENDED"


async def test_cross_org_tool_access_blocked(
    client: AsyncClient,
    admin_token_headers: dict[str, str],
    analyst_org2_token_headers: dict[str, str],
) -> None:
    # Org 1 admin creates a tool
    create_response = await client.post(
        "/api/v1/tools",
        headers=admin_token_headers,
        json={
            "name": "Org 1 Tool",
            "description": "Org 1 Tool",
            "risk_level": "LOW",
        },
    )
    assert create_response.status_code == 201
    tool_id = create_response.json()["id"]

    # Org 2 analyst tries to get it
    get_response = await client.get(f"/api/v1/tools/{tool_id}", headers=analyst_org2_token_headers)
    assert get_response.status_code in [403, 404]


async def test_agent_tool_permissions(
    client: AsyncClient, admin_token_headers: dict[str, str]
) -> None:
    # Admin creates agent
    agent_resp = await client.post(
        "/api/v1/agents",
        headers=admin_token_headers,
        json={
            "name": "test-agent-tools",
            "description": "for testing tools",
            "environment": "DEVELOPMENT",
            "risk_tier": "LOW",
            "model_provider": "openai",
            "model_name": "gpt-4",
        },
    )
    assert agent_resp.status_code == 201
    agent_id = agent_resp.json()["id"]

    # Admin creates tool
    tool_resp = await client.post(
        "/api/v1/tools",
        headers=admin_token_headers,
        json={
            "name": "agent-tool",
            "description": "for agent",
            "risk_level": "LOW",
        },
    )
    assert tool_resp.status_code == 201
    tool_id = tool_resp.json()["id"]

    # Grant access
    grant_resp = await client.post(
        f"/api/v1/agents/{agent_id}/tools/{tool_id}",
        headers=admin_token_headers,
    )
    assert grant_resp.status_code == 201
    assert grant_resp.json()["allowed"] is True

    # List agent tools
    list_resp = await client.get(f"/api/v1/agents/{agent_id}/tools", headers=admin_token_headers)
    assert list_resp.status_code == 200
    tools = list_resp.json()
    assert len(tools) == 1
    assert tools[0]["tool_id"] == tool_id

    # Revoke access
    revoke_resp = await client.delete(
        f"/api/v1/agents/{agent_id}/tools/{tool_id}", headers=admin_token_headers
    )
    assert revoke_resp.status_code == 204

    # List agent tools again
    list_resp2 = await client.get(f"/api/v1/agents/{agent_id}/tools", headers=admin_token_headers)
    tools2 = list_resp2.json()
    # It might still return the object but with allowed=False, or entirely removed.
    # We used db.delete(perm) in service.py, so it should be empty.
    assert len(tools2) == 0


@pytest.fixture
async def admin_token_headers(client: AsyncClient, db_session: AsyncSession) -> dict[str, str]:
    from app.auth.security import get_password_hash
    from app.users.models import Organization, OrganizationStatus, Role, User, UserStatus

    uid = uuid.uuid4()
    org = Organization(name=f"Org {uid}", slug=f"org-{uid}", status=OrganizationStatus.ACTIVE)
    db_session.add(org)
    await db_session.commit()
    await db_session.refresh(org)
    test_password = "pass"  # noqa: S105
    user = User(
        organization_id=org.id,
        email=f"admin-{uid}@example.com",
        password_hash=get_password_hash(test_password),
        display_name="Admin",
        status=UserStatus.ACTIVE,
        role=Role.ADMIN,
    )
    db_session.add(user)
    await db_session.commit()
    response = await client.post(
        "/api/v1/auth/login", data={"username": user.email, "password": test_password}
    )
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


@pytest.fixture
async def viewer_token_headers(client: AsyncClient, db_session: AsyncSession) -> dict[str, str]:
    from app.auth.security import get_password_hash
    from app.users.models import Organization, OrganizationStatus, Role, User, UserStatus

    uid = uuid.uuid4()
    org = Organization(name=f"Org {uid}", slug=f"org-{uid}", status=OrganizationStatus.ACTIVE)
    db_session.add(org)
    await db_session.commit()
    await db_session.refresh(org)
    test_password = "pass"  # noqa: S105
    user = User(
        organization_id=org.id,
        email=f"viewer-{uid}@example.com",
        password_hash=get_password_hash(test_password),
        display_name="Viewer",
        status=UserStatus.ACTIVE,
        role=Role.VIEWER,
    )
    db_session.add(user)
    await db_session.commit()
    response = await client.post(
        "/api/v1/auth/login", data={"username": user.email, "password": test_password}
    )
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


@pytest.fixture
async def analyst_org2_token_headers(
    client: AsyncClient, db_session: AsyncSession
) -> dict[str, str]:
    from app.auth.security import get_password_hash
    from app.users.models import Organization, OrganizationStatus, Role, User, UserStatus

    uid = uuid.uuid4()
    org = Organization(name=f"Org {uid}", slug=f"org-{uid}", status=OrganizationStatus.ACTIVE)
    db_session.add(org)
    await db_session.commit()
    await db_session.refresh(org)
    test_password = "pass"  # noqa: S105
    user = User(
        organization_id=org.id,
        email=f"user-{uid}@example.com",
        password_hash=get_password_hash(test_password),
        display_name="User",
        status=UserStatus.ACTIVE,
        role=Role.AGENT_OPERATOR,
    )
    db_session.add(user)
    await db_session.commit()
    response = await client.post(
        "/api/v1/auth/login", data={"username": user.email, "password": test_password}
    )
    return {"Authorization": f"Bearer {response.json()['access_token']}"}
