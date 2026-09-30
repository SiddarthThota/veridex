"""Database engine and session management."""

from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.common.config import get_settings

settings = get_settings()

import sys

from sqlalchemy.pool import NullPool

pool_kwargs = {}
if "pytest" in sys.modules:
    pool_kwargs["poolclass"] = NullPool
else:
    pool_kwargs["pool_size"] = settings.database_pool_size
    pool_kwargs["max_overflow"] = settings.database_max_overflow

engine = create_async_engine(
    settings.database_url,
    echo=settings.database_echo,
    pool_pre_ping=True,
    **pool_kwargs
)

async_session_factory = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """Dependency that provides an async database session."""
    async with async_session_factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()
