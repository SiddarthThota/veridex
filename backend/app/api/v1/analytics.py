"""Analytics REST API endpoints for Veridex Governance Analytics Engine (Phase 8.4)."""

import uuid
from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.analytics.exceptions import (
    InvalidGranularityError,
    InvalidPaginationError,
    InvalidTimeRangeError,
)
from app.analytics.schemas import (
    AgentAnalyticsResponse,
    AnomalyReport,
    Granularity,
    OverviewAnalytics,
    RiskDistributionAnalytics,
    ToolUtilizationResponse,
    TrendsAnalytics,
)
from app.analytics.service import AnalyticsService
from app.auth.deps import RequireRole
from app.database.session import get_db
from app.users.models import Role, User

router = APIRouter(prefix="/analytics", tags=["analytics"])

ANALYTICS_ROLES = [
    Role.ADMIN,
    Role.SECURITY_ANALYST,
    Role.AUDITOR,
]


def check_no_tenant_override(request: Request) -> None:
    """Ensure client cannot supply an untrusted organization_id query parameter."""
    if "organization_id" in request.query_params:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Custom organization_id parameter is prohibited; tenant scope is enforced via authentication token",
        )


def get_analytics_service(
    db: Annotated[AsyncSession, Depends(get_db)],
) -> AnalyticsService:
    """Dependency injection providing the AnalyticsService instance."""
    return AnalyticsService(session=db)


@router.get(
    "/overview",
    response_model=OverviewAnalytics,
    dependencies=[Depends(check_no_tenant_override)],
)
async def get_overview(
    current_user: Annotated[User, Depends(RequireRole(ANALYTICS_ROLES))],
    service: Annotated[AnalyticsService, Depends(get_analytics_service)],
    start_time: Annotated[
        datetime | None,
        Query(description="Interval start time in UTC [start_time, end_time)"),
    ] = None,
    end_time: Annotated[
        datetime | None,
        Query(description="Interval end time in UTC [start_time, end_time)"),
    ] = None,
) -> OverviewAnalytics:
    """Retrieve high-level volumetric counts, decision rates, and approval resolution statistics."""
    try:
        return await service.get_overview(
            organization_id=uuid.UUID(str(current_user.organization_id)),
            start_time=start_time,
            end_time=end_time,
        )
    except (InvalidTimeRangeError, InvalidGranularityError, InvalidPaginationError) as err:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(err)) from err


@router.get(
    "/trends",
    response_model=TrendsAnalytics,
    dependencies=[Depends(check_no_tenant_override)],
)
async def get_trends(
    current_user: Annotated[User, Depends(RequireRole(ANALYTICS_ROLES))],
    service: Annotated[AnalyticsService, Depends(get_analytics_service)],
    start_time: Annotated[
        datetime | None,
        Query(description="Interval start time in UTC"),
    ] = None,
    end_time: Annotated[
        datetime | None,
        Query(description="Interval end time in UTC"),
    ] = None,
    granularity: Annotated[
        Granularity,
        Query(description="Time-series aggregation granularity: 'hour' or 'day'"),
    ] = Granularity.DAY,
) -> TrendsAnalytics:
    """Retrieve time-series trend aggregations for governance invocations, executions, and risks."""
    try:
        return await service.get_trends(
            organization_id=uuid.UUID(str(current_user.organization_id)),
            start_time=start_time,
            end_time=end_time,
            granularity=granularity,
        )
    except (InvalidTimeRangeError, InvalidGranularityError, InvalidPaginationError) as err:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(err)) from err


