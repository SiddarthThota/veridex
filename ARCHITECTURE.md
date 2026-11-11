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
