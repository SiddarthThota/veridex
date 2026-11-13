"""Telemetry module for Veridex."""

from app.telemetry.setup import (
    get_meter,
    get_tracer,
    init_telemetry,
    record_governance_request,
    record_tool_execution,
    safe_set_attributes,
    shutdown_telemetry,
)

__all__ = [
    "get_meter",
    "get_tracer",
    "init_telemetry",
    "record_governance_request",
    "record_tool_execution",
    "safe_set_attributes",
    "shutdown_telemetry",
]
