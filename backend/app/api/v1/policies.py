"""Policies API endpoints for Veridex Policy Engine (Phase 6)."""

import uuid
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import RequireRole, get_current_user
from app.database.session import get_db
from app.policies.models import PolicyStatus, PolicyType
from app.policies.schemas import (
    PolicyCreate,
    PolicyListResponse,
    PolicyResponse,
    PolicyRuleCreate,
    PolicyRuleResponse,
    PolicyRuleUpdate,
    PolicySimulateRequest,
    PolicySimulateResponse,
    PolicyStatusUpdate,
    PolicyUpdate,
    PolicyVersionCreate,
    PolicyVersionResponse,
)
from app.policies.service import policy_service
from app.users.models import Role, User

router = APIRouter(prefix="/policies", tags=["policies"])

POLICY_READ_ROLES = [Role.ADMIN, Role.SECURITY_ANALYST, Role.AGENT_OPERATOR, Role.AUDITOR, Role.VIEWER]
POLICY_WRITE_ROLES = [Role.ADMIN, Role.SECURITY_ANALYST]


@router.post(
    "",
    response_model=PolicyResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(RequireRole(POLICY_WRITE_ROLES))],
)
async def create_policy(
    payload: PolicyCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> Any:
    """Create a new policy container with an initial DRAFT v1 version."""
    try:
        policy = await policy_service.create_policy(
            db=db,
            organization_id=uuid.UUID(str(current_user.organization_id)),
            user_id=current_user.id,
            payload=payload,
        )
        return policy
    except ValueError as exc:
        msg = str(exc)
        if "already exists" in msg.lower():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=msg,
            ) from exc
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=msg,
        ) from exc


@router.get(
    "",
    response_model=PolicyListResponse,
    dependencies=[Depends(RequireRole(POLICY_READ_ROLES))],
)
async def list_policies(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
    policy_type: Annotated[PolicyType | None, Query(alias="type")] = None,
    policy_status: Annotated[PolicyStatus | None, Query(alias="status")] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> Any:
    """List policies for the organization with pagination and filters."""
    items, total = await policy_service.list_policies(
        db=db,
        organization_id=uuid.UUID(str(current_user.organization_id)),
        policy_type=policy_type,
        status=policy_status,
        limit=limit,
        offset=offset,
    )
    return PolicyListResponse(
        items=[PolicyResponse.model_validate(p) for p in items],
        total=total,
    )


@router.get(
    "/{policy_id}",
    response_model=PolicyResponse,
    dependencies=[Depends(RequireRole(POLICY_READ_ROLES))],
)
async def get_policy(
    policy_id: uuid.UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> Any:
    """Retrieve policy details including its active version and rules."""
    policy = await policy_service.get_policy(
        db=db,
        organization_id=uuid.UUID(str(current_user.organization_id)),
        policy_id=policy_id,
    )
    if not policy:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Policy '{policy_id}' not found",
        )
    return policy


@router.put(
    "/{policy_id}",
    response_model=PolicyResponse,
    dependencies=[Depends(RequireRole(POLICY_WRITE_ROLES))],
)
@router.patch(
    "/{policy_id}",
    response_model=PolicyResponse,
    dependencies=[Depends(RequireRole(POLICY_WRITE_ROLES))],
)
async def update_policy(
    policy_id: uuid.UUID,
    payload: PolicyUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> Any:
    """Update metadata and priority of a policy container."""
    try:
        policy = await policy_service.update_policy(
            db=db,
            organization_id=uuid.UUID(str(current_user.organization_id)),
            policy_id=policy_id,
            payload=payload,
        )
        if not policy:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Policy '{policy_id}' not found",
            )
        return policy
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc


@router.patch(
    "/{policy_id}/status",
    response_model=PolicyResponse,
    dependencies=[Depends(RequireRole(POLICY_WRITE_ROLES))],
)
async def update_policy_status(
    policy_id: uuid.UUID,
    payload: PolicyStatusUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> Any:
    """Transition lifecycle status of a policy container."""
    try:
        policy = await policy_service.update_policy_status(
            db=db,
            organization_id=uuid.UUID(str(current_user.organization_id)),
            policy_id=policy_id,
            new_status=payload.status,
        )
        if not policy:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Policy '{policy_id}' not found",
            )
        return policy
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc


@router.delete(
    "/{policy_id}",
    response_model=PolicyResponse,
    dependencies=[Depends(RequireRole(POLICY_WRITE_ROLES))],
)
async def delete_policy(
    policy_id: uuid.UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> Any:
    """Archive a policy container (soft-retire for audit preservation)."""
    try:
        policy = await policy_service.update_policy_status(
            db=db,
            organization_id=uuid.UUID(str(current_user.organization_id)),
            policy_id=policy_id,
            new_status=PolicyStatus.ARCHIVED,
        )
        if not policy:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Policy '{policy_id}' not found",
            )
        return policy
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc


# --- Versioning Endpoints ---


@router.post(
    "/{policy_id}/versions",
    response_model=PolicyVersionResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(RequireRole(POLICY_WRITE_ROLES))],
)
async def create_policy_version(
    policy_id: uuid.UUID,
    payload: PolicyVersionCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> Any:
    """Branch a new DRAFT version from current policy rules."""
    try:
        version = await policy_service.create_policy_version(
            db=db,
            organization_id=uuid.UUID(str(current_user.organization_id)),
            policy_id=policy_id,
            user_id=current_user.id,
            changelog=payload.changelog,
        )
        return version
    except ValueError as exc:
        msg = str(exc)
        if "not found" in msg.lower():
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=msg) from exc
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=msg) from exc


