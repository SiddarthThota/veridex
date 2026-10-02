"""Integration tests for Agents API."""

from collections.abc import AsyncGenerator

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.agents.models import Agent
from app.auth.security import get_password_hash
from app.users.models import Organization, OrganizationStatus, Role, User, UserStatus


@pytest.fixture
async def admin_user(db_session: AsyncSession) -> AsyncGenerator[dict[str, str], None]:
    """Create a test admin user."""
    import uuid

    uid = uuid.uuid4()
    org = Organization(
        name=f"Org {uid}",
        slug=f"org-{uid}",
        status=OrganizationStatus.ACTIVE,
    )
    db_session.add(org)
    await db_session.commit()
    await db_session.refresh(org)

    password = "MySecurePassword123"
    user = User(
        organization_id=org.id,
        email=f"admin-{uid}@example.com",
        password_hash=get_password_hash(password),
        display_name="Admin",
        status=UserStatus.ACTIVE,
        role=Role.ADMIN,
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)

    yield {
        "email": user.email,
        "password": password,
        "id": str(user.id),
        "org_id": str(org.id),
    }

    from sqlalchemy import delete

    await db_session.execute(delete(Agent).where(Agent.organization_id == org.id))
    await db_session.commit()

    await db_session.delete(user)
    await db_session.delete(org)
    await db_session.commit()


@pytest.fixture
async def viewer_user(
    db_session: AsyncSession, admin_user: dict[str, str]
) -> AsyncGenerator[dict[str, str], None]:
    """Create a test viewer user in the same org."""
    import uuid

    uid = uuid.uuid4()

    password = "MySecurePassword123"
    user = User(
        organization_id=uuid.UUID(admin_user["org_id"]),
        email=f"viewer-{uid}@example.com",
        password_hash=get_password_hash(password),
        display_name="Viewer",
        status=UserStatus.ACTIVE,
        role=Role.VIEWER,
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)

    yield {
        "email": user.email,
        "password": password,
        "id": str(user.id),
        "org_id": admin_user["org_id"],
    }

    from sqlalchemy import delete

    await db_session.execute(delete(Agent).where(Agent.owner_user_id == user.id))
    await db_session.commit()

    await db_session.delete(user)
    await db_session.commit()


@pytest.fixture
async def admin_token(client: AsyncClient, admin_user: dict[str, str]) -> str:
    response = await client.post(
        "/api/v1/auth/login",
        data={"username": admin_user["email"], "password": admin_user["password"]},
    )
    return response.json()["access_token"]


@pytest.fixture
async def viewer_token(client: AsyncClient, viewer_user: dict[str, str]) -> str:
    response = await client.post(
        "/api/v1/auth/login",
        data={"username": viewer_user["email"], "password": viewer_user["password"]},
    )
    return response.json()["access_token"]


@pytest.mark.asyncio
async def test_create_agent_success(client: AsyncClient, admin_token: str) -> None:
    response = await client.post(
        "/api/v1/agents",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={
            "name": "Test Agent",
            "description": "A test agent",
            "environment": "DEVELOPMENT",
            "risk_tier": "LOW",
            "model_provider": "openai",
            "model_name": "gpt-4o",
        },
    )
    assert response.status_code == 201
    data = response.json()
    assert data["name"] == "Test Agent"
    assert data["slug"] == "test-agent"
    assert data["status"] == "DRAFT"


@pytest.mark.asyncio
async def test_create_agent_duplicate_name(client: AsyncClient, admin_token: str) -> None:
    payload = {
        "name": "Test Agent Duplicate",
        "description": "A test agent",
        "environment": "DEVELOPMENT",
        "risk_tier": "LOW",
        "model_provider": "openai",
        "model_name": "gpt-4o",
    }
    await client.post(
        "/api/v1/agents", headers={"Authorization": f"Bearer {admin_token}"}, json=payload
    )
    response = await client.post(
        "/api/v1/agents", headers={"Authorization": f"Bearer {admin_token}"}, json=payload
    )
    assert response.status_code == 409


@pytest.mark.asyncio
async def test_viewer_cannot_create_agent(client: AsyncClient, viewer_token: str) -> None:
    response = await client.post(
        "/api/v1/agents",
        headers={"Authorization": f"Bearer {viewer_token}"},
        json={
            "name": "Test Agent 2",
            "environment": "DEVELOPMENT",
            "risk_tier": "LOW",
            "model_provider": "openai",
            "model_name": "gpt-4o",
        },
    )
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_agent_lifecycle(client: AsyncClient, admin_token: str) -> None:
    # Create
    response = await client.post(
        "/api/v1/agents",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={
            "name": "Lifecycle Agent",
            "environment": "DEVELOPMENT",
            "risk_tier": "LOW",
            "model_provider": "openai",
            "model_name": "gpt-4o",
        },
    )
    assert response.status_code == 201
    agent_id = response.json()["id"]

    # Activate
    response = await client.post(
        f"/api/v1/agents/{agent_id}/activate", headers={"Authorization": f"Bearer {admin_token}"}
    )
    assert response.status_code == 200
    assert response.json()["status"] == "ACTIVE"

    # Suspend
    response = await client.post(
        f"/api/v1/agents/{agent_id}/suspend", headers={"Authorization": f"Bearer {admin_token}"}
    )
    assert response.status_code == 200
    assert response.json()["status"] == "SUSPENDED"

    # Deactivate
    response = await client.post(
        f"/api/v1/agents/{agent_id}/deactivate", headers={"Authorization": f"Bearer {admin_token}"}
    )
    assert response.status_code == 200
    assert response.json()["status"] == "DEACTIVATED"

    # Try to deactivate again
    response = await client.post(
        f"/api/v1/agents/{agent_id}/deactivate", headers={"Authorization": f"Bearer {admin_token}"}
    )
    assert response.status_code == 409


@pytest.mark.asyncio
async def test_create_agent_version(client: AsyncClient, admin_token: str) -> None:
    # Create Agent
    response = await client.post(
        "/api/v1/agents",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={
            "name": "Version Test Agent",
            "environment": "DEVELOPMENT",
            "risk_tier": "LOW",
            "model_provider": "openai",
            "model_name": "gpt-4o",
        },
    )
    agent_id = response.json()["id"]

    # List Versions
    response = await client.get(
        f"/api/v1/agents/{agent_id}/versions", headers={"Authorization": f"Bearer {admin_token}"}
    )
    assert response.status_code == 200
    assert len(response.json()) == 1  # Draft version created automatically

    # Create Version
    response = await client.post(
        f"/api/v1/agents/{agent_id}/versions?version_string=1.0.0",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={
            "model_provider": "anthropic",
            "model_name": "claude-3",
            "system_configuration": {"prompt": "Be nice."},
        },
    )
    assert response.status_code == 201
    assert response.json()["version"] == "1.0.0"
