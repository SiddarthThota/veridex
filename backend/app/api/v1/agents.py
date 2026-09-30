"""Agents API endpoints."""

import uuid
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.agents import service as agents_service
from app.agents.models import AgentStatus
from app.agents.schemas import (
    AgentCreate,
    AgentListResponse,
    AgentResponse,
    AgentUpdate,
    AgentVersionCreate,
    AgentVersionResponse,
)
from app.auth.deps import RequireRole, get_current_user
from app.database.session import get_db
from app.users.models import Role, User

router = APIRouter()


@router.post(
    "",
    response_model=AgentResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(RequireRole([Role.ADMIN, Role.AGENT_OPERATOR]))],
)
async def create_agent(
    agent_in: AgentCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> Any:
    """Create a new agent."""
    # Check for duplicate agent slug within the same org
    import re
    slug = re.sub(r'[^a-z0-9]+', '-', agent_in.name.lower()).strip('-')
    existing_agent = await agents_service.get_agent_by_slug(
        db, organization_id=uuid.UUID(str(current_user.organization_id)), slug=slug
    )
    if existing_agent:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An agent with a similar name already exists in this organization.",
        )

    agent = await agents_service.create_agent(
        db=db,
        organization_id=uuid.UUID(str(current_user.organization_id)),
        owner_user_id=current_user.id,
        agent_in=agent_in,
    )
    return agent


@router.get("", response_model=AgentListResponse)
async def list_agents(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
) -> Any:
    """Retrieve agents."""
    items, total = await agents_service.list_agents(
        db, organization_id=uuid.UUID(str(current_user.organization_id)), skip=skip, limit=limit
    )
    return {"items": items, "total": total}


@router.get("/{agent_id}", response_model=AgentResponse)
async def get_agent(
    agent_id: uuid.UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> Any:
    """Get a specific agent by ID."""
    agent = await agents_service.get_agent(db, agent_id=agent_id)
    if not agent:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Agent not found",
        )
    if agent.organization_id != current_user.organization_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not enough privileges",
        )
    return agent


@router.patch(
    "/{agent_id}",
    response_model=AgentResponse,
    dependencies=[Depends(RequireRole([Role.ADMIN, Role.AGENT_OPERATOR]))],
)
async def update_agent(
    agent_id: uuid.UUID,
    agent_in: AgentUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> Any:
    """Update an agent."""
    agent = await agents_service.get_agent(db, agent_id=agent_id)
    if not agent:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Agent not found",
        )
    if agent.organization_id != current_user.organization_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not enough privileges",
        )

    # Check owner if being reassigned
    if agent_in.owner_user_id is not None:
        from sqlalchemy import select

        from app.users import models as users_models
        stmt = select(users_models.User).where(users_models.User.id == agent_in.owner_user_id)
        result = await db.execute(stmt)
        new_owner = result.scalar_one_or_none()
        if not new_owner or new_owner.organization_id != current_user.organization_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="New owner must belong to the same organization.",
            )

    agent = await agents_service.update_agent(db, agent=agent, agent_in=agent_in)
    return agent


@router.post(
    "/{agent_id}/activate",
    response_model=AgentResponse,
    dependencies=[Depends(RequireRole([Role.ADMIN, Role.AGENT_OPERATOR]))],
)
async def activate_agent(
    agent_id: uuid.UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> Any:
    """Activate an agent."""
    agent = await agents_service.get_agent(db, agent_id=agent_id)
    if not agent or agent.organization_id != current_user.organization_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agent not found")

    if agent.status not in [AgentStatus.DRAFT, AgentStatus.SUSPENDED]:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Cannot transition from {agent.status} to ACTIVE.",
        )

    agent = await agents_service.change_agent_status(db, agent=agent, status=AgentStatus.ACTIVE)
    return agent


@router.post(
    "/{agent_id}/suspend",
    response_model=AgentResponse,
    dependencies=[Depends(RequireRole([Role.ADMIN, Role.AGENT_OPERATOR]))],
)
async def suspend_agent(
    agent_id: uuid.UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> Any:
    """Suspend an agent."""
    agent = await agents_service.get_agent(db, agent_id=agent_id)
    if not agent or agent.organization_id != current_user.organization_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agent not found")

    if agent.status != AgentStatus.ACTIVE:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Cannot transition from {agent.status} to SUSPENDED.",
        )

    agent = await agents_service.change_agent_status(db, agent=agent, status=AgentStatus.SUSPENDED)
    return agent


@router.post(
    "/{agent_id}/deactivate",
    response_model=AgentResponse,
    dependencies=[Depends(RequireRole([Role.ADMIN, Role.AGENT_OPERATOR]))],
)
async def deactivate_agent(
    agent_id: uuid.UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> Any:
    """Deactivate an agent (soft delete)."""
    agent = await agents_service.get_agent(db, agent_id=agent_id)
    if not agent or agent.organization_id != current_user.organization_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agent not found")

    if agent.status == AgentStatus.DEACTIVATED:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Agent is already deactivated.",
        )

    agent = await agents_service.change_agent_status(db, agent=agent, status=AgentStatus.DEACTIVATED)
    return agent


@router.get("/{agent_id}/versions", response_model=list[AgentVersionResponse])
async def list_agent_versions(
    agent_id: uuid.UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> Any:
    """List all versions for an agent."""
    agent = await agents_service.get_agent(db, agent_id=agent_id)
    if not agent or agent.organization_id != current_user.organization_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agent not found")

    versions = await agents_service.get_agent_versions(db, agent_id=agent_id)
    return versions


@router.post(
    "/{agent_id}/versions",
    response_model=AgentVersionResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(RequireRole([Role.ADMIN, Role.AGENT_OPERATOR]))],
)
async def create_agent_version(
    agent_id: uuid.UUID,
    version_in: AgentVersionCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
    version_string: str = Query(..., min_length=1),
) -> Any:
    """Create a new agent version."""
    agent = await agents_service.get_agent(db, agent_id=agent_id)
    if not agent or agent.organization_id != current_user.organization_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agent not found")

    # Check if version exists
    from sqlalchemy import select
    from app.agents.models import AgentVersion
    stmt = select(AgentVersion).where(
        AgentVersion.agent_id == agent_id,
        AgentVersion.version == version_string
    )
    result = await db.execute(stmt)
    if result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Version string already exists for this agent.",
        )

    version = await agents_service.create_agent_version(
        db=db,
        agent=agent,
        user_id=current_user.id,
        version_in=version_in,
        version_string=version_string,
    )
    return version
