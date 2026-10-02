"""Organization management API routes."""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import get_current_user
from app.database.session import get_db
from app.users.models import Organization, User

router = APIRouter(prefix="/organizations", tags=["organizations"])


class OrganizationResponse(BaseModel):
    """Organization response schema."""

    id: str
    name: str
    slug: str
    status: str

    class Config:
        from_attributes = True


@router.get("/my", response_model=OrganizationResponse)
async def get_my_organization(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> Organization:
    """Get the organization for the current user."""
    stmt = select(Organization).where(Organization.id == current_user.organization_id)
    result = await db.execute(stmt)
    org = result.scalar_one_or_none()

    if not org:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organization not found")

    return org
