# VERIDEX — Architecture

## High-Level Architecture

```mermaid
graph TB
    subgraph Clients["Clients"]
        Browser["Browser (Next.js Dashboard)"]
        CLI["CLI (Typer)"]
        Simulator["Agent Simulator"]
    end

    subgraph Backend["Backend (FastAPI)"]
        API["REST API v1"]
        Auth["Auth & RBAC"]

        subgraph Governance["Governance Layer"]
            Gateway["Governance Gateway"]
            PolicyEngine["Policy Engine"]
            RiskEngine["Risk Engine"]
            ApprovalEngine["Approval Engine"]
            SecurityDetector["Security Detector"]
        end

        subgraph Core["Core Services"]
            AgentRegistry["Agent Registry"]
            ToolRegistry["Tool Registry"]
            AuditSystem["Audit System"]
            IncidentSystem["Incident System"]
            AIProvider["AI Provider"]
        end

        subgraph Observability["Observability"]
            Telemetry["OpenTelemetry SDK"]
            StructuredLogs["Structured Logging"]
        end
    end

    subgraph Data["Data Layer"]
        PG[(PostgreSQL 16)]
        Redis[(Redis 7)]
    end

    subgraph OTELStack["Observability Stack"]
        Collector["OTEL Collector"]
        Jaeger["Jaeger (Traces)"]
        Prometheus["Prometheus (Metrics)"]
    end

    Browser --> API
    CLI --> API
    Simulator --> API
    API --> Auth
    API --> Gateway
    Gateway --> PolicyEngine
    Gateway --> RiskEngine
    Gateway --> ApprovalEngine
    Gateway --> SecurityDetector
    Gateway --> AgentRegistry
    Gateway --> ToolRegistry
    Gateway --> AuditSystem
    Gateway --> IncidentSystem
    Gateway --> AIProvider
    Backend --> PG
    Backend --> Redis
    Telemetry --> Collector
    Collector --> Jaeger
    Collector --> Prometheus
```

## Agent Execution Lifecycle

```mermaid
sequenceDiagram
    participant U as User/Operator
    participant A as Agent
    participant GW as Governance Gateway
    participant ID as Identity Validator
    participant AZ as Authorization
    participant IV as Input Validator
    participant PE as Policy Engine
    participant RE as Risk Engine
    participant SD as Security Detector
    participant AC as Approval Check
    participant TE as Tool Executor
    participant AU as Audit System
    participant OT as Telemetry

    U->>A: Submit task
    A->>A: LLM reasoning
    A->>GW: Tool request (structured intent)

    GW->>ID: Validate agent identity
    ID-->>GW: ✓ Valid

    GW->>AZ: Check agent-tool permission
    AZ-->>GW: ✓ Authorized

    GW->>IV: Validate tool arguments
    IV-->>GW: ✓ Valid

    GW->>PE: Evaluate policies
    PE-->>GW: Decision + matched policies

    GW->>RE: Calculate risk
    RE-->>GW: Score + signals

    GW->>SD: Security analysis
    SD-->>GW: Threat assessment

    GW->>AC: Check approval requirement
    alt No approval needed
        AC-->>GW: Proceed
        GW->>TE: Execute tool
        TE-->>GW: Result
    else Approval required
        AC-->>GW: PENDING
        Note over GW,U: Approval workflow
    end

    GW->>AU: Record audit event (hash-chained)
    GW->>OT: Emit trace + metrics
    GW-->>A: Result or status
```

## Governance Gateway Pipeline

```mermaid
flowchart TD
    A[Tool Request] --> B{Agent Identity Valid?}
    B -- No --> Z1[DENY: Unknown agent]
    B -- Yes --> C{Tool Registered?}
    C -- No --> Z2[DENY: Unknown tool]
    C -- Yes --> D{Agent Authorized?}
    D -- No --> Z3[DENY: No permission]
    D -- Yes --> E{Input Valid?}
    E -- No --> Z4[DENY: Invalid input]
    E -- Yes --> F[Policy Evaluation]
    F --> G{Policy Decision?}
    G -- DENY --> Z5[DENY: Policy violation]
    G -- ALLOW/FLAG --> H[Risk Calculation]
    H --> I[Security Check]
    I --> J{Approval Required?}
    J -- Yes --> K[Create Approval Request]
    K --> Z6[PENDING: Awaiting approval]
    J -- No --> L[Execute Tool]
    L --> M[Result Validation]
    M --> N[Audit Event]
    N --> O[Telemetry]
    O --> P[Return Result]

    style Z1 fill:#ff4444,color:#fff
    style Z2 fill:#ff4444,color:#fff
    style Z3 fill:#ff4444,color:#fff
    style Z4 fill:#ff4444,color:#fff
    style Z5 fill:#ff4444,color:#fff
    style Z6 fill:#ffaa00,color:#000
    style P fill:#44bb44,color:#fff
```

## Agent to Tool Architecture

```mermaid
graph TD
    Organization --> Agent
    Agent --> AgentToolPermission[Agent ↔ Tool Permission]
    AgentToolPermission --> Tool
    Tool --> ToolVersion
```


## Database ERD (Core)

