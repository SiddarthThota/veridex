"""Veridex FastAPI application factory."""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.router import api_v1_router
from app.common.config import get_settings
from app.common.logging import get_logger, setup_logging


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Application lifespan handler for startup/shutdown."""
    settings = get_settings()
    logger = get_logger("veridex.lifespan")

    # Production startup security safeguards (SEC-05)
    if settings.environment == "production":
        if settings.debug:
            raise RuntimeError(
                "CRITICAL SECURITY VIOLATION: debug mode must NOT be enabled in production environment"
            )
        known_insecure_keys = {
            "CHANGE-ME-IN-PRODUCTION-USE-A-REAL-SECRET-KEY",
            "dev-secret-key-change-in-production",
            "test-secret-key",
            "secret",
        }
        if settings.secret_key in known_insecure_keys or len(settings.secret_key) < 32:
            raise RuntimeError(
                "CRITICAL SECURITY VIOLATION: production secret_key must be at least 32 characters "
                "and cannot use default/known placeholder keys"
            )

    logger.info("Starting Veridex", version=settings.app_version)

    # Initialize OpenTelemetry instrumentation and providers
    from app.database.session import engine
    from app.telemetry.setup import init_telemetry, shutdown_telemetry

    init_telemetry(app=app, engine=engine)

    yield

    logger.info("Shutting down Veridex")
    shutdown_telemetry(timeout_seconds=5.0)


def create_app() -> FastAPI:
    """Create and configure the FastAPI application."""
    settings = get_settings()

    # Setup structured logging
    setup_logging()

    app = FastAPI(
        title=settings.app_name,
        description="AI Agent Governance, Security, Audit & Observability Platform",
        version=settings.app_version,
        docs_url="/docs" if settings.environment == "development" else None,
        redoc_url="/redoc" if settings.environment == "development" else None,
        lifespan=lifespan,
    )

    # CORS
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Include API routes
    app.include_router(api_v1_router)

    return app


app = create_app()
