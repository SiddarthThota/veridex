"""OpenTelemetry initialization, instrumentation, and metrics configuration."""

import logging
import time
from typing import Any

from fastapi import FastAPI
from opentelemetry import metrics, trace
from opentelemetry.exporter.otlp.proto.grpc.metric_exporter import OTLPMetricExporter
from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
from opentelemetry.instrumentation.httpx import HTTPXClientInstrumentor
from opentelemetry.instrumentation.sqlalchemy import SQLAlchemyInstrumentor
from opentelemetry.metrics import Counter, Histogram, Meter
from opentelemetry.sdk.metrics import MeterProvider
from opentelemetry.sdk.metrics.export import MetricReader, PeriodicExportingMetricReader
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import SpanProcessor, TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor, SpanExporter

from app.common.config import get_settings

logger = logging.getLogger("veridex.telemetry")

# Telemetry state guards
_telemetry_initialized: bool = False
_tracer_provider: TracerProvider | None = None
_meter_provider: MeterProvider | None = None
_meter: Meter | None = None

# Metric instruments
_governance_requests_counter: Counter | None = None
_governance_duration_histogram: Histogram | None = None
_tool_executions_counter: Counter | None = None
_tool_duration_histogram: Histogram | None = None


def get_tracer(name: str = "veridex") -> trace.Tracer:
    """Return an OpenTelemetry tracer."""
    return trace.get_tracer(name)


def get_meter(name: str = "veridex") -> Meter:
    """Return an OpenTelemetry meter."""
    return metrics.get_meter(name)


def safe_set_attributes(span: Any, attributes: dict[str, Any]) -> None:
    """Safely set attributes on an OpenTelemetry span, logging any failure at debug level."""
    try:
        if span is not None and hasattr(span, "set_attribute"):
            for key, value in attributes.items():
                if value is not None:
                    span.set_attribute(key, value)
    except Exception as exc:
        logger.debug("Failed to set span attributes (fail-silent): %s", exc)


def _setup_metric_instruments(meter: Meter) -> None:
    """Create and cache bounded, low-cardinality metric instruments."""
    global _governance_requests_counter, _governance_duration_histogram
    global _tool_executions_counter, _tool_duration_histogram

    _governance_requests_counter = meter.create_counter(
        name="veridex.governance.requests",
        unit="1",
        description="Total number of governance policy evaluation requests",
    )

    _governance_duration_histogram = meter.create_histogram(
        name="veridex.governance.evaluation.duration",
        unit="s",
        description="Duration of governance policy evaluations in seconds",
    )

    _tool_executions_counter = meter.create_counter(
        name="veridex.tool.executions",
        unit="1",
        description="Total number of tool executions executed by the governance gateway",
    )

    _tool_duration_histogram = meter.create_histogram(
        name="veridex.tool.execution.duration",
        unit="s",
        description="Duration of tool executions in seconds",
    )


# Bounded metric categories to prevent dimension explosion
BOUNDED_OPERATIONS: frozenset[str] = frozenset({"read", "write", "execute", "custom", "unknown"})


def normalize_operation(operation: str | None) -> str:
    """Normalize operation to a bounded set of allowed categories to prevent metric dimension explosion."""
    if not operation:
        return "unknown"
    op_lower = str(operation).lower()
    if op_lower in BOUNDED_OPERATIONS:
        return op_lower
    return "custom"


def record_governance_request(
    decision: str,
    risk_level: str,
    environment: str,
    duration_seconds: float,
) -> None:
    """Record governance evaluation count and latency with bounded low-cardinality attributes."""
    try:
        # Strictly bounded dimensions
        attributes = {
            "decision": str(decision).upper(),
            "risk_level": str(risk_level).upper(),
            "environment": str(environment).lower(),
        }
        if _governance_requests_counter is not None:
            _governance_requests_counter.add(1, attributes=attributes)
        if _governance_duration_histogram is not None and duration_seconds >= 0:
            _governance_duration_histogram.record(duration_seconds, attributes=attributes)
    except Exception as exc:
        logger.debug("Failed to record governance metrics (fail-silent): %s", exc)


