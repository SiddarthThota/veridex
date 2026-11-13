"""Unit and security audit tests for OpenTelemetry operational tracing and metrics."""

import uuid
from datetime import UTC, datetime
from typing import Any
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi import FastAPI, Request
from fastapi.testclient import TestClient
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
from opentelemetry.instrumentation.sqlalchemy import SQLAlchemyInstrumentor
from opentelemetry.sdk.metrics.export import InMemoryMetricReader
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import SimpleSpanProcessor
from opentelemetry.sdk.trace.export.in_memory_span_exporter import InMemorySpanExporter
from sqlalchemy import create_engine, text

from app.agents.models import Agent, AgentEnvironment, AgentRiskTier, AgentStatus
from app.common.config import get_settings
from app.governance.executor import ToolExecutor
from app.governance.models import (
    AgentRun,
    ExecutionStatus,
    GovernanceDecision,
    RunStatus,
)
from app.governance.schemas import ToolInvocationRequest
from app.governance.service import GovernanceService
from app.telemetry.setup import (
    BOUNDED_OPERATIONS,
    init_telemetry,
    normalize_operation,
    record_governance_request,
    record_tool_execution,
    safe_set_attributes,
    shutdown_telemetry,
)
from app.tools.models import (
    AgentToolPermission,
    Tool,
    ToolAccessType,
    ToolApprovalRequirement,
    ToolDataClassification,
    ToolReversibility,
    ToolRiskLevel,
    ToolStatus,
    ToolVersion,
    ToolVersionStatus,
)


def test_telemetry_initialization_and_idempotency() -> None:
    """Test that init_telemetry is idempotent and properly registers providers."""
    # First init
    init_telemetry(force_reinit=True)
    from app.telemetry.setup import _meter_provider, _telemetry_initialized, _tracer_provider

    assert _telemetry_initialized is True
    assert _tracer_provider is not None
    assert _meter_provider is not None

    first_tp = _tracer_provider
    first_mp = _meter_provider

    # Second init without force_reinit should be a no-op
    init_telemetry(force_reinit=False)
    from app.telemetry.setup import (
        _meter_provider as second_mp,
    )
    from app.telemetry.setup import (
        _tracer_provider as second_tp,
    )

    assert first_tp is second_tp
    assert first_mp is second_mp

    # Clean shutdown
    shutdown_telemetry()


def test_telemetry_disabled(monkeypatch: pytest.MonkeyPatch) -> None:
    """Test that when VERIDEX_OTEL_ENABLED is False, telemetry is a safe no-op."""
    settings = get_settings()
    monkeypatch.setattr(settings, "otel_enabled", False)

    init_telemetry(force_reinit=True)
    shutdown_telemetry()


def test_safe_set_attributes_fail_silent() -> None:
    """Test that safe_set_attributes never raises, even on None or broken spans."""
    safe_set_attributes(None, {"key": "value"})

    broken_span = MagicMock()
    broken_span.set_attribute.side_effect = RuntimeError("Broken span")
    safe_set_attributes(broken_span, {"key": "value"})


def test_metrics_recording_with_bounded_dimensions() -> None:
    """Test that governance and tool metrics record strictly bounded, low-cardinality attributes."""
    reader = InMemoryMetricReader()
    init_telemetry(custom_metric_reader=reader, force_reinit=True)

    record_governance_request(
        decision="ALLOW",
        risk_level="LOW",
        environment="development",
        duration_seconds=0.045,
    )

    record_tool_execution(
        operation="read",
        status="SUCCESS",
        environment="development",
        duration_seconds=0.012,
    )

    metric_data = reader.get_metrics_data()
    assert metric_data is not None

    metric_names = {
        rm.name
        for sm in metric_data.resource_metrics
        for scope_metrics in sm.scope_metrics
        for rm in scope_metrics.metrics
    }
    assert "veridex.governance.requests" in metric_names
    assert "veridex.governance.evaluation.duration" in metric_names
    assert "veridex.tool.executions" in metric_names
    assert "veridex.tool.execution.duration" in metric_names

    allowed_keys = {"decision", "risk_level", "environment", "operation", "status"}
    for sm in metric_data.resource_metrics:
        for scope_metrics in sm.scope_metrics:
            for metric in scope_metrics.metrics:
                for data_point in metric.data.data_points:
                    for key in data_point.attributes:
                        assert key in allowed_keys, f"Found unexpected attribute '{key}'"
                    if "operation" in data_point.attributes:
                        assert data_point.attributes["operation"] in BOUNDED_OPERATIONS

    shutdown_telemetry()


