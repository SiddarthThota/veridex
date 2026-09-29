"""User management API routes."""

from collections.abc import Sequence
from typing import Annotated

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from uuid import UUID

from app.auth.deps import RequireRole
from app.database.session import get_db
from app.users.models import Role, User

router = APIRouter(prefix="/users", tags=["users"])


class UserResponse(BaseModel):
    """User response schema."""

    id: UUID
    organization_id: UUID
    email: str
    display_name: str
    role: str
    status: str

    class Config:
        from_attributes = True


@router.get("", response_model=list[UserResponse])
async def list_users(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[
        User, Depends(RequireRole([Role.ADMIN, Role.SECURITY_ANALYST, Role.AUDITOR]))
    ],
) -> Sequence[User]:
    """List users in the organization."""
    # Enforce isolation to the current user's organization
    stmt = select(User).where(User.organization_id == current_user.organization_id)
    result = await db.execute(stmt)
    return result.scalars().all()
