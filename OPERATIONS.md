# VERIDEX — Operations Guide

> Full operations documentation will be completed in Phase 19.

## Local Development

```bash
# Start infrastructure
docker compose up postgres redis -d

# Backend
cd backend
python -m venv .venv
.venv/Scripts/activate  # Windows
pip install -e ".[dev]"
uvicorn app.main:app --reload

# Frontend
cd frontend
npm install
npm run dev
```

## Docker Deployment

```bash
docker compose up --build
```

## Environment Variables

See `.env.example` for all available configuration options.

## Database Migrations

```bash
cd backend
alembic upgrade head          # Apply all migrations
alembic revision --autogenerate -m "description"  # Create migration
alembic downgrade -1          # Rollback one migration
```

## OpenTelemetry & Observability (Phase 8.1)

Veridex includes centralized OpenTelemetry (OTel) instrumentation for end-to-end tracing and bounded metrics collection across the Governance Gateway, tool executions, FastAPI HTTP requests, and SQLAlchemy database queries.

### Architecture & Configuration

Telemetry configuration is managed via environment variables (with the `VERIDEX_` prefix):

| Variable | Type | Default | Description |
|---|---|---|---|
| `VERIDEX_OTEL_ENABLED` | bool | `true` | Globally enables or disables OpenTelemetry tracing and metrics. |
| `VERIDEX_OTEL_SERVICE_NAME` | string | `veridex-backend` | OpenTelemetry resource service name. |
| `VERIDEX_OTEL_EXPORTER_ENDPOINT` | string | `http://localhost:4317` | OTLP gRPC collector endpoint. |

### Local Collector and Jaeger Infrastructure

The local Docker Compose configuration (`docker-compose.yml`) provides:
- **`otel-collector`**: OpenTelemetry Collector listening on port `4317` (OTLP gRPC) and `4318` (OTLP HTTP).
- **`jaeger`**: Distributed tracing backend and visualization UI.

To start the observability infrastructure:
```bash
docker compose up otel-collector jaeger -d
```

- **Jaeger Web UI**: `http://localhost:16686`
- **Collector Metrics**: In Phase 8.1, metrics exported to the collector are output via the debug/stdout exporter in development.

> [!NOTE]
> Persistent metrics storage (e.g., Prometheus / TimescaleDB) and persistent metrics dashboards will be introduced in subsequent observability phases. Phase 8.1 establishes the operational tracing and instrumentation foundation.

### Trace Privacy & Cardinality Safeguards

To prevent sensitive data leakage and unbounded trace storage, strict privacy controls are enforced:

1. **Safe Trace Attributes (Permitted):**
   - `veridex.organization_id`: Organization UUID.
   - `veridex.agent_id`: Agent UUID.
   - `veridex.tool_id`: Tool UUID.
   - `veridex.tool_version_id`: ToolVersion UUID.
   - `veridex.run_id`: AgentRun UUID.
   - `veridex.decision`: Governance decision (`ALLOW`, `DENY`, `REQUIRE_APPROVAL`).
   - `veridex.violation_codes`: Machine-readable violation codes.
   - `veridex.risk_score`: Deterministic integer risk score (0–100).
   - `veridex.risk_level`: Evaluated risk tier (`LOW`, `MEDIUM`, `HIGH`, `CRITICAL`).
   - `veridex.operation`: Bounded operation category (`read`, `write`, `execute`).
   - `veridex.status`: Execution status (`SUCCESS`, `FAILED`, `TIMED_OUT`).
   - `veridex.duration_ms`: Execution latency in milliseconds.

2. **Strictly Forbidden Attributes (Never Recorded):**
   - `request.arguments` / raw tool arguments.
   - `execution.result` / raw tool execution output.
   - `input_prompt` / raw user instructions.
   - `output_summary` / agent completion summaries.
   - `Authorization` / `Cookie` / session tokens / PII.
   - `veridex.arguments_hash` / `arguments_hash` (removed per privacy audit).
   - `veridex.idempotency_key` / `idempotency_key` (removed per privacy audit).

