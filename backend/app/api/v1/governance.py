"""Governance and Approvals API endpoints."""

import uuid
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import RequireRole, get_current_user
from app.database.session import get_db
from app.governance.models import ApprovalStatus
from app.governance.schemas import (
    ApprovalDecisionRequest,
    ApprovalRequestListResponse,
    ApprovalRequestResponse,
    GovernanceEvaluateRequest,
    GovernanceEvaluateResponse,
)
from app.governance.service import governance_service
from app.users.models import Role, User

router = APIRouter()


@router.post(
    "/evaluate",
    response_model=GovernanceEvaluateResponse,
    dependencies=[Depends(RequireRole([Role.ADMIN, Role.AGENT_OPERATOR, Role.SECURITY_ANALYST]))],
)
async def evaluate_governance(
    payload: GovernanceEvaluateRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> Any:
    """Perform a dry-run governance policy evaluation.

    Complies with Dry-Run Safety:
    - Never executes a tool.
    - Does not create executable ToolExecution or persistent ToolRequest records.
    - Returns deterministic decision, violation codes, and argument integrity hash.
    """
    response = await governance_service.evaluate(
        db=db,
        organization_id=uuid.UUID(str(current_user.organization_id)),
        request=payload,
    )
    return response


@router.get(
    "/approvals",
    response_model=ApprovalRequestListResponse,
    dependencies=[Depends(RequireRole([Role.ADMIN, Role.SECURITY_ANALYST, Role.AGENT_OPERATOR, Role.AUDITOR]))],
)
async def list_approvals(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
    status_filter: Annotated[ApprovalStatus | None, Query(alias="status")] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> Any:
    """List approval requests for the organization."""
    items, total = await governance_service.list_approvals(
        db=db,
        organization_id=uuid.UUID(str(current_user.organization_id)),
        status=status_filter,
        limit=limit,
        offset=offset,
    )
    return ApprovalRequestListResponse(
        items=[ApprovalRequestResponse.model_validate(item) for item in items],
        total=total,
    )


@router.get(
    "/approvals/{approval_id}",
    response_model=ApprovalRequestResponse,
    dependencies=[Depends(RequireRole([Role.ADMIN, Role.SECURITY_ANALYST, Role.AGENT_OPERATOR, Role.AUDITOR]))],
)
async def get_approval(
    approval_id: uuid.UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> Any:
    """Retrieve details of a specific approval request."""
    approval = await governance_service.get_approval(
        db=db,
        organization_id=uuid.UUID(str(current_user.organization_id)),
        approval_id=approval_id,
    )
    if not approval:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"ApprovalRequest '{approval_id}' not found",
        )
    return approval


@router.post(
    "/approvals/{approval_id}/decide",
    response_model=ApprovalRequestResponse,
    dependencies=[Depends(RequireRole([Role.ADMIN, Role.SECURITY_ANALYST]))],
)
async def decide_approval(
    approval_id: uuid.UUID,
    payload: ApprovalDecisionRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> Any:
    """Submit an approval or rejection decision for a pending request.

    Enforces:
    - Only ADMIN or SECURITY_ANALYST may decide.
    - Prevents replay or duplicate processing.
    - Re-validates arguments hash and current entity statuses before execution.
    """
    try:
        approval = await governance_service.decide_approval(
            db=db,
            organization_id=uuid.UUID(str(current_user.organization_id)),
            approval_id=approval_id,
            approver_user_id=current_user.id,
            decision=payload.decision,
            reason=payload.reason,
        )
        return approval
    except ValueError as exc:
        msg = str(exc)
        if "not found" in msg.lower():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=msg,
            ) from exc
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=msg,
        ) from exc
