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