def test_arbitrary_tool_slugs_cardinality_protection() -> None:
    """Test that arbitrary tool names/slugs CANNOT expand metric cardinality."""
    reader = InMemoryMetricReader()
    init_telemetry(custom_metric_reader=reader, force_reinit=True)

    arbitrary_slugs = [
        f"tool-{uuid.uuid4().hex}",
        "custom-customer-database-query-v2",
        "bash-eval-script",
        "drop_table_users_slug",
        "random-operator-defined-tool-name-12345",
    ]

    for slug in arbitrary_slugs:
        # Direct function call must normalize to a bounded category
        normalized = normalize_operation(slug)
        assert normalized == "custom"
        assert normalized in BOUNDED_OPERATIONS

        record_tool_execution(
            operation=slug,
            status="SUCCESS",
            environment="production",
            duration_seconds=0.05,
        )

    # Empty or None should map to unknown
    assert normalize_operation(None) == "unknown"
    assert normalize_operation("") == "unknown"

    # Known categories must be preserved
    assert normalize_operation("read") == "read"
    assert normalize_operation("WRITE") == "write"
    assert normalize_operation("execute") == "execute"

    # Check that in metric data, all arbitrary slugs collapsed to 'custom'
    metric_data = reader.get_metrics_data()
    assert metric_data is not None

    operation_values = set()
    for sm in metric_data.resource_metrics:
        for scope_metrics in sm.scope_metrics:
            for metric in scope_metrics.metrics:
                for data_point in metric.data.data_points:
                    if "operation" in data_point.attributes:
                        op = data_point.attributes["operation"]
                        operation_values.add(op)
                        # None of the arbitrary slug names must ever appear as a metric label value
                        for slug in arbitrary_slugs:
                            assert op != slug, f"Arbitrary slug '{slug}' leaked into metric dimension!"

    # Allowed operations must be a subset of the finite bounded set
    assert operation_values.issubset(BOUNDED_OPERATIONS)
    shutdown_telemetry()


def _make_mock_invocation_db(
    org_id: uuid.UUID,
    run_id: uuid.UUID,
    agent: Agent,
    tool: Tool,
    tool_ver: ToolVersion,
    perm: AgentToolPermission,
) -> AsyncMock:
    """Construct an AsyncSession mock that handles all queries for invoke_tool."""
    db = AsyncMock()

    run = AgentRun(
        id=run_id,
        organization_id=org_id,
        agent_id=agent.id,
        status=RunStatus.RUNNING,
        environment="development",
        started_at=datetime.now(UTC),
    )

    def execute_side_effect(query: Any) -> Any:
        query_str = str(query).lower()
        mock_result = MagicMock()

        if "from agent_runs" in query_str:
            mock_result.scalar_one_or_none.return_value = run
        elif "from tool_requests" in query_str:
            mock_result.scalar_one_or_none.return_value = None
        elif "from agents" in query_str:
            mock_result.scalar_one_or_none.return_value = agent
        elif "from tools" in query_str:
            mock_result.scalar_one_or_none.return_value = tool
        elif "from tool_versions" in query_str:
            mock_result.scalar_one_or_none.return_value = tool_ver
        elif "from agent_tool_permissions" in query_str:
            mock_result.scalar_one_or_none.return_value = perm
        elif "from risk_configurations" in query_str or "from policy_versions" in query_str:
            mock_result.scalar_one_or_none.return_value = None
        else:
            mock_result.scalar_one_or_none.return_value = None

        return mock_result

    def sync_add(obj: Any) -> None:
        if hasattr(obj, "id") and getattr(obj, "id", None) is None:
            obj.id = uuid.uuid4()

    db.add = MagicMock(side_effect=sync_add)
    db.flush = AsyncMock()
    db.execute.side_effect = execute_side_effect
    return db