```mermaid
erDiagram
    organizations ||--o{ users : contains
    organizations ||--o{ agents : owns
    users ||--o{ agents : manages
    agents ||--o{ agent_versions : has
    agents ||--o{ agent_tool_permissions : has
    tools ||--o{ tool_versions : has
    tools ||--o{ agent_tool_permissions : has
    agents ||--o{ agent_runs : executes
    agent_runs ||--o{ model_calls : includes
    agent_runs ||--o{ tool_requests : includes
    tool_requests ||--o{ tool_executions : results_in
    tool_requests ||--o{ risk_assessments : evaluated_by
    tool_requests ||--o{ approvals : may_require
    audit_events ||--o{ audit_events : chains_to
    agent_runs ||--o{ security_events : generates
    security_events ||--o{ incidents : escalates_to
    policies ||--o{ policy_versions : has

    organizations {
        uuid id PK
        string name
        string slug
        timestamp created_at
    }
    users {
        uuid id PK
        uuid organization_id FK
        string email
        string hashed_password
        string role
        boolean is_active
        timestamp created_at
    }
    agents {
        uuid id PK
        uuid organization_id FK
        uuid owner_id FK
        string name
        string description
        string model_provider
        string model
        string environment
        string risk_tier
        string status
        integer version
        timestamp created_at
    }
    tools {
        uuid id PK
        string name
        string description
        string risk_level
        boolean is_read_only
        boolean is_reversible
        string data_classification
        string required_permission
        boolean requires_approval
        string status
        integer version
    }
    policies {
        uuid id PK
        string name
        string description
        integer priority
        string scope
        string action
        boolean requires_approval
        string status
        integer version
    }
    agent_runs {
        uuid id PK
        uuid agent_id FK
        uuid user_id FK
        string status
        string trace_id
        timestamp started_at
        timestamp completed_at
    }
    audit_events {
        uuid id PK
        timestamp timestamp
        string event_type
        string actor_type
        uuid actor_id
        uuid agent_id
        uuid run_id
        string trace_id
        string decision
        string payload_hash
        string previous_hash
        string current_hash
    }
```

## Audit Hash Chain

```mermaid
flowchart LR
    E1["Event 1<br/>hash: abc123<br/>prev: GENESIS"] --> E2["Event 2<br/>hash: def456<br/>prev: abc123"]
    E2 --> E3["Event 3<br/>hash: ghi789<br/>prev: def456"]
    E3 --> E4["Event 4<br/>hash: jkl012<br/>prev: ghi789"]
    E4 --> E5["..."]

    style E1 fill:#2196F3,color:#fff
    style E2 fill:#2196F3,color:#fff
    style E3 fill:#2196F3,color:#fff
    style E4 fill:#2196F3,color:#fff
```

Each event: `current_hash = SHA256(event_data + previous_hash)`

Tampering with any event breaks the chain for all subsequent events.

## Trust Boundaries

```mermaid
flowchart TB
    subgraph External["Untrusted Zone"]
        Browser["Browser"]
        LLM["LLM Provider"]
    end

    subgraph DMZ["DMZ"]
        API["API Gateway"]
        CORS["CORS"]
        RateLimit["Rate Limiter"]
    end

    subgraph Trusted["Trusted Zone"]
        Auth["Authentication"]
        RBAC["Authorization"]
        Governance["Governance Engine"]
        PolicyEngine["Policy Engine"]
        RiskEngine["Risk Engine"]
        AuditSystem["Audit System"]
    end

    subgraph Data["Data Zone"]
        PG["PostgreSQL"]
        Redis["Redis"]
    end

    Browser --> DMZ
    LLM --> DMZ
    DMZ --> Trusted
    Trusted --> Data

    style External fill:#ffcccc
    style DMZ fill:#ffffcc
    style Trusted fill:#ccffcc
    style Data fill:#ccccff
```

## Service Boundaries

| Service | Responsibility | Dependencies |
|---------|---------------|-------------|
| **API** | HTTP routing, request validation | Auth, all features |
| **Auth** | Authentication, token management | Database |
| **Agent Registry** | Agent CRUD, versioning | Database, Auth |
| **Tool Registry** | Tool CRUD, permissions | Database, Auth |
| **Governance Gateway** | Central control point | Policy, Risk, Approval, Security, Audit |
| **Policy Engine** | Deterministic policy evaluation | Database |
| **Risk Engine** | Risk score calculation | Database |
| **Approval Engine** | Human approval workflow | Database, Redis |
| **Audit System** | Tamper-evident event logging | Database |
| **Security Detector** | Threat detection | Database |
| **Incident System** | Security incident management | Database, Security Detector |
| **AI Provider** | LLM abstraction | External API / Mock |
| **Telemetry** | Tracing, metrics, logging | OTEL Collector |

## Data Flow

```
HTTP Request
  → CORS validation
  → Authentication (JWT)
  → Authorization (RBAC)
  → Request validation (Pydantic)
  → Business logic
  → Database operations (SQLAlchemy async)
  → Response serialization
  → Structured logging
  → Telemetry export
```

## Governance Gateway Architecture (Phase 5)

The Governance Gateway serves as the single deterministic mediation layer through which every agent tool invocation must pass before execution.

```mermaid
flowchart TD
    Req["Agent Run Invocations (POST /runs/{id}/invocations)"] --> Eval["Governance Engine (_evaluate_policy)"]
    
    subgraph Precedence["Deterministic Policy Precedence"]
        P1["1. Agent Active Check"] -->|Fail| D1["DENY: UNKNOWN_AGENT / INACTIVE_AGENT"]
        P1 -->|Pass| P2["2. Tool Active Check"]
        P2 -->|Fail| D2["DENY: UNKNOWN_TOOL / INACTIVE_TOOL"]
        P2 -->|Pass| P3["3. ToolVersion Published Check"]
        P3 -->|Fail| D3["DENY: UNPUBLISHED_TOOL_VERSION"]
        P3 -->|Pass| P4["4. Agent-Tool Permission Check"]
        P4 -->|Fail| D4["DENY: PERMISSION_DENIED"]
        P4 -->|Pass| P5["5. JSON Schema Validation"]
        P5 -->|Fail| D5["DENY: INVALID_ARGUMENTS"]
        P5 -->|Pass| P6["6. Risk & Approval Check"]
        P6 -->|Triggered| AP["REQUIRE_APPROVAL: APPROVAL_REQUIRED"]
        P6 -->|Clean| AL["ALLOW"]
    end
    
    Eval --> Precedence
    
    AL --> Exec["Tool Sandbox Executor"]
    Exec --> Out["ToolExecution (COMPLETED / FAILED / TIMED_OUT)"]
    
    AP --> Q["ApprovalRequest (PENDING)"]
    Q --> Admin["Security Analyst / Admin Decision"]
    Admin -->|Reject| Rej["REJECTED (No Execution)"]
    Admin -->|Approve| HashCheck{"Hash Verification & Version Check"}
    HashCheck -->|Valid| Exec
    HashCheck -->|Mismatch| Tamper["DENY: TAMPER_DETECTED"]
```

