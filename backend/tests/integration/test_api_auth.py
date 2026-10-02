"""Integration tests for authentication API."""

from collections.abc import AsyncGenerator

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.security import get_password_hash
from app.users.models import Organization, OrganizationStatus, Role, User, UserStatus


@pytest.fixture
async def test_user(db_session: AsyncSession) -> AsyncGenerator[dict[str, str], None]:
    """Create a test organization and user."""
    import uuid

    uid = uuid.uuid4()
    org = Organization(
        name=f"API Test Org {uid}",
        slug=f"api-test-org-{uid}",
        status=OrganizationStatus.ACTIVE,
    )
    db_session.add(org)
    await db_session.commit()
    await db_session.refresh(org)

    password = "MySecurePassword123"  # noqa: S105
    user = User(
        organization_id=org.id,
        email=f"apiuser-{uid}@example.com",
        password_hash=get_password_hash(password),
        display_name="API User",
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
        "org_id": str(org.id),
    }

    await db_session.delete(user)
    await db_session.delete(org)
    await db_session.commit()


@pytest.mark.asyncio
async def test_login_success(client: AsyncClient, test_user: dict[str, str]) -> None:
    """Test successful login."""
    response = await client.post(
        "/api/v1/auth/login",
        data={
            "username": test_user["email"],
            "password": test_user["password"],
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"  # noqa: S105


@pytest.mark.asyncio
async def test_login_failure(client: AsyncClient, test_user: dict[str, str]) -> None:
    """Test failed login with incorrect password."""
    response = await client.post(
        "/api/v1/auth/login",
        data={
            "username": test_user["email"],
            "password": "wrongpassword",
        },
    )
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_get_me(client: AsyncClient, test_user: dict[str, str]) -> None:
    """Test getting current user profile."""
    # Login first
    login_resp = await client.post(
        "/api/v1/auth/login",
        data={
            "username": test_user["email"],
            "password": test_user["password"],
        },
    )
    token = login_resp.json()["access_token"]

    # Get /me
    response = await client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["email"] == test_user["email"]
    assert data["id"] == test_user["id"]
    assert "password_hash" not in data