@pytest.mark.asyncio
async def test_governance_spans_hierarchical_and_safe_attributes() -> None:
    """Test parent evaluation span and child execution span with strictly approved safe attributes."""
    exporter = InMemorySpanExporter()
    reader = InMemoryMetricReader()
    init_telemetry(
        custom_span_exporter=exporter,
        custom_metric_reader=reader,
        force_reinit=True,
    )

    org_id = uuid.uuid4()
    run_id = uuid.uuid4()
    agent_id = uuid.uuid4()
    tool_id = uuid.uuid4()
    tool_ver_id = uuid.uuid4()
    now = datetime.now(UTC)

    agent = Agent(
        id=agent_id,
        organization_id=org_id,
        name="telemetry-agent",
        slug="telemetry-agent",
        status=AgentStatus.ACTIVE,
        environment=AgentEnvironment.DEVELOPMENT,
        risk_tier=AgentRiskTier.LOW,
        model_provider="openai",
        model_name="gpt-4o",
        created_at=now,
        updated_at=now,
    )

    tool = Tool(
        id=tool_id,
        organization_id=org_id,
        name="echo",
        slug="echo",
        owner_user_id=uuid.uuid4(),
        status=ToolStatus.ACTIVE,
        risk_level=ToolRiskLevel.LOW,
        access_type=ToolAccessType.READ,
        reversibility=ToolReversibility.REVERSIBLE,
        data_classification=ToolDataClassification.INTERNAL,
        approval_requirement=ToolApprovalRequirement.NOT_REQUIRED,
        timeout_seconds=10,
        created_at=now,
        updated_at=now,
    )

    tool_ver = ToolVersion(
        id=tool_ver_id,
        tool_id=tool_id,
        version="1.0.0",
        input_schema=None,
        status=ToolVersionStatus.PUBLISHED,
        created_at=now,
        updated_at=now,
    )

    perm = AgentToolPermission(
        id=uuid.uuid4(),
        agent_id=agent_id,
        tool_id=tool_id,
        allowed=True,
        created_by=uuid.uuid4(),
        created_at=now,
        updated_at=now,
    )

    db = _make_mock_invocation_db(org_id, run_id, agent, tool, tool_ver, perm)
    executor = ToolExecutor()
    service = GovernanceService(executor=executor)

    secret_arg_value = "super_secret_payload_value_98765"
    secret_idempotency_key = "idemp-test-secret-uuid-54321"

    request = ToolInvocationRequest(
        agent_id=agent_id,
        tool_id=tool_id,
        tool_version_id=tool_ver_id,
        arguments={"msg": secret_arg_value},
        idempotency_key=secret_idempotency_key,
    )

    response = await service.invoke_tool(
        db=db,
        organization_id=org_id,
        run_id=run_id,
        request=request,
    )

    assert response.decision == GovernanceDecision.ALLOW
    assert response.execution_status == ExecutionStatus.SUCCESS

    spans = exporter.get_finished_spans()
    assert len(spans) >= 2, f"Expected at least parent and child span, got {len(spans)}"

    span_by_name = {s.name: s for s in spans}
    assert "veridex.governance.evaluate" in span_by_name
    assert "veridex.tool.execute" in span_by_name

    parent_span = span_by_name["veridex.governance.evaluate"]
    child_span = span_by_name["veridex.tool.execute"]

    # Verify hierarchy: child span's parent is the parent span
    assert child_span.parent.span_id == parent_span.context.span_id

    # Verify safe attributes on parent span
    parent_attrs = parent_span.attributes
    assert parent_attrs["veridex.organization_id"] == str(org_id)
    assert parent_attrs["veridex.run_id"] == str(run_id)
    assert parent_attrs["veridex.agent_id"] == str(agent_id)
    assert parent_attrs["veridex.tool_id"] == str(tool_id)
    assert parent_attrs["veridex.tool_version_id"] == str(tool_ver_id)
    assert parent_attrs["veridex.decision"] == "ALLOW"
    assert parent_attrs["veridex.operation"] == "read"

    # Verify safe attributes on child span
    child_attrs = child_span.attributes
    assert child_attrs["veridex.operation"] == "read"
    assert child_attrs["veridex.status"] == "SUCCESS"
    assert child_attrs["veridex.duration_ms"] >= 0

    # SECURITY AUDIT: Verify unapproved & sensitive attributes are NOT present on ANY span
    forbidden_keys = {
        "veridex.arguments_hash",
        "arguments_hash",
        "veridex.idempotency_key",
        "idempotency_key",
        "veridex.arguments",
        "request.arguments",
        "arguments",
        "execution.result",
        "result",
        "input_prompt",
        "output_summary",
        "Authorization",
        "authorization",
        "Cookie",
        "cookie",
    }
    for span in spans:
        for attr_key in span.attributes:
            assert attr_key not in forbidden_keys, f"Found forbidden attribute '{attr_key}' on span '{span.name}'"
        # Ensure no argument value or idempotency key leaked into attribute values
        for val in span.attributes.values():
            assert secret_arg_value not in str(val), "Argument payload value leaked into span attribute!"
            assert secret_idempotency_key not in str(val), "Idempotency key leaked into span attribute!"

    shutdown_telemetry()