### Governance Data Model Relationships

```mermaid
erDiagram
    organizations ||--o{ agent_runs : belongs_to
    agents ||--o{ agent_runs : executes
    agent_runs ||--o{ tool_requests : contains
    tools ||--o{ tool_requests : targets
    tool_versions ||--o{ tool_requests : specifies
    tool_requests ||--o| tool_executions : produces
    tool_requests ||--o| approval_requests : requires
    users ||--o{ approval_requests : decided_by

    agent_runs {
        uuid id PK
        uuid organization_id FK
        uuid agent_id FK
        uuid user_id FK
        string status
        string trace_id
        text input_prompt
    }

    tool_requests {
        uuid id PK
        uuid organization_id FK
        uuid agent_run_id FK
        uuid tool_id FK
        uuid tool_version_id FK
        jsonb arguments
        string arguments_hash
        string decision
        jsonb violation_codes
        string idempotency_key
    }

    tool_executions {
        uuid id PK
        uuid tool_request_id FK
        string status
        jsonb output_payload
        text error_message
        float duration_ms
    }

    approval_requests {
        uuid id PK
        uuid organization_id FK
        uuid tool_request_id FK
        string status
        string arguments_hash
        uuid decided_by_user_id FK
        timestamp decided_at
        text decision_reason
    }
```

### Execution Sandbox & Isolation Layer

- **Closed Handler Registry:** Execution is dispatched strictly to pre-registered, verified handlers (`calculator`, `echo`, `system-status`, `data-lookup`).
- **No Arbitrary Code:** Arbitrary user strings, Python `eval`/`exec`, or shell invocations are completely rejected.
- **Timeout Isolation:** Asynchronous calls are wrapped in `asyncio.wait_for` with tool-specific timeout thresholds. If exceeded, executions are immediately terminated and persisted with status `TIMED_OUT`.
- **Integrity Verification:** Arguments and tool version IDs are hashed with SHA-256 over canonical JSON. Approvals verify this hash prior to executing the tool, preventing state manipulation.

## Policy Engine Architecture (Phase 6)

The Policy Engine delivers deterministic, declarative, multi-tier rule evaluation for all agent tool requests, executing between baseline platform safety checks and runtime execution.

```mermaid
flowchart TD
    Req["ToolRequest Intent (via Gateway)"] --> T1{"Tier 1: Mandatory Safety Floor"}

    subgraph Tier1["Tier 1: Platform Baseline Checks"]
        T1 -->|Fail| D1["DENY: UNKNOWN_AGENT / INACTIVE_AGENT / UNPUBLISHED_VERSION / PERMISSION_DENIED / INVALID_ARGUMENTS"]
    end

    T1 -->|Pass| T2["Tier 2: Active Organization Policies (Priority Order)"]

    subgraph Tier2["Tier 2: Declarative Policy Evaluation"]
        T2 --> ScopeFilter["Target Scope Filtering (agent_ids, tool_ids, environments)"]
        ScopeFilter --> AST["Sandboxed AST Condition Evaluator"]
        AST --> RuleRes{"Rule Evaluation"}
        RuleRes -->|DENY Rule Match| DenyDec["DENY (Absolute Precedence)"]
        RuleRes -->|REQUIRE_APPROVAL Match| ApprDec["REQUIRE_APPROVAL"]
        RuleRes -->|ALLOW Match & No Deny/Approval| AllowDec["ALLOW"]
    end

    Tier2 -->|No Rules Matched| T3["Tier 3: Fallback Precedence"]

    subgraph Tier3["Tier 3: Platform Fallback Baseline"]
        T3 --> DefAction{"Policy Default Action / Risk Baseline"}
        DefAction -->|Risk / Classification / Irreversible| ApprFallback["REQUIRE_APPROVAL"]
        DefAction -->|Safe / Read| AllowFallback["ALLOW"]
    end

    DenyDec --> AuditLog["Audit: ToolRequest (policy_evaluations JSON)"]
    ApprDec --> AuditLog
    AllowDec --> AuditLog
    ApprFallback --> AuditLog
    AllowFallback --> AuditLog
```

### Policy Engine Domain Model

```mermaid
erDiagram
    organizations ||--o{ policies : owns
    policies ||--o{ policy_versions : versions
    policies ||--o| policy_versions : current_version
    policy_versions ||--o{ policy_rules : contains
    tool_requests }o--o{ policy_versions : evaluated_with

    policies {
        uuid id PK
        uuid organization_id FK
        string name
        string slug
        string policy_type
        string status
        int priority
        string default_action
        uuid current_version_id FK
    }

    policy_versions {
        uuid id PK
        uuid organization_id FK
        uuid policy_id FK
        int version_number
        string status
        string description
        string change_summary
        uuid created_by FK
        timestamp published_at
    }

    policy_rules {
        uuid id PK
        uuid policy_version_id FK
        string rule_name
        text description
        int rule_order
        string action
        string violation_code
        text remediation_message
        jsonb target_scope
        jsonb condition_tree
    }

    tool_requests {
        uuid id PK
        uuid organization_id FK
        uuid tool_id FK
        uuid tool_version_id FK
        jsonb arguments
        string decision
        jsonb violation_codes
        jsonb policy_evaluations
    }
```

### Policy & Version Lifecycle State Machines

```mermaid
stateDiagram-v2
    direction LR
    [*] --> DRAFT : Create Policy
    DRAFT --> ACTIVE : Publish Version 1
    ACTIVE --> INACTIVE : Deactivate
    INACTIVE --> ACTIVE : Reactivate
    INACTIVE --> ARCHIVED : Archive
    ACTIVE --> ARCHIVED : Archive
    ARCHIVED --> [*] : Immutable / Terminal
```

```mermaid
stateDiagram-v2
    direction LR
    [*] --> DRAFT_V : Create Draft Version
    DRAFT_V --> PUBLISHED_V : Publish (Validates AST & Rules)
    PUBLISHED_V --> RETIRED_V : Superseded by New Version
    RETIRED_V --> [*] : Immutable / Historical
```

