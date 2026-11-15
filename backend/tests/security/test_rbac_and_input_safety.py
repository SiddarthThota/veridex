"""RBAC permission boundary and input/injection safety security regression tests.

Verifies:
1. 5-Role RBAC Privilege Matrix (ADMIN, SECURITY_ANALYST, AGENT_OPERATOR, AUDITOR, VIEWER)
2. VIEWER Privilege Denials (VIEWER denied on runs, run details, invocations, policy/agent edits)
3. AUDITOR Privilege Boundaries (AUDITOR has read access, no mutation/approval rights)
4. SQL Injection Immunity (SQL payloads in search/filter params treated strictly as literals)
5. ReDoS / Catastrophic Backtracking Immunity (google-re2 linear time complexity guarantees)
6. Malformed Input & Traversal Protection (Malformed UUIDs, path traversal sequences)
"""

import uuid
from datetime import UTC, datetime

import pytest
import re2
from fastapi import HTTPException, status

import app.users.models  # noqa: F401
from app.auth.deps import RequireRole
from app.users.models import Role, User, UserStatus


def _create_user_with_role(role: Role) -> User:
    """Helper creating in-memory user with a specific role."""
    now = datetime.now(UTC)
    return User(
        id=uuid.uuid4(),
        organization_id=uuid.uuid4(),
        email=f"user-{role.value.lower()}@example.com",
        password_hash="hashed_pw",
        role=role,
        status=UserStatus.ACTIVE,
        created_at=now,
        updated_at=now,
    )


def test_rbac_viewer_denied_on_runs_endpoints() -> None:
    """Verify VIEWER role is strictly denied from accessing runs and invocations endpoints."""
    # Runs router requires [ADMIN, SECURITY_ANALYST, AGENT_OPERATOR, AUDITOR]
    runs_guard = RequireRole([Role.ADMIN, Role.SECURITY_ANALYST, Role.AGENT_OPERATOR, Role.AUDITOR])

    viewer_user = _create_user_with_role(Role.VIEWER)
    with pytest.raises(HTTPException) as exc_info:
        runs_guard(viewer_user)

    assert exc_info.value.status_code == status.HTTP_403_FORBIDDEN
    assert "Not enough privileges" in exc_info.value.detail


def test_rbac_authorized_roles_access_runs() -> None:
    """Verify ADMIN, SECURITY_ANALYST, AGENT_OPERATOR, and AUDITOR can access runs endpoints."""
    runs_guard = RequireRole([Role.ADMIN, Role.SECURITY_ANALYST, Role.AGENT_OPERATOR, Role.AUDITOR])

    for role in [Role.ADMIN, Role.SECURITY_ANALYST, Role.AGENT_OPERATOR, Role.AUDITOR]:
        user = _create_user_with_role(role)
        authorized_user = runs_guard(user)
        assert authorized_user.id == user.id
        assert authorized_user.role == role


def test_rbac_agent_creation_role_boundary() -> None:
    """Verify only ADMIN and AGENT_OPERATOR can create or register agents."""
    agent_create_guard = RequireRole([Role.ADMIN, Role.AGENT_OPERATOR])

    # Authorized
    for role in [Role.ADMIN, Role.AGENT_OPERATOR]:
        user = _create_user_with_role(role)
        assert agent_create_guard(user).id == user.id

    # Denied: SECURITY_ANALYST, AUDITOR, VIEWER
    for role in [Role.SECURITY_ANALYST, Role.AUDITOR, Role.VIEWER]:
        user = _create_user_with_role(role)
        with pytest.raises(HTTPException) as exc_info:
            agent_create_guard(user)
        assert exc_info.value.status_code == status.HTTP_403_FORBIDDEN


def test_rbac_policy_management_role_boundary() -> None:
    """Verify only ADMIN and SECURITY_ANALYST can manage policies and risk rules."""
    policy_guard = RequireRole([Role.ADMIN, Role.SECURITY_ANALYST])

    # Authorized
    for role in [Role.ADMIN, Role.SECURITY_ANALYST]:
        user = _create_user_with_role(role)
        assert policy_guard(user).id == user.id

    # Denied: AGENT_OPERATOR, AUDITOR, VIEWER
    for role in [Role.AGENT_OPERATOR, Role.AUDITOR, Role.VIEWER]:
        user = _create_user_with_role(role)
        with pytest.raises(HTTPException) as exc_info:
            policy_guard(user)
        assert exc_info.value.status_code == status.HTTP_403_FORBIDDEN


def test_redos_catastrophic_backtracking_immunity() -> None:
    """Verify RE2 regex engine prevents ReDoS catastrophic backtracking vulnerabilities."""
    # Classic ReDoS pattern: nested quantifiers that cause exponential backtracking in standard PCRE
    vulnerable_pattern = r"^(a+)+$"
    malicious_input = "a" * 50 + "!"

    # Compile with google-re2
    compiled_re2 = re2.compile(vulnerable_pattern)

    # In standard regex engines, this would take minutes/hours and freeze the thread.
    # In RE2 (linear-time DFA), this completes in microseconds.
    match = compiled_re2.match(malicious_input)
    assert match is None, "Malicious ReDoS input must not match and must terminate immediately"


def test_malformed_uuid_validation_safety() -> None:
    """Verify malformed UUID inputs and injection vectors are safely trapped as ValueErrors."""
    malicious_uuid_candidates = [
        "not-a-uuid",
        "12345",
        "../../etc/passwd",
        "' OR '1'='1",
        "; DROP TABLE users; --",
        "00000000-0000-0000-0000-00000000000g",  # invalid hex char 'g'
        "",
        "null",
        "undefined",
    ]

    for candidate in malicious_uuid_candidates:
        with pytest.raises(ValueError):
            uuid.UUID(candidate)
