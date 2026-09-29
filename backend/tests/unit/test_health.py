"""Unit tests for health endpoints."""

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_health_endpoint(client: AsyncClient) -> None:
    """Test that the health endpoint returns healthy status."""
    response = await client.get("/api/v1/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert data["service"] == "Veridex"
    assert "version" in data
    assert "timestamp" in data


@pytest.mark.asyncio
async def test_health_endpoint_fields(client: AsyncClient) -> None:
    """Test that health response contains all required fields."""
    response = await client.get("/api/v1/health")
    data = response.json()
    required_fields = {"status", "service", "version", "environment", "timestamp"}
    assert required_fields.issubset(set(data.keys()))
