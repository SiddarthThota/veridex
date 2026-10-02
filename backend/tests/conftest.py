"""Test configuration and fixtures."""

import asyncio
import sys
from collections.abc import AsyncGenerator

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.main import app


@pytest.fixture(scope="session", autouse=True)
def setup_event_loop_policy() -> None:
    """Ensure Windows uses the correct event loop policy to avoid teardown hangs."""
    if sys.platform == "win32":
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())


@pytest.fixture(scope="session")
def event_loop():
    """Force session scope event loop to avoid AsyncEngine disposal errors."""
    if sys.platform == "win32":
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    policy = asyncio.get_event_loop_policy()
    loop = policy.new_event_loop()
    yield loop
    loop.close()


@pytest.fixture(scope="session", autouse=True)
async def cleanup_database() -> AsyncGenerator[None, None]:
    """Clean up the database engine after tests to avoid unawaited connection warnings."""
    yield
    from app.database.session import engine

    await engine.dispose()


@pytest.fixture
async def client() -> AsyncGenerator[AsyncClient, None]:
    """Async test client for the FastAPI application."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest.fixture
async def db_session() -> AsyncGenerator[AsyncSession, None]:
    """Database session fixture."""
    from app.database.session import async_session_factory

    async with async_session_factory() as session:
        yield session
