"""Tools API endpoints."""

import uuid
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import RequireRole, get_current_user
from app.database.session import get_db
from app.tools import service as tools_service
from app.tools.models import ToolStatus, ToolVersionStatus
from app.tools.schemas import (
    ToolCreate,
    ToolListResponse,
    ToolResponse,
    ToolUpdate,
    ToolVersionCreate,
    ToolVersionResponse,
)
from app.users.models import Role, User

router = APIRouter()


@router.post(
    "",
    response_model=ToolResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(RequireRole([Role.ADMIN, Role.SECURITY_ANALYST]))],
)
async def create_tool(
    tool_in: ToolCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> Any:
    """Create a new tool."""
    import re

    slug = re.sub(r"[^a-z0-9]+", "-", tool_in.name.lower()).strip("-")
    existing_tool = await tools_service.get_tool_by_slug(
        db, organization_id=uuid.UUID(str(current_user.organization_id)), slug=slug
    )
    if existing_tool:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A tool with a similar name already exists in this organization.",
        )

    tool = await tools_service.create_tool(
        db=db,
        organization_id=uuid.UUID(str(current_user.organization_id)),
        owner_user_id=current_user.id,
        tool_in=tool_in,
    )
    return tool


@router.get("", response_model=ToolListResponse)
async def list_tools(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
) -> Any:
    """Retrieve tools."""
    items, total = await tools_service.list_tools(
        db, organization_id=uuid.UUID(str(current_user.organization_id)), skip=skip, limit=limit
    )
    return {"items": items, "total": total}


@router.get("/{tool_id}", response_model=ToolResponse)
async def get_tool(
    tool_id: uuid.UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> Any:
    """Get a specific tool by ID."""
    tool = await tools_service.get_tool(db, tool_id=tool_id)
    if not tool:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Tool not found",
        )
    if tool.organization_id != current_user.organization_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not enough privileges",
        )
    return tool


@router.patch(
    "/{tool_id}",
    response_model=ToolResponse,
    dependencies=[Depends(RequireRole([Role.ADMIN, Role.SECURITY_ANALYST]))],
)
async def update_tool(
    tool_id: uuid.UUID,
    tool_in: ToolUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> Any:
    """Update a tool."""
    tool = await tools_service.get_tool(db, tool_id=tool_id)
    if not tool:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Tool not found",
        )
    if tool.organization_id != current_user.organization_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not enough privileges",
        )

    tool = await tools_service.update_tool(db, tool=tool, tool_in=tool_in)
    return tool


@router.post(
    "/{tool_id}/activate",
    response_model=ToolResponse,
    dependencies=[Depends(RequireRole([Role.ADMIN, Role.SECURITY_ANALYST]))],
)
async def activate_tool(
    tool_id: uuid.UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> Any:
    """Activate a tool."""
    tool = await tools_service.get_tool(db, tool_id=tool_id)
    if not tool or tool.organization_id != current_user.organization_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tool not found")

    if tool.status not in [ToolStatus.DRAFT, ToolStatus.SUSPENDED]:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Cannot transition from {tool.status} to ACTIVE.",
        )

    tool = await tools_service.change_tool_status(db, tool=tool, status=ToolStatus.ACTIVE)
    return tool


@router.post(
    "/{tool_id}/suspend",
    response_model=ToolResponse,
    dependencies=[Depends(RequireRole([Role.ADMIN, Role.SECURITY_ANALYST]))],
)
async def suspend_tool(
    tool_id: uuid.UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> Any:
    """Suspend a tool."""
    tool = await tools_service.get_tool(db, tool_id=tool_id)
    if not tool or tool.organization_id != current_user.organization_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tool not found")

    if tool.status != ToolStatus.ACTIVE:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Cannot transition from {tool.status} to SUSPENDED.",
        )

    tool = await tools_service.change_tool_status(db, tool=tool, status=ToolStatus.SUSPENDED)
    return tool


@router.post(
    "/{tool_id}/deactivate",
    response_model=ToolResponse,
    dependencies=[Depends(RequireRole([Role.ADMIN, Role.SECURITY_ANALYST]))],
)
async def deactivate_tool(
    tool_id: uuid.UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> Any:
    """Deactivate a tool."""
    tool = await tools_service.get_tool(db, tool_id=tool_id)
    if not tool or tool.organization_id != current_user.organization_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tool not found")

    if tool.status == ToolStatus.DEACTIVATED:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Tool is already deactivated.",
        )

    tool = await tools_service.change_tool_status(db, tool=tool, status=ToolStatus.DEACTIVATED)
    return tool


@router.get("/{tool_id}/versions", response_model=list[ToolVersionResponse])
async def list_tool_versions(
    tool_id: uuid.UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> Any:
    """List all versions for a tool."""
    tool = await tools_service.get_tool(db, tool_id=tool_id)
    if not tool or tool.organization_id != current_user.organization_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tool not found")

    versions = await tools_service.get_tool_versions(db, tool_id=tool_id)
    return versions


@router.post(
    "/{tool_id}/versions",
    response_model=ToolVersionResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(RequireRole([Role.ADMIN, Role.SECURITY_ANALYST]))],
)
async def create_tool_version(
    tool_id: uuid.UUID,
    version_in: ToolVersionCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> Any:
    """Create a new tool version."""
    tool = await tools_service.get_tool(db, tool_id=tool_id)
    if not tool or tool.organization_id != current_user.organization_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tool not found")

    from sqlalchemy import select

    from app.tools.models import ToolVersion

    stmt = select(ToolVersion).where(
        ToolVersion.tool_id == tool_id, ToolVersion.version == version_in.version
    )
    result = await db.execute(stmt)
    if result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Version string already exists for this tool.",
        )

    version = await tools_service.create_tool_version(
        db=db,
        tool=tool,
        user_id=current_user.id,
        version_in=version_in,
    )
    return version


@router.get("/{tool_id}/versions/{version_id}", response_model=ToolVersionResponse)
async def get_tool_version(
    tool_id: uuid.UUID,
    version_id: uuid.UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> Any:
    """Get a specific tool version."""
    tool = await tools_service.get_tool(db, tool_id=tool_id)
    if not tool or tool.organization_id != current_user.organization_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tool not found")

    version = await tools_service.get_tool_version(db, tool_id=tool_id, version_id=version_id)
    if not version:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tool version not found")
    return version


@router.post(
    "/{tool_id}/versions/{version_id}/publish",
    response_model=ToolVersionResponse,
    dependencies=[Depends(RequireRole([Role.ADMIN, Role.SECURITY_ANALYST]))],
)
async def publish_tool_version(
    tool_id: uuid.UUID,
    version_id: uuid.UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> Any:
    """Publish a tool version."""
    tool = await tools_service.get_tool(db, tool_id=tool_id)
    if not tool or tool.organization_id != current_user.organization_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tool not found")

    version = await tools_service.get_tool_version(db, tool_id=tool_id, version_id=version_id)
    if not version:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tool version not found")

    if version.status != ToolVersionStatus.DRAFT:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Can only publish DRAFT versions."
        )

    return await tools_service.publish_tool_version(db, version=version)