@pytest.mark.asyncio
async def test_governance_telemetry_fail_silent() -> None:
    """Test that failures in telemetry collection do not impede or fail governance decisions."""
    org_id = uuid.uuid4()
    run_id = uuid.uuid4()
    agent_id = uuid.uuid4()
    tool_id = uuid.uuid4()
    tool_ver_id = uuid.uuid4()
    now = datetime.now(UTC)

    agent = Agent(
        id=agent_id,
        organization_id=org_id,
        name="telemetry-agent",
        slug="telemetry-agent",
        status=AgentStatus.ACTIVE,
        environment=AgentEnvironment.DEVELOPMENT,
        risk_tier=AgentRiskTier.LOW,
        model_provider="openai",
        model_name="gpt-4o",
        created_at=now,
        updated_at=now,
    )

    tool = Tool(
        id=tool_id,
        organization_id=org_id,
        name="echo",
        slug="echo",
        owner_user_id=uuid.uuid4(),
        status=ToolStatus.ACTIVE,
        risk_level=ToolRiskLevel.LOW,
        access_type=ToolAccessType.READ,
        reversibility=ToolReversibility.REVERSIBLE,
        data_classification=ToolDataClassification.INTERNAL,
        approval_requirement=ToolApprovalRequirement.NOT_REQUIRED,
        timeout_seconds=10,
        created_at=now,
        updated_at=now,
    )

    tool_ver = ToolVersion(
        id=tool_ver_id,
        tool_id=tool_id,
        version="1.0.0",
        input_schema=None,
        status=ToolVersionStatus.PUBLISHED,
        created_at=now,
        updated_at=now,
    )

    perm = AgentToolPermission(
        id=uuid.uuid4(),
        agent_id=agent_id,
        tool_id=tool_id,
        allowed=True,
        created_by=uuid.uuid4(),
        created_at=now,
        updated_at=now,
    )

    db = _make_mock_invocation_db(org_id, run_id, agent, tool, tool_ver, perm)
    executor = ToolExecutor()
    service = GovernanceService(executor=executor)

    # Initialize telemetry with an exporter that fails
    broken_exporter = InMemorySpanExporter()
    broken_exporter.export = MagicMock(side_effect=RuntimeError("Collector unreachable"))
    init_telemetry(custom_span_exporter=broken_exporter, force_reinit=True)

    request = ToolInvocationRequest(
        agent_id=agent_id,
        tool_id=tool_id,
        tool_version_id=tool_ver_id,
        arguments={"msg": "resilient call"},
    )

    # Invocation must succeed cleanly despite exporter failure
    response = await service.invoke_tool(
        db=db,
        organization_id=org_id,
        run_id=run_id,
        request=request,
    )

    assert response.decision == GovernanceDecision.ALLOW
    assert response.execution_status == ExecutionStatus.SUCCESS
    shutdown_telemetry()


