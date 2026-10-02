"""Integration tests for Users API."""

from collections.abc import AsyncGenerator

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.security import get_password_hash
from app.users.models import Organization, OrganizationStatus, Role, User, UserStatus


@pytest.fixture
async def rbac_users(db_session: AsyncSession) -> AsyncGenerator[dict[str, dict[str, str]], None]:
    """Create a set of users with different roles for RBAC testing."""
    import uuid

    uid = uuid.uuid4()
    org = Organization(
        name=f"RBAC Test Org {uid}",
        slug=f"rbac-test-org-{uid}",
        status=OrganizationStatus.ACTIVE,
    )
    db_session.add(org)
    await db_session.commit()
    await db_session.refresh(org)

    password = "MySecurePassword123"  # noqa: S105
    hashed = get_password_hash(password)

    users_info = {}

    for role in [Role.ADMIN, Role.SECURITY_ANALYST, Role.VIEWER]:
        user = User(
            organization_id=org.id,
            email=f"{role.value.lower()}-{uid}@example.com",
            password_hash=hashed,
            display_name=f"{role.value.capitalize()} User",
            status=UserStatus.ACTIVE,
            role=role,
        )
        db_session.add(user)
        await db_session.commit()

        users_info[role.value] = {
            "email": user.email,
            "password": password,
            "user": user,
        }

    yield users_info

    for role_info in users_info.values():
        await db_session.delete(role_info["user"])
    await db_session.delete(org)
    await db_session.commit()


async def get_token(client: AsyncClient, email: str, password: str) -> str:
    """Helper to get a token for a user."""
    response = await client.post(
        "/api/v1/auth/login",
        data={"username": email, "password": password},
    )
    return response.json()["access_token"]


@pytest.mark.asyncio
async def test_list_users_admin(client: AsyncClient, rbac_users: dict[str, dict[str, str]]) -> None:  # noqa: E501
    """Test that ADMIN can list users."""
    token = await get_token(
        client, rbac_users[Role.ADMIN]["email"], rbac_users[Role.ADMIN]["password"]
    )  # noqa: E501

    response = await client.get(
        "/api/v1/users",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200
    data = response.json()
    assert len(data) >= 3


@pytest.mark.asyncio
async def test_list_users_viewer_denied(
    client: AsyncClient, rbac_users: dict[str, dict[str, str]]
) -> None:  # noqa: E501
    """Test that VIEWER cannot list users."""
    token = await get_token(
        client, rbac_users[Role.VIEWER]["email"], rbac_users[Role.VIEWER]["password"]
    )  # noqa: E501

    response = await client.get(
        "/api/v1/users",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 403