### AST Condition Evaluator Specification

- **Sandboxing:** Dynamic execution functions (`eval`, `exec`, `compile`, `getattr`) are prohibited.
- **Traversal:** Dotted path resolution (`arguments.amount`, `agent.environment`, `tool.name`, `context.risk_level`).
- **Complexity Envelopes:**
  - Max AST tree depth: 5
  - Max condition clauses: 20
  - Max payload size: 64 KB
  - Max string comparison length: 1,024 characters
- **ReDoS Immunity (Google RE2):**
  - Linear-time automata engine (`google-re2`) guaranteeing mathematical $O(n)$ time complexity in input length.
  - Catastrophic backtracking is fundamentally eliminated without relying on worker threads, timeouts, or task queues.
  - Regex pattern length capped at 128 characters, target input string capped at 1,024 characters.
  - Static authoring-time rejection of nested quantifiers, quantified alternations, and non-linear backreferences.

---

## Phase 7 — Risk Engine & 5-Stage Precedence Architecture

The Risk Engine provides deterministic quantitative risk scoring, empirical agent trust tracking, dynamic argument heuristic inspection, and immutable versioned risk configurations.

### 5-Stage Decision Precedence Pipeline

```mermaid
flowchart TD
    Start(["Tool Invocation Request"]) --> Stage1{"Stage 1: Platform Floor<br/>(Agent/Tool Active, Version Published,<br/>Permission Granted, Schema Valid)"}
    Stage1 -- "Failure" --> Deny1["Hard DENY<br/>(UNKNOWN_AGENT, INACTIVE_TOOL,<br/>PERMISSION_DENIED, SCHEMA_FAIL)"]
    Stage1 -- "Pass" --> RiskEval["Risk Evaluation<br/>(Compute S_tool, S_data, S_agent, S_context<br/>Composite Score S in [0, 100])"]

    RiskEval --> Stage2{"Stage 2: Risk Denial Pre-Check<br/>Score S >= deny_threshold (90)?"}
    Stage2 -- "Yes" --> Deny2["Stage 2 DENY<br/>(CRITICAL_RISK_THRESHOLD_EXCEEDED)"]

    Stage2 -- "No" --> Stage3["Stage 3: Policy Engine Evaluation<br/>(Enriched with context.risk_score & context.risk_level)"]
    Stage3 --> PolicyRuleCheck{"Policy Decision?"}
    PolicyRuleCheck -- "DENY" --> Deny3["Policy DENY (Absolute Precedence)"]
    PolicyRuleCheck -- "REQUIRE_APPROVAL" --> ApprovalReq["REQUIRE_APPROVAL Synthesized"]
    PolicyRuleCheck -- "ALLOW / Default" --> Stage4{"Stage 4: Approval Synthesis<br/>Score S >= approval_threshold (60)<br/>or Tool requires approval?"}

    Stage4 -- "Yes" --> ApprovalReq
    Stage4 -- "No" --> CleanAllow["Stage 5: Clean ALLOW<br/>Execute Tool in Sandboxed Executor"]

    Deny1 --> Record["Persist ToolRequest & RiskAssessment (Fail-Closed Rollback on error)"]
    Deny2 --> Record
    Deny3 --> Record
    ApprovalReq --> Record
    CleanAllow --> Record
```

### Risk Engine Domain Model (ERD)

```mermaid
erDiagram
    organizations ||--o{ risk_configurations : owns
    risk_configurations ||--|{ risk_configuration_versions : contains
    risk_configurations ||--o| risk_configuration_versions : current_version_id
    organizations ||--o{ agent_risk_profiles : tracks
    agents ||--o| agent_risk_profiles : has
    organizations ||--o{ risk_assessments : logs
    agents ||--o{ risk_assessments : assessed_for
    tools ||--o{ risk_assessments : assessed_with
    tool_versions ||--o{ risk_assessments : binds_to
    tool_requests ||--o| risk_assessments : bidirectional_link

    risk_configurations {
        uuid id PK
        uuid organization_id FK
        uuid current_version_id FK
        boolean is_active
        timestamp created_at
        timestamp updated_at
    }

    risk_configuration_versions {
        uuid id PK
        uuid risk_configuration_id FK
        integer version_number
        float weight_tool
        float weight_data
        float weight_agent
        float weight_context
        integer threshold_medium
        integer threshold_high
        integer threshold_critical
        integer approval_threshold
        integer deny_threshold
        json heuristic_rules
        string scoring_algorithm_version
        string changelog
        uuid created_by_user_id FK
    }

    agent_risk_profiles {
        uuid id PK
        uuid organization_id FK
        uuid agent_id FK
        float calculated_trust_score
        integer total_eligible_invocations
        integer total_violations
        float violation_rate
        string history_status
        integer observation_window_days
        timestamp last_assessed_at
    }

    risk_assessments {
        uuid id PK
        uuid organization_id FK
        uuid tool_request_id FK
        uuid agent_id FK
        uuid tool_id FK
        uuid tool_version_id FK
        uuid config_version_id FK
        string scoring_algorithm_version
        integer risk_score
        string risk_level
        float subscore_tool
        float subscore_data
        float subscore_agent
        float subscore_context
        json factor_breakdown
        json heuristics_matched
        json config_snapshot
        text explanation
        timestamp assessed_at
    }
```

### Four-Vector Quantitative Scoring Specification

1. **Tool Blast Radius Subscore ($S_{\text{tool}}$):**
   $$S_{\text{tool}} = 0.40 \cdot \text{tier\_pts} + 0.30 \cdot \text{access\_pts} + 0.30 \cdot \text{reversibility\_pts}$$
   - Risk Tier: `LOW`: 0.0, `MEDIUM`: 25.0, `HIGH`: 60.0, `CRITICAL`: 100.0.
   - Access Type: `READ`: 0.0, `WRITE`: 50.0.
   - Reversibility: `REVERSIBLE`: 0.0, `IRREVERSIBLE`: 100.0.