def test_shutdown_telemetry_lifecycle_and_idempotency() -> None:
    """Test shutdown lifecycle idempotency, failure isolation, and timeout parameter handling."""
    init_telemetry(force_reinit=True)

    # 1. Clean shutdown
    shutdown_telemetry(timeout_seconds=5.0)

    # 2. Repeated shutdown calls must be completely safe no-ops (idempotency)
    shutdown_telemetry(timeout_seconds=5.0)
    shutdown_telemetry(timeout_seconds=5.0)

    # 3. Shutdown failure isolation: if underlying providers raise, shutdown_telemetry does not raise
    init_telemetry(force_reinit=True)
    from app.telemetry.setup import _meter_provider, _tracer_provider

    if _tracer_provider is not None:
        _tracer_provider.shutdown = MagicMock(side_effect=RuntimeError("Network timeout during trace export"))
    if _meter_provider is not None:
        _meter_provider.shutdown = MagicMock(side_effect=RuntimeError("Meter provider flush error"))

    # Must complete cleanly without raising
    shutdown_telemetry(timeout_seconds=1.0)

    # Providers should still be cleared
    from app.telemetry.setup import (
        _meter_provider as mp_after,
    )
    from app.telemetry.setup import (
        _tracer_provider as tp_after,
    )

    assert tp_after is None
    assert mp_after is None


def test_automatic_fastapi_and_sqlalchemy_privacy() -> None:
    """Security audit for automatic instrumentation: ensures headers, bodies, and SQL params are never leaked."""
    exporter = InMemorySpanExporter()
    provider = TracerProvider()
    provider.add_span_processor(SimpleSpanProcessor(exporter))

    # 1. FastAPI Automatic Instrumentation Privacy Audit
    test_app = FastAPI()

    @test_app.post("/test-secure-endpoint")
    async def sample_endpoint(request: Request) -> dict[str, str]:
        return {"status": "ok"}

    FastAPIInstrumentor.instrument_app(
        test_app,
        tracer_provider=provider,
        excluded_urls="health,ready",
    )

    client = TestClient(test_app)
    secret_token = "Bearer secret_jwt_token_9999"
    secret_cookie = "session_id=super_secret_cookie_value"
    secret_body_content = "confidential_credit_card_data"

    resp = client.post(
        "/test-secure-endpoint",
        headers={
            "Authorization": secret_token,
            "Cookie": secret_cookie,
        },
        json={"payload": secret_body_content},
    )
    assert resp.status_code == 200

    fastapi_spans = exporter.get_finished_spans()
    assert len(fastapi_spans) > 0

    for span in fastapi_spans:
        for attr_key, attr_val in span.attributes.items():
            # Check key does not capture authorization or cookie headers
            assert "authorization" not in attr_key.lower(), f"Authorization header captured in key '{attr_key}'"
            assert "cookie" not in attr_key.lower(), f"Cookie header captured in key '{attr_key}'"
            # Check values do not contain secrets or body content
            val_str = str(attr_val)
            assert secret_token not in val_str, "Secret token leaked into span attribute!"
            assert secret_cookie not in val_str, "Secret cookie leaked into span attribute!"
            assert secret_body_content not in val_str, "Request body content leaked into span attribute!"

    # 2. SQLAlchemy Automatic Instrumentation Privacy Audit
    engine = create_engine("sqlite:///:memory:")
    SQLAlchemyInstrumentor().instrument(
        engine=engine,
        tracer_provider=provider,
        enable_commenter=False,
    )

    secret_sql_param = "top_secret_sql_parameter_value_4567"
    with engine.connect() as conn:
        conn.execute(
            text("SELECT :secret_val AS test_val"),
            {"secret_val": secret_sql_param},
        )

    all_spans = exporter.get_finished_spans()
    sql_spans = [s for s in all_spans if "sqlite" in s.name.lower() or "select" in s.name.lower()]

    for span in sql_spans:
        for attr_key, attr_val in span.attributes.items():
            val_str = str(attr_val)
            assert secret_sql_param not in val_str, f"SQL parameter leaked into span attribute '{attr_key}'!"

    provider.shutdown()
