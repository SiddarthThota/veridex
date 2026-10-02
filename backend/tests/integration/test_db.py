"""Integration tests for database and models."""

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.users.models import Organization, OrganizationStatus, Role, User, UserStatus


@pytest.mark.asyncio
async def test_organization_and_user_creation(db_session: AsyncSession) -> None:
    """Test creating an organization and a user within it."""

    # Create Organization
    import uuid

    org_slug = f"test-org-{uuid.uuid4()}"
    org = Organization(
        name="Test Org",
        slug=org_slug,
        status=OrganizationStatus.ACTIVE,
    )
    db_session.add(org)
    await db_session.commit()
    await db_session.refresh(org)

    assert org.id is not None
    assert org.name == "Test Org"

    # Create User
    email = f"testuser@{org_slug}.com"
    user = User(
        organization_id=org.id,
        email=email,
        password_hash="fake-hash",
        display_name="Test User",
        status=UserStatus.ACTIVE,
        role=Role.ADMIN,
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)

    assert user.id is not None
    assert user.email == email
    assert user.organization_id == org.id

    # Query back
    stmt = select(User).where(User.email == email)
    result = await db_session.execute(stmt)
    fetched_user = result.scalar_one_or_none()

    assert fetched_user is not None
    assert fetched_user.id == user.id

    # Clean up (Optional, usually fixtures handle rolling back but we committed)
    await db_session.delete(fetched_user)
    await db_session.delete(org)
    await db_session.commit()
