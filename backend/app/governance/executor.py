"""Trusted Tool Executor with strict sandboxing and timeout enforcement.

Complies with Phase 5 Execution Isolation requirements:
- Only explicitly registered and trusted execution handlers may execute.
- Never executes arbitrary user-submitted Python, shell commands or code.
- Enforces tool-specific timeouts.
- Records execution duration and execution outcome (SUCCESS, FAILED, TIMED_OUT).
"""

import asyncio
import time
from collections.abc import Callable, Coroutine
from dataclasses import dataclass
from typing import Any

from app.governance.models import ExecutionStatus


@dataclass
class ExecutionResult:
    """Telemetry and outcome of a tool execution."""

    status: ExecutionStatus
    result: Any | None
    error_message: str | None
    duration_ms: int


ToolHandlerType = Callable[[dict[str, Any]], Coroutine[Any, Any, Any]]


class ToolExecutor:
    """Executes registered tools safely with timeout and error trapping."""

    def __init__(self) -> None:
        self._handlers: dict[str, ToolHandlerType] = {}
        self._register_default_handlers()

    def register_handler(self, slug: str, handler: ToolHandlerType) -> None:
        """Register a trusted tool execution handler."""
        self._handlers[slug] = handler

    def has_handler(self, slug: str) -> bool:
        """Check if a handler is registered for the slug."""
        return slug in self._handlers

    async def execute(
        self,
        slug: str,
        arguments: dict[str, Any],
        timeout_seconds: int | None = None,
    ) -> ExecutionResult:
        """Execute a tool handler within a specified timeout limit.

        Never runs arbitrary user code. Enforces timeouts and records duration.
        """
        handler = self._handlers.get(slug)
        if not handler:
            return ExecutionResult(
                status=ExecutionStatus.FAILED,
                result=None,
                error_message=f"No trusted execution handler registered for tool slug '{slug}'",
                duration_ms=0,
            )

        effective_timeout = timeout_seconds if (timeout_seconds and timeout_seconds > 0) else 30
        start_time = time.monotonic()

        try:
            result = await asyncio.wait_for(handler(arguments), timeout=effective_timeout)
            duration_ms = int((time.monotonic() - start_time) * 1000)
            return ExecutionResult(
                status=ExecutionStatus.SUCCESS,
                result=result,
                error_message=None,
                duration_ms=duration_ms,
            )
        except TimeoutError:
            duration_ms = int((time.monotonic() - start_time) * 1000)
            return ExecutionResult(
                status=ExecutionStatus.TIMED_OUT,
                result=None,
                error_message=f"Tool execution timed out after {effective_timeout}s",
                duration_ms=duration_ms,
            )
        except Exception as exc:  # noqa: BLE001
            duration_ms = int((time.monotonic() - start_time) * 1000)
            return ExecutionResult(
                status=ExecutionStatus.FAILED,
                result=None,
                error_message=str(exc),
                duration_ms=duration_ms,
            )

    def _register_default_handlers(self) -> None:
        """Register safe built-in mock handlers for known utility tools."""

        async def math_calculator(args: dict[str, Any]) -> dict[str, Any]:
            op = args.get("operation")
            a = float(args.get("a", 0))
            b = float(args.get("b", 0))

            if op == "add":
                val = a + b
            elif op == "subtract":
                val = a - b
            elif op == "multiply":
                val = a * b
            elif op == "divide":
                if b == 0:
                    raise ZeroDivisionError("Division by zero is not permitted")
                val = a / b
            else:
                raise ValueError(f"Unsupported operation '{op}'")

            return {"operation": op, "a": a, "b": b, "result": val}

        async def echo(args: dict[str, Any]) -> dict[str, Any]:
            return {"echoed": args}

        async def system_status(args: dict[str, Any]) -> dict[str, Any]:
            service = args.get("service", "core")
            return {"service": service, "status": "operational", "latency_ms": 12}

        async def data_lookup(args: dict[str, Any]) -> dict[str, Any]:
            record_id = args.get("record_id", "default")
            return {
                "record_id": record_id,
                "data": {"found": True, "category": args.get("category", "general")},
            }

        async def slow_operation(args: dict[str, Any]) -> dict[str, Any]:
            delay = float(args.get("delay", 2.0))
            await asyncio.sleep(delay)
            return {"completed_after": delay}

        self.register_handler("math-calculator", math_calculator)
        self.register_handler("calculator", math_calculator)
        self.register_handler("echo", echo)
        self.register_handler("system-status", system_status)
        self.register_handler("data-lookup", data_lookup)
        self.register_handler("slow-operation", slow_operation)


# Global executor instance
default_executor = ToolExecutor()