@router.get(
    "/risk-distribution",
    response_model=RiskDistributionAnalytics,
    dependencies=[Depends(check_no_tenant_override)],
)
async def get_risk_distribution(
    current_user: Annotated[User, Depends(RequireRole(ANALYTICS_ROLES))],
    service: Annotated[AnalyticsService, Depends(get_analytics_service)],
    start_time: Annotated[
        datetime | None,
        Query(description="Interval start time in UTC"),
    ] = None,
    end_time: Annotated[
        datetime | None,
        Query(description="Interval end time in UTC"),
    ] = None,
) -> RiskDistributionAnalytics:
    """Retrieve quantitative risk score statistics and standard 10-bucket histogram."""
    try:
        return await service.get_risk_distribution(
            organization_id=uuid.UUID(str(current_user.organization_id)),
            start_time=start_time,
            end_time=end_time,
        )
    except (InvalidTimeRangeError, InvalidGranularityError, InvalidPaginationError) as err:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(err)) from err


@router.get(
    "/agents",
    response_model=AgentAnalyticsResponse,
    dependencies=[Depends(check_no_tenant_override)],
)
async def get_agent_analytics(
    current_user: Annotated[User, Depends(RequireRole(ANALYTICS_ROLES))],
    service: Annotated[AnalyticsService, Depends(get_analytics_service)],
    start_time: Annotated[
        datetime | None,
        Query(description="Interval start time in UTC"),
    ] = None,
    end_time: Annotated[
        datetime | None,
        Query(description="Interval end time in UTC"),
    ] = None,
    page: Annotated[int, Query(ge=1, description="Page number (1-based)")] = 1,
    page_size: Annotated[int, Query(ge=1, le=100, description="Items per page (1-100)")] = 20,
) -> AgentAnalyticsResponse:
    """Retrieve paginated agent activity, historical denial rates, and risk metrics."""
    try:
        return await service.get_agent_analytics(
            organization_id=uuid.UUID(str(current_user.organization_id)),
            start_time=start_time,
            end_time=end_time,
            page=page,
            page_size=page_size,
        )
    except (InvalidTimeRangeError, InvalidGranularityError, InvalidPaginationError) as err:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(err)) from err


@router.get(
    "/tools",
    response_model=ToolUtilizationResponse,
    dependencies=[Depends(check_no_tenant_override)],
)
async def get_tool_analytics(
    current_user: Annotated[User, Depends(RequireRole(ANALYTICS_ROLES))],
    service: Annotated[AnalyticsService, Depends(get_analytics_service)],
    start_time: Annotated[
        datetime | None,
        Query(description="Interval start time in UTC"),
    ] = None,
    end_time: Annotated[
        datetime | None,
        Query(description="Interval end time in UTC"),
    ] = None,
    page: Annotated[int, Query(ge=1, description="Page number (1-based)")] = 1,
    page_size: Annotated[int, Query(ge=1, le=100, description="Items per page (1-100)")] = 20,
) -> ToolUtilizationResponse:
    """Retrieve paginated tool invocation frequency, execution success rates, and latencies."""
    try:
        return await service.get_tool_analytics(
            organization_id=uuid.UUID(str(current_user.organization_id)),
            start_time=start_time,
            end_time=end_time,
            page=page,
            page_size=page_size,
        )
    except (InvalidTimeRangeError, InvalidGranularityError, InvalidPaginationError) as err:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(err)) from err


@router.get(
    "/anomalies",
    response_model=AnomalyReport,
    dependencies=[Depends(check_no_tenant_override)],
)
async def detect_anomalies(
    current_user: Annotated[User, Depends(RequireRole(ANALYTICS_ROLES))],
    service: Annotated[AnalyticsService, Depends(get_analytics_service)],
    evaluation_time: Annotated[
        datetime | None,
        Query(description="Optional evaluation reference timestamp in UTC"),
    ] = None,
) -> AnomalyReport:
    """Execute read-only anomaly detection rules across current and baseline sliding windows."""
    try:
        return await service.detect_anomalies(
            organization_id=uuid.UUID(str(current_user.organization_id)),
            evaluation_time=evaluation_time,
        )
    except (InvalidTimeRangeError, InvalidGranularityError, InvalidPaginationError) as err:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(err)) from err
