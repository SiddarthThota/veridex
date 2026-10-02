"""Pydantic schemas for Tool and ToolVersion."""

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from app.tools.models import (
    ToolAccessType,
    ToolApprovalRequirement,
    ToolDataClassification,
    ToolReversibility,
    ToolRiskLevel,
    ToolStatus,
    ToolVersionStatus,
)


class ToolVersionBase(BaseModel):
    version: str = Field(..., min_length=1, max_length=50)
    description: str | None = None
    input_schema: dict[str, Any] | None = None
    output_schema: dict[str, Any] | None = None
    configuration_metadata: dict[str, Any] | None = None


class ToolVersionCreate(ToolVersionBase):
    pass


class ToolVersionResponse(ToolVersionBase):
    id: uuid.UUID
    tool_id: uuid.UUID
    created_by: uuid.UUID
    status: ToolVersionStatus
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ToolBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    description: str | None = None
    risk_level: ToolRiskLevel = ToolRiskLevel.LOW
    access_type: ToolAccessType = ToolAccessType.READ
    reversibility: ToolReversibility = ToolReversibility.REVERSIBLE
    data_classification: ToolDataClassification = ToolDataClassification.INTERNAL
    approval_requirement: ToolApprovalRequirement = ToolApprovalRequirement.NOT_REQUIRED
    timeout_seconds: int | None = Field(default=None, ge=1)
    rate_limit: int | None = Field(default=None, ge=1)


class ToolCreate(ToolBase):
    pass


class ToolUpdate(BaseModel):
    description: str | None = None
    timeout_seconds: int | None = Field(default=None, ge=1)
    rate_limit: int | None = Field(default=None, ge=1)
    # Status, permissions, owner, org etc. are not arbitrarily modified by simple PATCH.


class ToolResponse(ToolBase):
    id: uuid.UUID
    organization_id: uuid.UUID
    slug: str
    owner_user_id: uuid.UUID
    status: ToolStatus
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ToolListResponse(BaseModel):
    items: list[ToolResponse]
    total: int


class AgentToolPermissionCreate(BaseModel):
    tool_id: uuid.UUID


class AgentToolPermissionResponse(BaseModel):
    id: uuid.UUID
    agent_id: uuid.UUID
    tool_id: uuid.UUID
    allowed: bool
    created_by: uuid.UUID
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