2. **Data Classification & Impact Subscore ($S_{\text{data}}$):**
   $$S_{\text{data}} = 0.70 \cdot \text{classification\_pts} + 0.30 \cdot \text{approval\_pts}$$
   - Data Classification: `PUBLIC`: 0.0, `INTERNAL`: 25.0, `CONFIDENTIAL`: 60.0, `RESTRICTED`: 100.0.
   - Approval Requirement: `NOT_REQUIRED`: 0.0, `OPTIONAL`: 50.0, `REQUIRED`: 100.0.

3. **Agent Trust & Violation History Subscore ($S_{\text{agent}}$):**
   $$S_{\text{agent}} = \min(100.0, \text{tier\_pts} + \text{violation\_penalty})$$
   - Risk Tier: `LOW`: 0.0, `MEDIUM`: 25.0, `HIGH`: 60.0, `CRITICAL`: 100.0.
   - 7-day observation window, up to 50 samples.
   - When sample size $N < 5$: status is `INSUFFICIENT_DATA`, violation rate defaults to 0.0, and conservative baseline trust score (100.0) is applied.
   - When $N \ge 5$: status is `VALID`, $\text{violation\_rate} = \text{violations} / N$, and violation penalty applies linearly.

4. **Runtime Context Risk Subscore ($S_{\text{context}}$):**
   $$S_{\text{context}} = \min(100.0, \text{env\_pts} + \sum \text{heuristic\_pts})$$
   - Environment: `DEVELOPMENT`: 0.0, `STAGING`: 25.0, `PRODUCTION`: 60.0.
   - Argument Heuristics: Pattern matches for destructive commands (`rm -rf`, `DROP TABLE`), SQL injections, wildcard scopes (`*`), and large financial thresholds.

5. **Composite Score & Classification:**
   $$S_{\text{composite}} = \text{round}(w_{\text{tool}} S_{\text{tool}} + w_{\text{data}} S_{\text{data}} + w_{\text{agent}} S_{\text{agent}} + w_{\text{context}} S_{\text{context}})$$
   - Classification: `LOW` (0–29), `MEDIUM` (30–59), `HIGH` (60–84), `CRITICAL` (85–100).
   - Enforces default thresholds: `approval_threshold = 60`, `deny_threshold = 90`.

## Phase 8 — Monitoring, Observability & Governance Analytics

### Phase 8.1 — OpenTelemetry Instrumentation & Operational Tracing Foundation

Phase 8.1 establishes the foundational distributed tracing and metrics infrastructure across the Veridex platform.

#### 1. Centralized Telemetry Setup & Architecture

OpenTelemetry initialization is centralized in `backend/app/telemetry/setup.py`, providing idempotent lifecycle management and fail-safe operation:

- **Resource Configuration:**
  - `service.name`: Configured via `VERIDEX_OTEL_SERVICE_NAME` (default: `veridex-backend`).
  - `service.version`: Configured via `settings.app_version` (e.g. `0.1.0`).
  - `deployment.environment`: Configured via `settings.environment` (`development`, `staging`, `production`).
- **TracerProvider & BatchSpanProcessor:**
  - Production `BatchSpanProcessor` configured with strict non-blocking bounds:
    - Queue Capacity: 2048 spans.
    - Max Export Batch: 512 spans.
    - Schedule Delay: 5000 ms.
    - Export Timeout: 3000 ms.
  - Exporter: `OTLPSpanExporter` connecting to `VERIDEX_OTEL_EXPORTER_ENDPOINT` (default: `http://localhost:4317`) over gRPC with a 3.0s timeout.
- **MeterProvider & Metric Readers:**
  - `PeriodicExportingMetricReader` with 10,000ms collection interval and 3,000ms export timeout.
  - Exporter: `OTLPMetricExporter` over gRPC with a 3.0s timeout.
- **Auto-Instrumentation:**
  - **FastAPI:** Auto-instrumented via `FastAPIInstrumentor.instrument_app`, with `excluded_urls="health,ready"` ensuring high-frequency liveness/readiness probes do not generate traces.
  - **SQLAlchemy:** Auto-instrumented via `SQLAlchemyInstrumentor().instrument(engine=sync_engine, enable_commenter=False)` on the synchronous engine. Parameter values and comments are excluded to prevent SQL data leakage.
  - **HTTPX:** Auto-instrumented via `HTTPXClientInstrumentor().instrument()` for outbound client requests.

#### 2. Governance Gateway Tracing & Span Hierarchy

Every tool invocation through `GovernanceService.invoke_tool()` is traced hierarchically:

- **Parent Span (`veridex.governance.evaluate`):**
  - Measures the end-to-end governance policy evaluation duration.
  - Records safe operational attributes:
    - `veridex.organization_id`: Organization UUID.
    - `veridex.run_id`: AgentRun UUID.
    - `veridex.agent_id`: Agent UUID.
    - `veridex.tool_id`: Tool UUID.
    - `veridex.tool_version_id`: ToolVersion UUID.
    - `veridex.decision`: Evaluated governance outcome (`ALLOW`, `DENY`, `REQUIRE_APPROVAL`).
    - `veridex.violation_codes`: List of machine-readable violation codes.
    - `veridex.risk_score`: Deterministic integer risk score (0–100).
    - `veridex.risk_level`: Evaluated risk classification tier.
    - `veridex.operation`: Bounded operation category (`read`, `write`, `execute`).
  - Strict privacy exclusions: `arguments_hash`, `idempotency_key`, and raw payload arguments are strictly forbidden and excluded.
- **Child Span (`veridex.tool.execute`):**
  - Generated exclusively when a tool execution is dispatched via `ToolExecutor.execute()` (on `ALLOW` or post-approval execution).
  - Nested directly under `veridex.governance.evaluate`.
  - Records execution outcome and latency:
    - `veridex.tool_id`: Target tool UUID.
    - `veridex.operation`: Bounded operation category (`read`, `write`, `execute`).
    - `veridex.status`: Execution status (`SUCCESS`, `FAILED`, `TIMED_OUT`).
    - `veridex.duration_ms`: Execution duration in milliseconds.

