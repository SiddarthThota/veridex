"""Service layer for Agent Registry."""

import uuid
from collections.abc import Sequence

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.agents.models import Agent, AgentStatus, AgentVersion, AgentVersionStatus
from app.agents.schemas import AgentCreate, AgentUpdate, AgentVersionCreate


async def get_agent(db: AsyncSession, agent_id: uuid.UUID) -> Agent | None:
    stmt = select(Agent).where(Agent.id == agent_id)
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


async def get_agent_by_slug(
    db: AsyncSession, organization_id: uuid.UUID, slug: str
) -> Agent | None:
    stmt = select(Agent).where(
        Agent.organization_id == organization_id, Agent.slug == slug
    )
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


async def list_agents(
    db: AsyncSession, organization_id: uuid.UUID, skip: int = 0, limit: int = 100
) -> tuple[Sequence[Agent], int]:
    stmt = select(Agent).where(Agent.organization_id == organization_id)

    # Get total count
    count_stmt = select(func.count()).select_from(stmt.subquery())
    count_result = await db.execute(count_stmt)
    total = count_result.scalar_one()

    # Get items
    stmt = stmt.offset(skip).limit(limit).order_by(Agent.created_at.desc())
    result = await db.execute(stmt)
    items = result.scalars().all()

    return items, total


async def create_agent(
    db: AsyncSession,
    organization_id: uuid.UUID,
    owner_user_id: uuid.UUID,
    agent_in: AgentCreate
) -> Agent:
    import re
    # Generate slug from name
    slug = re.sub(r'[^a-z0-9]+', '-', agent_in.name.lower()).strip('-')

    agent = Agent(
        organization_id=organization_id,
        name=agent_in.name,
        slug=slug,
        description=agent_in.description,
        owner_user_id=owner_user_id,
        environment=agent_in.environment,
        risk_tier=agent_in.risk_tier,
        model_provider=agent_in.model_provider,
        model_name=agent_in.model_name,
        status=AgentStatus.DRAFT
    )
    db.add(agent)
    await db.flush()

    # Create the first draft version automatically
    version = AgentVersion(
        agent_id=agent.id,
        version="0.1.0-draft",
        model_provider=agent.model_provider,
        model_name=agent.model_name,
        created_by=owner_user_id,
        status=AgentVersionStatus.DRAFT,
    )
    db.add(version)
    await db.commit()
    await db.refresh(agent)
    return agent


async def update_agent(
    db: AsyncSession, agent: Agent, agent_in: AgentUpdate
) -> Agent:
    if agent_in.description is not None:
        agent.description = agent_in.description
    if agent_in.environment is not None:
        agent.environment = agent_in.environment
    if agent_in.owner_user_id is not None:
        agent.owner_user_id = agent_in.owner_user_id

    db.add(agent)
    await db.commit()
    await db.refresh(agent)
    return agent


async def change_agent_status(
    db: AsyncSession, agent: Agent, status: AgentStatus
) -> Agent:
    agent.status = status
    db.add(agent)
    await db.commit()
    await db.refresh(agent)
    return agent


async def get_agent_versions(
    db: AsyncSession, agent_id: uuid.UUID
) -> Sequence[AgentVersion]:
    stmt = select(AgentVersion).where(AgentVersion.agent_id == agent_id).order_by(AgentVersion.created_at.desc())
    result = await db.execute(stmt)
    return result.scalars().all()


async def get_agent_version(
    db: AsyncSession, agent_id: uuid.UUID, version_id: uuid.UUID
) -> AgentVersion | None:
    stmt = select(AgentVersion).where(
        AgentVersion.agent_id == agent_id, AgentVersion.id == version_id
    )
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


async def create_agent_version(
    db: AsyncSession,
    agent: Agent,
    user_id: uuid.UUID,
    version_in: AgentVersionCreate,
    version_string: str
) -> AgentVersion:
    version = AgentVersion(
        agent_id=agent.id,
        version=version_string,
        system_configuration=version_in.system_configuration,
        model_provider=version_in.model_provider,
        model_name=version_in.model_name,
        configuration_metadata=version_in.configuration_metadata,
        created_by=user_id,
        status=AgentVersionStatus.DRAFT
    )
    db.add(version)
    await db.commit()
    await db.refresh(version)
    return version


async def publish_agent_version(
    db: AsyncSession, version: AgentVersion, agent: Agent
) -> AgentVersion:
    version.status = AgentVersionStatus.PUBLISHED

    # Also update the agent's main model info if needed
    agent.model_provider = version.model_provider
    agent.model_name = version.model_name

    db.add(version)
    db.add(agent)
    await db.commit()
    await db.refresh(version)
    return version