3. **Bounded Metric Dimensions:**
   All application metrics are strictly bounded to low-cardinality attributes:
   - `veridex.governance.requests`: dimensions = `[decision, risk_level, environment]`
   - `veridex.governance.evaluation.duration`: dimensions = `[decision, risk_level, environment]`
   - `veridex.tool.executions`: dimensions = `[operation, status, environment]`
   - `veridex.tool.execution.duration`: dimensions = `[operation, status, environment]`

   *Metric Cardinality Protection:* The `operation` dimension is strictly normalized to a finite bounded category (`read`, `write`, `execute`, `custom`, `unknown`). Arbitrary organization-defined tool slugs are never used as metric labels.

### Failure Isolation & Lifecycle Guarantees

- **Fail-Silent Design:** Telemetry collection is strictly decoupled from governance enforcement. Any failure in the OpenTelemetry exporter, collector unreachable errors, or socket timeouts are trapped and logged at debug level. The Governance Gateway will never fail a policy evaluation or block tool execution due to a telemetry failure.
- **Graceful Lifespan Shutdown & SDK Limitations:**
  - In the OpenTelemetry Python SDK, `TracerProvider.shutdown()` does not accept a timeout argument and delegates to `BatchProcessor` which waits on internal worker thread joins up to its configured timeout; active in-flight network exports cannot be preemptively aborted from Python without unsafe thread termination.
  - `MeterProvider.shutdown(timeout_millis=...)` accepts a timeout parameter.
  - `shutdown_telemetry()` guarantees idempotent, exception-isolated provider cleanup without unsafe thread termination, ensuring process integrity on shutdown.
- **Disabling Telemetry:** To completely disable OpenTelemetry (e.g. in minimal CI or local offline test environments), set `VERIDEX_OTEL_ENABLED=false`. When disabled, all telemetry calls resolve immediately as safe no-ops.

---

## Phase 8.2 Database Optimization & Migration Operations

Phase 8.2 adds `evaluation_duration_ms` to `tool_requests` and introduces six composite B-tree indexes to accelerate governance analytics.

### 1. Database Migration Execution

The migration is managed via Alembic revision `e59b2f6a9c40`:

- **Apply Migration (Upgrade):**
  ```bash
  uv run alembic upgrade head
  ```
- **Revert Migration (Downgrade):**
  ```bash
  uv run alembic downgrade d48a1e5f8b30
  ```
- **Verify Current Head:**
  ```bash
  uv run alembic heads
  # Expected output: e59b2f6a9c40 (head)
  ```

### 2. Offline Static DDL Validation

Static SQL generation has been verified against PostgreSQL:
```bash
# Upgrade static SQL inspection:
uv run alembic upgrade d48a1e5f8b30:e59b2f6a9c40 --sql

# Downgrade static SQL inspection:
uv run alembic downgrade e59b2f6a9c40:d48a1e5f8b30 --sql
```

> [!NOTE]
> Static SQL scripts validate that the migration produces standard PostgreSQL transactional DDL (`ALTER TABLE tool_requests ADD COLUMN evaluation_duration_ms DOUBLE PRECISION;` and `CREATE INDEX ix_... ON ... (...)`). In environments without an active live PostgreSQL instance, live migration testing is completed during automated staging deployment.

### 3. Index Maintenance & Write Amplification Considerations

Adding six composite indexes provides orders-of-magnitude query acceleration for analytics queries while introducing trade-offs:

- **Query Performance Gains:**
  - Index scans eliminate full table scans for time-windowed queries (`evaluated_at BETWEEN ... AND ...`).
  - Leading `organization_id` strictly confines index searches to the tenant's data footprint.
  - Queries filtering by decision (`ALLOW`, `DENY`, `REQUIRE_APPROVAL`) leverage `ix_tool_requests_org_decision_evaluated` for index-only or index-range access.