#### 3. Bounded Low-Cardinality Operational Metrics

Four core metrics instruments track platform throughput and latency without risk of dimensional explosion:

| Metric Name | Instrument | Unit | Bounded Dimensions | Description |
|---|---|---|---|---|
| `veridex.governance.requests` | Counter | `1` | `decision`, `risk_level`, `environment` | Count of governance evaluation requests. |
| `veridex.governance.evaluation.duration` | Histogram | `s` | `decision`, `risk_level`, `environment` | Latency distribution of policy evaluations. |
| `veridex.tool.executions` | Counter | `1` | `operation`, `status`, `environment` | Count of tool executions executed by gateway. |
| `veridex.tool.execution.duration` | Histogram | `s` | `operation`, `status`, `environment` | Latency distribution of tool executions. |

*Cardinality Control:* The `operation` dimension is strictly normalized to a finite bounded category (`read`, `write`, `execute`, `custom`, `unknown`). Arbitrary organization-defined tool slugs are never used as metric labels.

#### 4. Trace Privacy, Sanitization & Failure Isolation

- **Zero Payload Leakage:** Raw tool arguments (`request.arguments`), execution results (`execution.result`), input prompts, output summaries, session tokens, cookies, and unkeyed argument hashes are strictly excluded from spans and metric dimensions.
- **Fail-Silent Telemetry:** All span attribute updates and metric recordings are wrapped in safe helper methods (`safe_set_attributes`, `record_governance_request`, `record_tool_execution`). Telemetry exceptions are logged at `DEBUG` level and never alter, delay, or block governance decision outcomes.
- **Clean Lifespan Integration:** Application startup initializes telemetry through `FastAPI` lifespan; application shutdown flushes exporters within a 5-second graceful window to prevent zombie processes.

---

### Phase 8.2 — Governance Evaluation Performance Monitoring & Database Optimization

Phase 8.2 introduces persistent, high-resolution governance latency tracking and optimized composite database indexes for scalable governance analytics.

#### 1. Evaluation Latency Measurement & Persistence

To monitor governance overhead accurately, `ToolRequest` records the precise latency of policy and risk evaluation:

- **Model Field:** `ToolRequest.evaluation_duration_ms: Mapped[float | None]`
  - Stored as `Float` with sub-millisecond precision.
  - Nullable (`None`) for historical requests created prior to Phase 8.2 or requests that fail prior to policy evaluation.
  - Enforces non-negative validation via `@validates("evaluation_duration_ms")`: rejects values `< 0.0`.
- **Timing Boundary:**
  - High-resolution monotonic timer: `time.perf_counter_ns()`.
  - Timer starts immediately before `GovernanceService._evaluate_policy()` and stops immediately upon its completion using a strict `try/finally` block.
  - **Included in duration:** Mandatory rule checks, risk engine scoring, dynamic policy evaluation, and internal database reads required during evaluation.
  - **Excluded from duration:** Pre-evaluation argument hashing and tool request initialization, tool execution runtime, OpenTelemetry tracing and metric dispatch, and database persistence (`session.commit()` / audit logging).
  - **Measured across all decision outcomes:** `ALLOW`, mandatory rule `DENY`, risk engine `DENY`, policy rule `DENY`, `REQUIRE_APPROVAL`, and risk persistence failures.
- **Distinction from Tool Execution Duration:**
  - `evaluation_duration_ms` measures the internal overhead of the VERIDEX governance decision pipeline.
  - `tool_execution.duration_ms` measures the execution latency of the downstream tool itself (dispatched only when decision is `ALLOW` or post-approval).

#### 2. Composite Database Index Strategy

To support high-throughput governance analytics and tenant-isolated aggregations across millions of audit records, six composite indexes are added:

| Index Name | Table | Columns | Ordering & Rationale |
|---|---|---|---|
| `ix_tool_requests_org_evaluated` | `tool_requests` | `(organization_id, evaluated_at)` | Accelerates general time-range queries and volumetric aggregations per organization. |
| `ix_tool_requests_org_decision_evaluated` | `tool_requests` | `(organization_id, decision, evaluated_at)` | Optimizes filtered analytics by decision status (`ALLOW`, `DENY`, `REQUIRE_APPROVAL`) over time windows. |
| `ix_tool_requests_org_agent_evaluated` | `tool_requests` | `(organization_id, agent_id, evaluated_at)` | Accelerates per-agent activity, performance, and risk trend analysis across time ranges. |
| `ix_tool_requests_org_tool_evaluated` | `tool_requests` | `(organization_id, tool_id, evaluated_at)` | Optimizes per-tool invocation frequency and latency aggregations across time windows. |
| `ix_risk_assessments_org_assessed` | `risk_assessments` | `(organization_id, assessed_at)` | Accelerates historical risk assessment retrieval and score distribution aggregations. |
| `ix_approval_requests_org_created` | `approval_requests` | `(organization_id, created_at)` | Accelerates pending and historical approval queue inspection and resolution time queries. |

- **Leading `organization_id`:** Every composite index enforces tenant isolation at the leading column, ensuring B-tree traversals are strictly bound to the requesting tenant's partition.
- **Trailing Timestamp (`evaluated_at`, `assessed_at`, `created_at`):** Supports index range scans and descending order sorts for time-windowed analytics queries.

#### 3. Migration Architecture

- **Alembic Revision:** `e59b2f6a9c40` (`add_eval_duration_and_governance_indexes`)
- **Downstream of:** `d48a1e5f8b30` (Phase 7.1 risk engine revision)
- **Reversibility:** Fully bidirectional with tested `upgrade()` and `downgrade()` functions producing safe transactional DDL.

---

### Phase 8.3 — Governance Analytics Engine & Read-Only Anomaly Detection

Phase 8.3 introduces a dedicated, organization-isolated service layer for governance analytics, historical aggregations, latency percentiles, and read-only anomaly detection.

> [!NOTE]
> Phase 8.3 implements the internal Python service and query aggregation layer only (`backend/app/analytics/`). Analytics REST endpoints, routing, and HTTP access control will be implemented in Phase 8.4.

