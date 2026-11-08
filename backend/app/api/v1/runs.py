"""Agent Runs and Tool Invocations API endpoints."""

import uuid
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import RequireRole, get_current_user
from app.database.session import get_db
from app.governance.models import RunStatus
from app.governance.schemas import (
    AgentRunCreate,
    AgentRunListResponse,
    AgentRunResponse,
    AgentRunStatusUpdate,
    ToolInvocationRequest,
    ToolInvocationResponse,
    ToolRequestListResponse,
    ToolRequestResponse,
)
from app.governance.service import governance_service
from app.users.models import Role, User

router = APIRouter()


@router.post(
    "",
    response_model=AgentRunResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(RequireRole([Role.ADMIN, Role.AGENT_OPERATOR]))],
)
async def create_run(
    payload: AgentRunCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> Any:
    """Create a new agent run."""
    try:
        run = await governance_service.create_agent_run(
            db=db,
            organization_id=uuid.UUID(str(current_user.organization_id)),
            user_id=current_user.id,
            payload=payload,
        )
        return run
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc


@router.get(
    "",
    response_model=AgentRunListResponse,
    dependencies=[Depends(RequireRole([Role.ADMIN, Role.SECURITY_ANALYST, Role.AGENT_OPERATOR, Role.AUDITOR]))],
)
async def list_runs(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
    agent_id: Annotated[uuid.UUID | None, Query()] = None,
    status: Annotated[RunStatus | None, Query()] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> Any:
    """List agent runs for the organization with pagination and filters."""
    items, total = await governance_service.list_agent_runs(
        db=db,
        organization_id=uuid.UUID(str(current_user.organization_id)),
        agent_id=agent_id,
        status=status,
        limit=limit,
        offset=offset,
    )
    return AgentRunListResponse(
        items=[AgentRunResponse.model_validate(r) for r in items],
        total=total,
    )


@router.get(
    "/{run_id}",
    response_model=AgentRunResponse,
    dependencies=[Depends(RequireRole([Role.ADMIN, Role.SECURITY_ANALYST, Role.AGENT_OPERATOR, Role.AUDITOR]))],
)
async def get_run(
    run_id: uuid.UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> Any:
    """Retrieve an agent run by ID."""
    run = await governance_service.get_agent_run(
        db=db,
        organization_id=uuid.UUID(str(current_user.organization_id)),
        run_id=run_id,
    )
    if not run:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"AgentRun '{run_id}' not found",
        )
    return run


@router.patch(
    "/{run_id}/status",
    response_model=AgentRunResponse,
    dependencies=[Depends(RequireRole([Role.ADMIN, Role.AGENT_OPERATOR]))],
)
async def update_run_status(
    run_id: uuid.UUID,
    payload: AgentRunStatusUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> Any:
    """Update status of an active agent run."""
    run = await governance_service.update_agent_run_status(
        db=db,
        organization_id=uuid.UUID(str(current_user.organization_id)),
        run_id=run_id,
        new_status=payload.status,
        output_summary=payload.output_summary,
        error_message=payload.error_message,
    )
    if not run:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"AgentRun '{run_id}' not found",
        )
    return run


@router.post(
    "/{run_id}/invocations",
    response_model=ToolInvocationResponse,
    dependencies=[Depends(RequireRole([Role.ADMIN, Role.AGENT_OPERATOR]))],
)
async def invoke_tool(
    run_id: uuid.UUID,
    payload: ToolInvocationRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> Any:
    """Invoke a tool through the Governance Gateway."""
    try:
        response = await governance_service.invoke_tool(
            db=db,
            organization_id=uuid.UUID(str(current_user.organization_id)),
            run_id=run_id,
            request=payload,
        )
        return response
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc


@router.get(
    "/{run_id}/invocations",
    response_model=ToolRequestListResponse,
    dependencies=[Depends(RequireRole([Role.ADMIN, Role.SECURITY_ANALYST, Role.AGENT_OPERATOR, Role.AUDITOR]))],
)
async def list_run_invocations(
    run_id: uuid.UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> Any:
    """List tool invocations and execution history for an agent run."""
    try:
        items, total = await governance_service.list_run_invocations(
            db=db,
            organization_id=uuid.UUID(str(current_user.organization_id)),
            run_id=run_id,
            limit=limit,
            offset=offset,
        )
        return ToolRequestListResponse(
            items=[ToolRequestResponse.model_validate(req) for req in items],
            total=total,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc
