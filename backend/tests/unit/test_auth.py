"""Unit tests for authentication and security."""

from datetime import timedelta

from app.auth.security import (
    create_access_token,
    create_refresh_token,
    get_password_hash,
    verify_password,
)


def test_password_hashing() -> None:
    """Test that password hashing works and verification succeeds."""
    password = "SuperSecretPassword123!"  # noqa: S105
    hashed = get_password_hash(password)

    assert hashed != password
    assert verify_password(password, hashed)
    assert not verify_password("WrongPassword123!", hashed)


def test_access_token() -> None:
    """Test access token generation."""
    subject = "user-123"
    token = create_access_token(subject)
    assert isinstance(token, str)
    assert len(token) > 0


def test_refresh_token() -> None:
    """Test refresh token generation."""
    subject = "user-123"
    token = create_refresh_token(subject, expires_delta=timedelta(days=1))
    assert isinstance(token, str)
    assert len(token) > 0