#### 1. Analytics Service Architecture

The analytics domain is structured in `backend/app/analytics/` adhering to single-responsibility separation:

- **`service.py` (`AnalyticsService`):**
  - High-level coordinator enforcing tenant boundaries, time-window normalization, and pagination.
  - Pure read-only operation: performs zero database mutations (`INSERT`, `UPDATE`, `DELETE`) or state changes.
- **`queries.py` (`AnalyticsQueries`):**
  - Database-side SQL aggregations using SQLAlchemy 2.0 Core expressions.
  - Avoids unbounded ORM model materialization by executing grouped aggregations in SQL.
- **`schemas.py`:**
  - Pydantic v2 schemas providing strict type safety, UTC-aware datetime parsing, and bounded pagination metadata.
- **`anomalies.py` (`AnomalyDetector`):**
  - Evaluates deterministic, read-only statistical anomaly detection rules across sliding time windows.
  - Does not emit alerts, dispatch webhooks, or trigger background jobs.
- **`exceptions.py`:**
  - Domain exceptions: `InvalidTimeRangeError`, `InvalidGranularityError`, `InvalidPaginationError`, and `TenantIsolationError`.

#### 2. Global Time Semantics & Organization Isolation

- **Timezone & Window Boundaries:**
  - All timestamps are normalized and handled strictly in UTC.
  - Intervals are evaluated as half-open ranges: `[start_time, end_time)` (`timestamp >= start_time AND timestamp < end_time`).
  - Default time window: trailing 7 days (`end_time = datetime.now(UTC)`, `start_time = end_time - 7 days`).
  - Maximum supported time window: 90 days. Queries exceeding 90 days are rejected with `InvalidTimeRangeError`.
  - Rejection of inverted intervals: `start_time >= end_time` raises `InvalidTimeRangeError`.
- **Multi-Tenant Isolation Guarantees:**
  - Every query enforces `organization_id` as a mandatory, non-optional filter parameter provided by authenticated application context.
  - Cross-tenant data, identifiers, or counts are strictly excluded from aggregates.
  - `ToolExecution` records lack an `organization_id` column; all tool execution aggregations perform an `INNER JOIN` to `ToolRequest` and filter on `ToolRequest.organization_id`.
  - Empty tenant datasets return zeroed counters and structured empty responses without division or null-pointer errors.

#### 3. Core Metric Definitions

- **Overview Analytics:**
  - `total_invocations`: Count of persisted `ToolRequest` records in interval.
  - Decision counts and percentages: `ALLOW`, `DENY`, and `REQUIRE_APPROVAL`.
  - Total tool executions: Count of `ToolExecution` records joined through `ToolRequest`.
  - Approvals breakdown: Total, `APPROVED`, `REJECTED`, `PENDING`, and `EXPIRED`.
  - `approval_resolution_rate`: Defined as `approved / (approved + rejected)`. Evaluates to `None` (null) when the denominator is zero. Pending and expired approval requests are excluded from the resolution rate denominator.
- **Agent Analytics & Historical Denial Rate:**
  - `historical_denial_rate`: Defined strictly as `DENY decisions / total invocations in interval`.
  - *Distinction from Violation Rate:* `historical_denial_rate` reflects policy and security denials, which are standard security controls and do NOT constitute proof of agent misconduct. Empirical violations and sliding-window violation rates are tracked independently in `AgentRiskProfile.violation_rate`.
- **Tool Utilization & Execution Disconnect:**
  - `ToolExecution` status breakdown: `SUCCESS`, `FAILED`, and `TIMED_OUT`.
  - *Execution vs. Governance Disconnect:* A governance `ALLOW` outcome authorizes execution but does not guarantee downstream tool success; tools may crash or time out. Analytics explicitly tracks execution outcomes independently of governance decisions.
- **Latency Analytics:**
  - `evaluation_latency`: Pure internal latency of the VERIDEX policy decision engine from `ToolRequest.evaluation_duration_ms` (excluding nulls).
  - `execution_latency`: Downstream tool execution duration from `ToolExecution.duration_ms`.
  - Statistics calculated: `avg`, `min`, `max`, `p50`, `p95`, `p99`.

#### 4. Percentile Calculation Architecture

- **PostgreSQL Production Implementation:**
  - Utilizes native `percentile_cont(0.50 | 0.95 | 0.99) WITHIN GROUP (ORDER BY column)` executed entirely within the database engine.
- **SQLite Test Compatibility Fallback:**
  - Because SQLite lacks native percentile aggregate functions, tests utilize an isolated fallback:
    - Queries summary stats (`min`, `max`, `avg`, `count`) in SQL.
    - If `count > 0`, retrieves sorted latency values with a strict boundary (`LIMIT 10000`) and computes percentiles using linear interpolation in Python.
    - Preserves test reproducibility while preventing unbounded memory consumption.

#### 5. Read-Only Anomaly Detection Rules

The `AnomalyDetector` evaluates three statistical rules against current and baseline windows:
- **Current Window:** `[T - 1 hour, T)`
- **Baseline Window:** `[T - 7 days, T - 1 hour)`

| Rule | Trigger Condition | Effective Baseline Floor | Minimum Sample Floor | Severity |
|---|---|---|---|---|
| **Rule A: Denial-Rate Spike** | Current Denial Rate $\ge 20\%$ **AND** Current $\ge 2.5 \times$ Effective Baseline | If baseline denial rate is $0\%$, effective baseline is floored at $5\%$ ($0.05$) | Current $\ge 20$ requests, Baseline $\ge 100$ requests | `HIGH` |
| **Rule B: Critical Risk Surge** | Current Critical Risk Rate $\ge 15\%$ | N/A | Current $\ge 20$ risk assessments | `CRITICAL` |
| **Rule C: Latency SLA Degradation** | Current p95 $\ge 50$ ms **AND** Current p95 $\ge 3 \times$ Baseline p95 | N/A | Current $\ge 20$ latency samples, Baseline $\ge 100$ samples | `HIGH` |