def record_tool_execution(
    operation: str,
    status: str,
    environment: str,
    duration_seconds: float,
) -> None:
    """Record tool execution count and latency with bounded low-cardinality attributes."""
    try:
        # Strictly bounded dimensions: normalize operation to prevent arbitrary tool slugs in labels
        attributes = {
            "operation": normalize_operation(operation),
            "status": str(status).upper(),
            "environment": str(environment).lower(),
        }
        if _tool_executions_counter is not None:
            _tool_executions_counter.add(1, attributes=attributes)
        if _tool_duration_histogram is not None and duration_seconds >= 0:
            _tool_duration_histogram.record(duration_seconds, attributes=attributes)
    except Exception as exc:
        logger.debug("Failed to record tool execution metrics (fail-silent): %s", exc)


def init_telemetry(
    app: FastAPI | None = None,
    engine: Any | None = None,
    custom_span_processor: SpanProcessor | None = None,
    custom_span_exporter: SpanExporter | None = None,
    custom_metric_reader: MetricReader | None = None,
    force_reinit: bool = False,
) -> None:
    """Initialize OpenTelemetry tracing, metrics, and auto-instrumentations.

    Guarantees:
    - Idempotent: repeated calls do not duplicate processors or handlers unless force_reinit=True.
    - Fail-safe: if settings.otel_enabled is False, initialization returns safely as a no-op.
    - Sanitized: headers and query parameter data are excluded or not recorded.
    """
    global _telemetry_initialized, _tracer_provider, _meter_provider, _meter

    if _telemetry_initialized and not force_reinit:
        logger.debug("OpenTelemetry already initialized; skipping.")
        return

    settings = get_settings()

    if not settings.otel_enabled and not force_reinit:
        logger.info("OpenTelemetry is disabled (VERIDEX_OTEL_ENABLED=false).")
        _telemetry_initialized = True
        return

    try:
        resource = Resource.create(
            {
                "service.name": settings.otel_service_name,
                "service.version": settings.app_version,
                "deployment.environment": settings.environment,
            }
        )

        # 1. TracerProvider Setup
        tracer_provider = TracerProvider(resource=resource)

        if custom_span_processor is not None:
            tracer_provider.add_span_processor(custom_span_processor)
        elif custom_span_exporter is not None:
            # Used primarily in tests (e.g., SimpleSpanProcessor with InMemorySpanExporter)
            from opentelemetry.sdk.trace.export import SimpleSpanProcessor

            tracer_provider.add_span_processor(SimpleSpanProcessor(custom_span_exporter))
        else:
            # Production BatchSpanProcessor with exact bounded capacities
            otlp_trace_exporter = OTLPSpanExporter(
                endpoint=settings.otel_exporter_endpoint,
                insecure=True,
                timeout=3.0,
            )
            batch_processor = BatchSpanProcessor(
                otlp_trace_exporter,
                max_queue_size=2048,
                max_export_batch_size=512,
                schedule_delay_millis=5000,
                export_timeout_millis=3000,
            )
            tracer_provider.add_span_processor(batch_processor)

        if force_reinit:
            from opentelemetry.util._once import Once

            trace._TRACER_PROVIDER = tracer_provider
            trace._TRACER_PROVIDER_SET_ONCE = Once()
            trace._TRACER_PROVIDER_SET_ONCE.do_once(lambda: None)
        else:
            trace.set_tracer_provider(tracer_provider)
        _tracer_provider = tracer_provider

        # 2. MeterProvider Setup
        metric_readers: list[MetricReader] = []
        if custom_metric_reader is not None:
            metric_readers.append(custom_metric_reader)
        else:
            otlp_metric_exporter = OTLPMetricExporter(
                endpoint=settings.otel_exporter_endpoint,
                insecure=True,
                timeout=3.0,
            )
            periodic_reader = PeriodicExportingMetricReader(
                otlp_metric_exporter,
                export_interval_millis=10000,
                export_timeout_millis=3000,
            )
            metric_readers.append(periodic_reader)

        meter_provider = MeterProvider(
            resource=resource,
            metric_readers=metric_readers,
        )
        if force_reinit:
            from opentelemetry.metrics import _internal as metrics_internal
            from opentelemetry.util._once import Once

            metrics_internal._METER_PROVIDER = meter_provider
            metrics_internal._PROXY_METER_PROVIDER.on_set_meter_provider(meter_provider)
            metrics_internal._METER_PROVIDER_SET_ONCE = Once()
            metrics_internal._METER_PROVIDER_SET_ONCE.do_once(lambda: None)
        else:
            metrics.set_meter_provider(meter_provider)
        _meter_provider = meter_provider

        # Initialize meter and instruments
        _meter = meter_provider.get_meter("veridex")
        _setup_metric_instruments(_meter)

        # 3. Auto-instrumentation
        # A. FastAPI Instrumentation
        if app is not None and not getattr(app.state, "_otel_instrumented", False):
            FastAPIInstrumentor.instrument_app(
                app,
                tracer_provider=tracer_provider,
                meter_provider=meter_provider,
                excluded_urls="health,ready",
            )
            app.state._otel_instrumented = True

        # B. SQLAlchemy Instrumentation
        if engine is not None:
            sync_engine = getattr(engine, "sync_engine", engine)
            if not getattr(sync_engine, "_otel_instrumented", False):
                SQLAlchemyInstrumentor().instrument(
                    engine=sync_engine,
                    tracer_provider=tracer_provider,
                    enable_commenter=False,
                )
                sync_engine._otel_instrumented = True

        # C. HTTPX Client Instrumentation
        if not getattr(HTTPXClientInstrumentor, "_is_instrumented", False):
            HTTPXClientInstrumentor().instrument(
                tracer_provider=tracer_provider,
            )
            HTTPXClientInstrumentor._is_instrumented = True

        _telemetry_initialized = True
        logger.info(
            "OpenTelemetry initialized successfully (service: %s, endpoint: %s)",
            settings.otel_service_name,
            settings.otel_exporter_endpoint,
        )
    except Exception as exc:
        # Failure isolation: telemetry failure must never crash the service on startup
        logger.error("Failed to initialize OpenTelemetry (continuing without tracing): %s", exc)
        _telemetry_initialized = True


