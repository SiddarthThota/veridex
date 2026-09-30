"""Pydantic schemas for Agent and AgentVersion."""

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from app.agents.models import AgentEnvironment, AgentRiskTier, AgentStatus, AgentVersionStatus


class AgentVersionBase(BaseModel):
    system_configuration: dict[str, Any] | None = None
    model_provider: str = Field(..., min_length=1)
    model_name: str = Field(..., min_length=1)
    configuration_metadata: dict[str, Any] | None = None


class AgentVersionCreate(AgentVersionBase):
    pass


class AgentVersionResponse(AgentVersionBase):
    id: uuid.UUID
    agent_id: uuid.UUID
    version: str
    created_by: uuid.UUID
    status: AgentVersionStatus
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class AgentBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    description: str | None = None
    environment: AgentEnvironment
    risk_tier: AgentRiskTier
    model_provider: str = Field(..., min_length=1)
    model_name: str = Field(..., min_length=1)


class AgentCreate(AgentBase):
    pass


class AgentUpdate(BaseModel):
    description: str | None = None
    environment: AgentEnvironment | None = None
    owner_user_id: uuid.UUID | None = None


class AgentResponse(AgentBase):
    id: uuid.UUID
    organization_id: uuid.UUID
    slug: str
    owner_user_id: uuid.UUID
    status: AgentStatus
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class AgentListResponse(BaseModel):
    items: list[AgentResponse]
    total: int