- **Write Amplification Trade-off:**
  - Ingestion write path (`GovernanceService.invoke_tool`) inserts records into `tool_requests`.
  - Each insert updates four B-tree indexes on `tool_requests`.
  - In high-throughput write workloads, ensure database memory (`shared_buffers` and maintenance work memory) accommodates index cache pages.
- **Post-Migration Maintenance:**
  - After deploying migration `e59b2f6a9c40` on production datasets, execute `ANALYZE` to update PostgreSQL query planner statistics:
    ```sql
    ANALYZE tool_requests;
    ANALYZE risk_assessments;
    ANALYZE approval_requests;
    ```

---

## Phase 8.3 Governance Analytics Engine Operations

Phase 8.3 provides the internal read-only analytics service layer for aggregating governance performance, volumetric trends, risk distributions, and anomaly findings.

### 1. Read-Only Query Operational Boundaries

- **Database Safety:** All `AnalyticsService` queries perform strictly read-only `SELECT` statements with database-side aggregation. No rows are added, updated, or removed from the database during any analytics or anomaly evaluation.
- **Tenant Scope:** Every query requires an authenticated `organization_id`. Cross-tenant queries are structurally prevented by parameterizing all queries with the tenant's UUID.
- **Resource Limits & Guardrails:**
  - Maximum query time range is capped at 90 days.
  - Hourly time-series granularity is restricted to ranges $\le 14$ days to prevent excessive bucket generation.
  - Paginated agent and tool utilization listings enforce a maximum `page_size` of 100 (default: 20).
- **Index Utilization:**
  - Invocations and time-series queries utilize `ix_tool_requests_org_evaluated` and `ix_tool_requests_org_decision_evaluated`.
  - Risk distribution queries utilize `ix_risk_assessments_org_assessed`.
  - Approval resolution queries utilize `ix_approval_requests_org_created`.

### 2. Anomaly Detection Operations

- **Execution Context:** The `AnomalyDetector` is invoked on-demand via `AnalyticsService.detect_anomalies(org_id)`.
- **Informational Classification:** Findings (`TRIGGERED`, `NORMAL`, `INSUFFICIENT_DATA`) are returned as structured Pydantic objects. Phase 8.3 does NOT include automated alerting, background cron polling, or notification dispatchers.
- **Sample Requirements:** If fewer than 20 requests/assessments exist in the current window or fewer than 100 requests exist in the 7-day baseline window, `INSUFFICIENT_DATA` is returned to prevent false positive alert triggers.

### 4. Phase 8 Production Deployment & Operational Readiness (Phase 8.5)

#### Database Migration Procedure
Prior to starting the application, apply migration `e59b2f6a9c40`:
```bash
alembic upgrade head
```
This migration applies transactional DDL:
- Adds `evaluation_duration_ms` column to `tool_requests`.
- Creates 6 composite indexes on `tool_requests`, `risk_assessments`, and `approval_requests`.
- Downgrade capability: `alembic downgrade d48a1e5f8b30` drops indexes and the latency column cleanly.

#### Telemetry Runtime Configuration
- **Enable/Disable:** Set `VERIDEX_OTEL_ENABLED=false` to disable tracing and metrics (e.g. in test or standalone environments).
- **Collector Endpoint:** Default is `http://localhost:4317` (gRPC). Ensure your OpenTelemetry Collector is listening on this port.
- **Fail-Silent Design:** If the collector is down or network latency causes export timeouts (capped at 3.0s), the background `BatchSpanProcessor` drops oldest spans and logs at debug level without impacting application throughput or availability.

#### Operational Limitations
- **Live PostgreSQL Verification:** Migration verification was validated via offline static SQL compilation. Before production deployment, apply the migration against a staging PostgreSQL instance.
- **Persistent Metric Backend:** OTLP metric exports require an external consumer (e.g., Prometheus + Grafana or OpenTelemetry Collector metrics pipeline) for long-term storage and visualization.