- **Sample Size Safeguards:** If sample size requirements are not satisfied, the detector returns an explicit `INSUFFICIENT_DATA` status along with actual observed counts, preventing false-positive alerts on low-traffic intervals.

---

### Phase 8.4 — Analytics REST APIs, Authentication & Role-Based Access Control

Phase 8.4 exposes the Phase 8.3 Analytics Service through authenticated, organization-isolated REST endpoints.

#### 1. Router Architecture & Canonical Endpoints

The API router is located at `backend/app/api/v1/analytics.py` and mounted under `/api/v1/analytics` in the primary API v1 router:

| Endpoint | Method | Response Model | Description |
|---|---|---|---|
| `/api/v1/analytics/overview` | `GET` | `OverviewAnalytics` | Aggregate invocation totals, decision rates, and approval resolution statistics. |
| `/api/v1/analytics/trends` | `GET` | `TrendsAnalytics` | Time-series buckets (`hour` or `day`) with zero-filled intervals. |
| `/api/v1/analytics/risk-distribution` | `GET` | `RiskDistributionAnalytics` | Quantitative risk summary metrics and standard 10-bucket risk histogram. |
| `/api/v1/analytics/agents` | `GET` | `AgentAnalyticsResponse` | Paginated per-agent activity, historical denial rates, and trust profiles. |
| `/api/v1/analytics/tools` | `GET` | `ToolUtilizationResponse` | Paginated per-tool invocation frequency, execution success rates, and latencies. |
| `/api/v1/analytics/anomalies` | `GET` | `AnomalyReport` | Read-only statistical anomaly evaluation across current and baseline windows. |

#### 2. Strict Role-Based Access Control (RBAC)

Access to the analytics router is restricted to governance and security oversight roles:

| Role | Result | Access Policy |
|---|---|---|
| `ADMIN` | **Allowed (200)** | Full administrative visibility across organizational analytics. |
| `SECURITY_ANALYST` | **Allowed (200)** | Operational oversight, trend inspection, and anomaly investigation. |
| `AUDITOR` | **Allowed (200)** | Compliance review and historical reporting access. |
| `AGENT_OPERATOR` | **Forbidden (403)** | Operator roles are restricted to agent execution and tool invocation. |
| `VIEWER` | **Forbidden (403)** | Read-only viewer role lacks governance reporting privileges. |
| *Unauthenticated* | **Unauthorized (401)** | Missing or invalid Bearer JWT token. |

Enforced using FastAPI dependency injection via `RequireRole([Role.ADMIN, Role.SECURITY_ANALYST, Role.AUDITOR])`.

#### 3. Strict Multi-Tenant Isolation

- **Authoritative Tenant Principal:** The calling tenant's `organization_id` is derived exclusively from the authenticated JWT token (`current_user.organization_id`).
- **Query Parameter Tampering Defense:** Any attempt by a caller to pass a `?organization_id=...` query parameter is proactively intercepted and rejected with `400 Bad Request`.
- **Zero Cross-Tenant Leakage:** All underlying queries are strictly parameterized by the caller's organization UUID. Tool executions are joined through `ToolRequest` to maintain tenant boundary guarantees.

#### 4. Thin Handler Pattern & Error Mapping

- **Zero Duplication:** Endpoint handlers act strictly as thin controllers, delegating all query construction and business logic to `AnalyticsService`.
- **Exception Mapping:**
  - `InvalidTimeRangeError` $\rightarrow$ `422 Unprocessable Entity`
  - `InvalidGranularityError` $\rightarrow$ `422 Unprocessable Entity`
  - `InvalidPaginationError` $\rightarrow$ `422 Unprocessable Entity`
  - Missing credentials $\rightarrow$ `401 Unauthorized`
  - Insufficient role $\rightarrow$ `403 Forbidden`
  - Unexpected internal errors $\rightarrow$ `500 Internal Server Error` (internal stack traces and DB details suppressed)

---

### Phase 8.5 — Final Integration, Quality Assurance & Release Readiness

Phase 8.5 consolidates all four Phase 8 sub-phases into a cohesive, production-grade observability and governance analytics subsystem.

#### 1. End-to-End Governance Observability Lifecycle

```
[Agent Tool Request]
         │
         ▼
[Governance Gateway (eval_start_ns)]
   ├── Stage 1: Platform Floor & Baseline Entity Preconditions
   ├── Stage 2: Risk Precheck & Comprehensive Risk Evaluation
   ├── Stage 3: Declarative Policy Engine Evaluation & Precedence
   ├── Stage 4: Approval Synthesis
   └── Stage 5: ALLOW
         │
[eval_end_ns (evaluation_duration_ms computed)]
         │
   ├── [ToolRequest Persisted with evaluation_duration_ms]
   ├── [OpenTelemetry Spans & Bounded Metrics Recorded]
   └── [Tool Execution (if ALLOW) / HITL Approval Workflow (if REQUIRE_APPROVAL)]
         │
         ▼
[Analytics Engine & Queries (SQL Aggregations across Composite Indexes)]
         │
         ▼
[Authenticated REST APIs (/api/v1/analytics/*)]
```

#### 2. Key Architecture Guarantees Verified
- **Evaluation Timing Boundary:** Measured with monotonic clock (`time.perf_counter_ns()`) wrapping `_evaluate_policy` (Stages 1–5). Excludes argument hashing, tool execution, database transactions, and telemetry export.
- **Fail-Silent Telemetry:** Telemetry failures (e.g. collector unavailability) are caught and logged at debug level, never interrupting governance evaluations or agent operations.
- **Privacy Enforcement:** Attribute sanitization strictly excludes sensitive payload bodies, arguments hashes, idempotency keys, and credentials. Metric attributes are normalized to bounded cardinality sets.
- **Multi-Tenant Integrity:** Strict token-derived tenant principal enforcement; client query tampering rejected with `400 Bad Request`.
- **Read-Only Analytics:** Zero mutations or side effects across all six analytics endpoints.
- **Zero Regressions:** 183 of 183 automated tests passing cleanly across unit, integration, and E2E suites.