@router.get(
    "/{policy_id}/versions",
    response_model=list[PolicyVersionResponse],
    dependencies=[Depends(RequireRole(POLICY_READ_ROLES))],
)
async def list_policy_versions(
    policy_id: uuid.UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> Any:
    """List all historical versions of a policy."""
    try:
        versions = await policy_service.list_policy_versions(
            db=db,
            organization_id=uuid.UUID(str(current_user.organization_id)),
            policy_id=policy_id,
        )
        return versions
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.get(
    "/{policy_id}/versions/{version_id}",
    response_model=PolicyVersionResponse,
    dependencies=[Depends(RequireRole(POLICY_READ_ROLES))],
)
async def get_policy_version(
    policy_id: uuid.UUID,
    version_id: uuid.UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> Any:
    """Inspect an immutable PolicyVersion and its rules."""
    version = await policy_service.get_policy_version(
        db=db,
        organization_id=uuid.UUID(str(current_user.organization_id)),
        policy_id=policy_id,
        version_id=version_id,
    )
    if not version:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"PolicyVersion '{version_id}' not found",
        )
    return version


@router.post(
    "/{policy_id}/versions/{version_id}/publish",
    response_model=PolicyVersionResponse,
    dependencies=[Depends(RequireRole(POLICY_WRITE_ROLES))],
)
async def publish_policy_version(
    policy_id: uuid.UUID,
    version_id: uuid.UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> Any:
    """Freeze a DRAFT version as PUBLISHED and atomically activate it on the parent policy."""
    try:
        version = await policy_service.publish_policy_version(
            db=db,
            organization_id=uuid.UUID(str(current_user.organization_id)),
            policy_id=policy_id,
            version_id=version_id,
            user_id=current_user.id,
        )
        return version
    except ValueError as exc:
        msg = str(exc)
        if "not found" in msg.lower():
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=msg) from exc
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=msg) from exc


# --- Rule Endpoints (Allowed ONLY on DRAFT Versions) ---


@router.post(
    "/{policy_id}/versions/{version_id}/rules",
    response_model=PolicyRuleResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(RequireRole(POLICY_WRITE_ROLES))],
)
async def create_policy_rule(
    policy_id: uuid.UUID,
    version_id: uuid.UUID,
    payload: PolicyRuleCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> Any:
    """Add a rule to a DRAFT policy version. Fails with 409 if version is PUBLISHED."""
    try:
        rule = await policy_service.create_policy_rule(
            db=db,
            organization_id=uuid.UUID(str(current_user.organization_id)),
            policy_id=policy_id,
            version_id=version_id,
            payload=payload,
        )
        return rule
    except ValueError as exc:
        msg = str(exc)
        if "immutable" in msg.lower():
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=msg) from exc
        if "not found" in msg.lower():
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=msg) from exc
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=msg) from exc


@router.put(
    "/{policy_id}/versions/{version_id}/rules/{rule_id}",
    response_model=PolicyRuleResponse,
    dependencies=[Depends(RequireRole(POLICY_WRITE_ROLES))],
)
@router.patch(
    "/{policy_id}/versions/{version_id}/rules/{rule_id}",
    response_model=PolicyRuleResponse,
    dependencies=[Depends(RequireRole(POLICY_WRITE_ROLES))],
)
async def update_policy_rule(
    policy_id: uuid.UUID,
    version_id: uuid.UUID,
    rule_id: uuid.UUID,
    payload: PolicyRuleUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> Any:
    """Update a rule in a DRAFT version. Fails with 409 if version is PUBLISHED."""
    try:
        rule = await policy_service.update_policy_rule(
            db=db,
            organization_id=uuid.UUID(str(current_user.organization_id)),
            policy_id=policy_id,
            version_id=version_id,
            rule_id=rule_id,
            payload=payload,
        )
        return rule
    except ValueError as exc:
        msg = str(exc)
        if "immutable" in msg.lower():
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=msg) from exc
        if "not found" in msg.lower():
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=msg) from exc
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=msg) from exc


@router.delete(
    "/{policy_id}/versions/{version_id}/rules/{rule_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(RequireRole(POLICY_WRITE_ROLES))],
)
async def delete_policy_rule(
    policy_id: uuid.UUID,
    version_id: uuid.UUID,
    rule_id: uuid.UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> None:
    """Delete a rule from a DRAFT version. Fails with 409 if version is PUBLISHED."""
    try:
        await policy_service.delete_policy_rule(
            db=db,
            organization_id=uuid.UUID(str(current_user.organization_id)),
            policy_id=policy_id,
            version_id=version_id,
            rule_id=rule_id,
        )
    except ValueError as exc:
        msg = str(exc)
        if "immutable" in msg.lower():
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=msg) from exc
        if "not found" in msg.lower():
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=msg) from exc
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=msg) from exc


# --- Simulation Endpoint ---


@router.post(
    "/simulate",
    response_model=PolicySimulateResponse,
    dependencies=[Depends(RequireRole([Role.ADMIN, Role.SECURITY_ANALYST, Role.AUDITOR, Role.AGENT_OPERATOR]))],
)
async def simulate_policies(
    payload: PolicySimulateRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> Any:
    """Dry-run simulate policy evaluation against hypothetical input without side effects."""
    try:
        result = await policy_service.simulate(
            db=db,
            organization_id=uuid.UUID(str(current_user.organization_id)),
            request=payload,
        )
        return result
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc
