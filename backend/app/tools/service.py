"""Service layer for Tool Registry."""

import uuid
from collections.abc import Sequence

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.tools.models import (
    AgentToolPermission,
    Tool,
    ToolStatus,
    ToolVersion,
    ToolVersionStatus,
)
from app.tools.schemas import ToolCreate, ToolUpdate, ToolVersionCreate


async def get_tool(db: AsyncSession, tool_id: uuid.UUID) -> Tool | None:
    stmt = select(Tool).where(Tool.id == tool_id)
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


async def get_tool_by_slug(db: AsyncSession, organization_id: uuid.UUID, slug: str) -> Tool | None:
    stmt = select(Tool).where(Tool.organization_id == organization_id, Tool.slug == slug)
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


async def list_tools(
    db: AsyncSession, organization_id: uuid.UUID, skip: int = 0, limit: int = 100
) -> tuple[Sequence[Tool], int]:
    stmt = select(Tool).where(Tool.organization_id == organization_id)

    # Get total count
    count_stmt = select(func.count()).select_from(stmt.subquery())
    count_result = await db.execute(count_stmt)
    total = count_result.scalar_one()

    # Get items
    stmt = stmt.offset(skip).limit(limit).order_by(Tool.created_at.desc())
    result = await db.execute(stmt)
    items = result.scalars().all()

    return items, total


async def create_tool(
    db: AsyncSession,
    organization_id: uuid.UUID,
    owner_user_id: uuid.UUID,
    tool_in: ToolCreate,
) -> Tool:
    import re

    slug = re.sub(r"[^a-z0-9]+", "-", tool_in.name.lower()).strip("-")

    tool = Tool(
        organization_id=organization_id,
        name=tool_in.name,
        slug=slug,
        description=tool_in.description,
        owner_user_id=owner_user_id,
        risk_level=tool_in.risk_level,
        access_type=tool_in.access_type,
        reversibility=tool_in.reversibility,
        data_classification=tool_in.data_classification,
        approval_requirement=tool_in.approval_requirement,
        timeout_seconds=tool_in.timeout_seconds,
        rate_limit=tool_in.rate_limit,
        status=ToolStatus.DRAFT,
    )
    db.add(tool)
    await db.flush()

    # Create the first draft version automatically
    version = ToolVersion(
        tool_id=tool.id,
        version="0.1.0-draft",
        created_by=owner_user_id,
        status=ToolVersionStatus.DRAFT,
    )
    db.add(version)
    await db.commit()
    await db.refresh(tool)
    return tool


async def update_tool(db: AsyncSession, tool: Tool, tool_in: ToolUpdate) -> Tool:
    if tool_in.description is not None:
        tool.description = tool_in.description
    if tool_in.timeout_seconds is not None:
        tool.timeout_seconds = tool_in.timeout_seconds
    if tool_in.rate_limit is not None:
        tool.rate_limit = tool_in.rate_limit

    db.add(tool)
    await db.commit()
    await db.refresh(tool)
    return tool


async def change_tool_status(db: AsyncSession, tool: Tool, status: ToolStatus) -> Tool:
    tool.status = status
    db.add(tool)
    await db.commit()
    await db.refresh(tool)
    return tool


async def get_tool_versions(db: AsyncSession, tool_id: uuid.UUID) -> Sequence[ToolVersion]:
    stmt = (
        select(ToolVersion)
        .where(ToolVersion.tool_id == tool_id)
        .order_by(ToolVersion.created_at.desc())
    )
    result = await db.execute(stmt)
    return result.scalars().all()


async def get_tool_version(
    db: AsyncSession, tool_id: uuid.UUID, version_id: uuid.UUID
) -> ToolVersion | None:
    stmt = select(ToolVersion).where(ToolVersion.tool_id == tool_id, ToolVersion.id == version_id)
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


async def create_tool_version(
    db: AsyncSession,
    tool: Tool,
    user_id: uuid.UUID,
    version_in: ToolVersionCreate,
) -> ToolVersion:
    version = ToolVersion(
        tool_id=tool.id,
        version=version_in.version,
        description=version_in.description,
        input_schema=version_in.input_schema,
        output_schema=version_in.output_schema,
        configuration_metadata=version_in.configuration_metadata,
        created_by=user_id,
        status=ToolVersionStatus.DRAFT,
    )
    db.add(version)
    await db.commit()
    await db.refresh(version)
    return version


async def publish_tool_version(db: AsyncSession, version: ToolVersion) -> ToolVersion:
    version.status = ToolVersionStatus.PUBLISHED
    db.add(version)
    await db.commit()
    await db.refresh(version)
    return version


async def retire_tool_version(db: AsyncSession, version: ToolVersion) -> ToolVersion:
    version.status = ToolVersionStatus.RETIRED
    db.add(version)
    await db.commit()
    await db.refresh(version)
    return version


async def grant_tool_access(
    db: AsyncSession, agent_id: uuid.UUID, tool_id: uuid.UUID, user_id: uuid.UUID
) -> AgentToolPermission:
    stmt = select(AgentToolPermission).where(
        AgentToolPermission.agent_id == agent_id, AgentToolPermission.tool_id == tool_id
    )
    result = await db.execute(stmt)
    perm = result.scalar_one_or_none()

    if perm:
        if not perm.allowed:
            perm.allowed = True
            perm.created_by = user_id
            db.add(perm)
    else:
        perm = AgentToolPermission(
            agent_id=agent_id,
            tool_id=tool_id,
            allowed=True,
            created_by=user_id,
        )
        db.add(perm)

    await db.commit()
    await db.refresh(perm)
    return perm


async def revoke_tool_access(db: AsyncSession, agent_id: uuid.UUID, tool_id: uuid.UUID) -> None:
    stmt = select(AgentToolPermission).where(
        AgentToolPermission.agent_id == agent_id, AgentToolPermission.tool_id == tool_id
    )
    result = await db.execute(stmt)
    perm = result.scalar_one_or_none()

    if perm:
        await db.delete(perm)
        await db.commit()


async def list_agent_tools(db: AsyncSession, agent_id: uuid.UUID) -> Sequence[AgentToolPermission]:
    stmt = select(AgentToolPermission).where(AgentToolPermission.agent_id == agent_id)
    result = await db.execute(stmt)
    return result.scalars().all()
