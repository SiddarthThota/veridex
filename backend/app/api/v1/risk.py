"""Risk Engine REST API endpoints for Veridex (Phase 7.4)."""

import uuid
from datetime import datetime
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import RequireRole, get_current_user
from app.database.session import get_db
from app.risk.models import RiskLevel
from app.risk.schemas import (
    AgentRiskProfileResponse,
    RiskAssessmentListResponse,
    RiskAssessmentResponse,
    RiskConfigurationResponse,
    RiskConfigurationVersionCreate,
    RiskConfigurationVersionResponse,
    RiskSimulateRequest,
    RiskSimulateResponse,
)
from app.risk.service import risk_service
from app.users.models import Role, User

router = APIRouter(prefix="/risk", tags=["risk"])

RISK_READ_ROLES = [
    Role.ADMIN,
    Role.SECURITY_ANALYST,
    Role.AGENT_OPERATOR,
    Role.AUDITOR,
    Role.VIEWER,
]
RISK_WRITE_ROLES = [
    Role.ADMIN,
    Role.SECURITY_ANALYST,
]


@router.post(
    "/evaluate",
    response_model=RiskSimulateResponse,
    dependencies=[Depends(RequireRole(RISK_READ_ROLES))],
)
async def simulate_risk_evaluation(
    payload: RiskSimulateRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> Any:
    """Execute dry-run risk evaluation simulation without persisting records."""
    try:
        response = await risk_service.simulate_risk(
            db=db,
            organization_id=uuid.UUID(str(current_user.organization_id)),
            payload=payload,
        )
        return response
    except ValueError as exc:
        msg = str(exc)
        if "not found" in msg.lower():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=msg,
            ) from exc
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=msg,
        ) from exc


@router.get(
    "/assessments",
    response_model=RiskAssessmentListResponse,
    dependencies=[Depends(RequireRole(RISK_READ_ROLES))],
)
async def list_assessments(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
    agent_id: Annotated[uuid.UUID | None, Query()] = None,
    tool_id: Annotated[uuid.UUID | None, Query()] = None,
    risk_level: Annotated[RiskLevel | None, Query()] = None,
    start_date: Annotated[datetime | None, Query()] = None,
    end_date: Annotated[datetime | None, Query()] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> Any:
    """List historical risk assessments with filtering and pagination."""
    items, total = await risk_service.list_assessments(
        db=db,
        organization_id=uuid.UUID(str(current_user.organization_id)),
        agent_id=agent_id,
        tool_id=tool_id,
        risk_level=risk_level,
        start_date=start_date,
        end_date=end_date,
        limit=limit,
        offset=offset,
    )
    return RiskAssessmentListResponse(
        items=[RiskAssessmentResponse.model_validate(item) for item in items],
        total=total,
    )


@router.get(
    "/assessments/{assessment_id}",
    response_model=RiskAssessmentResponse,
    dependencies=[Depends(RequireRole(RISK_READ_ROLES))],
)
async def get_assessment(
    assessment_id: uuid.UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> Any:
    """Retrieve an immutable historical risk assessment record by ID."""
    assessment = await risk_service.get_assessment(
        db=db,
        organization_id=uuid.UUID(str(current_user.organization_id)),
        assessment_id=assessment_id,
    )
    if not assessment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Risk assessment '{assessment_id}' not found",
        )
    return assessment


@router.get(
    "/profiles/agents/{agent_id}",
    response_model=AgentRiskProfileResponse,
    dependencies=[Depends(RequireRole(RISK_READ_ROLES))],
)
async def get_agent_profile(
    agent_id: uuid.UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> Any:
    """Retrieve the empirical risk profile and trust metrics for an agent."""
    try:
        profile = await risk_service.get_agent_profile_details(
            db=db,
            organization_id=uuid.UUID(str(current_user.organization_id)),
            agent_id=agent_id,
        )
        return profile
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc


@router.get(
    "/config",
    response_model=RiskConfigurationResponse,
    dependencies=[Depends(RequireRole(RISK_READ_ROLES))],
)
async def get_active_configuration(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> Any:
    """Retrieve the active risk configuration and version for the organization."""
    config = await risk_service.get_active_configuration(
        db=db,
        organization_id=uuid.UUID(str(current_user.organization_id)),
    )
    return config


@router.post(
    "/config/versions",
    response_model=RiskConfigurationVersionResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(RequireRole(RISK_WRITE_ROLES))],
)
async def create_configuration_version(
    payload: RiskConfigurationVersionCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> Any:
    """Publish a new immutable risk configuration version for the organization."""
    try:
        version = await risk_service.create_configuration_version(
            db=db,
            organization_id=uuid.UUID(str(current_user.organization_id)),
            user_id=current_user.id,
            payload=payload,
        )
        return version
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=str(exc),
        ) from exc