def shutdown_telemetry(timeout_seconds: float = 5.0) -> None:
    """Flush and shut down OpenTelemetry providers gracefully with clean lifecycle behavior.

    Lifecycle and SDK timeout notes:
    - In OpenTelemetry Python SDK, TracerProvider.shutdown() takes no timeout parameter. Its
      underlying BatchProcessor waits on worker threads up to its internal schedule delay /
      timeout, and active in-flight network exports cannot be aborted from Python without unsafe
      thread termination.
    - MeterProvider.shutdown(timeout_millis=...) accepts a timeout parameter.
    - This function guarantees exception isolation and idempotent execution: repeated calls
      or failures in individual providers do not crash the runtime or leak provider references.
    """
    global _telemetry_initialized, _tracer_provider, _meter_provider

    if not _telemetry_initialized and _tracer_provider is None and _meter_provider is None:
        logger.debug("OpenTelemetry already shut down or uninitialized; skipping.")
        return

    logger.info("Shutting down OpenTelemetry providers...")
    start_time = time.monotonic()

    if _tracer_provider is not None:
        try:
            _tracer_provider.shutdown()
        except Exception as exc:
            logger.warning("Error shutting down TracerProvider: %s", exc)
        finally:
            _tracer_provider = None

    elapsed = time.monotonic() - start_time
    remaining_millis = max(100.0, (timeout_seconds - elapsed) * 1000.0)

    if _meter_provider is not None:
        try:
            _meter_provider.shutdown(timeout_millis=remaining_millis)
        except Exception as exc:
            logger.warning("Error shutting down MeterProvider: %s", exc)
        finally:
            _meter_provider = None

    _telemetry_initialized = False
    logger.info("OpenTelemetry providers shut down successfully.")
