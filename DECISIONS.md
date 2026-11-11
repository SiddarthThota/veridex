# Veridex - Architecture & Design Decisions

## Phase 0 - Environment & Discovery
- Decided to proceed with Python 3.13 and FastAPI as the core backend stack.
- Next.js (TypeScript) chosen for the frontend to enable robust SPA capabilities.
- OpenTelemetry and Jaeger integrated from the start for deep observability into agent reasoning.

## Phase 1 - Architecture & Scaffolding
- Adopted an API router aggregation pattern (e.g. `/api/v1/router.py`) to keep route organization modular.
- Chosen `docker-compose` as the primary local development orchestration to manage database, caching, backend, and observability services uniformly.

## Phase 2 - Database & Authentication
- **Port Conflict Resolution**: Modified `docker-compose.yml` to map PostgreSQL to host port `5433` (internal `5432`) to avoid conflicts with other local projects.
- **Async DB Migration fix**: Handled Alembic + Asyncio hang on Windows by setting `asyncio.WindowsSelectorEventLoopPolicy` in `alembic/env.py`.
- **Database Modeler**: Implemented `Organization`, `User`, and Enum-based `Role` models via SQLAlchemy `DeclarativeBase` with UUID mixins for primary keys.
- **Authentication**: Used `passlib[bcrypt]` for password hashing (as requested via `pyproject.toml` dependencies). JWT tokens utilized for stateless and verifiable session management.
- **Authorization**: Introduced a deterministic RBAC layer with a `RequireRole` FastAPI dependency to ensure that route access control is enforced consistently via code rather than delegating it to the LLM. 

### Phase 2: Database and Auth
- Fixed Alembic asyncio test hang on Windows by patching env.py to use WindowsSelectorEventLoopPolicy.
- Fixed Pytest teardown connection leak issues by using --asyncio-mode=auto and scoping event loops to session.
- Opted to use explicit Pydantic models for response parsing rather than directly returning SQLAlchemy objects to avoid lazy-load detaching issues.

## Phase 3 - Agent Registry
- Implemented Agent and AgentVersion domain models.
- Ensured teardown handles soft-deleted agents properly during pytest to prevent cascade-restrict Foreign Key violations.

## Phase 4 - Tool Registry
- Implemented `Tool` and `ToolVersion` domains to act as the authoritative source of agent actions.
- Categorized tools tightly with explicit `risk_level`, `access_type`, `reversibility`, `data_classification`, and `approval_requirement` to inform future policy decisions.
- Default-deny architecture enforced by creating a relational `agent_tool_permissions` mapping table instead of storing arrays on the agent or tool.
- Extended RBAC layer to ensure tools are strictly isolated by `organization_id`.

## Phase 5 - Governance Gateway & Execution Isolation
- **ADR-005: Deterministic Default-Deny Governance Gateway & Sandboxing**
  - **Context:** Allowing AI agents to directly invoke backend tools introduces severe risks including privilege escalation, prompt injection, unauthorized mutations, and state desynchronization.
  - **Decision:**
    1. *Deterministic Default-Deny:* Every invocation intent must be captured as a `ToolRequest` and pass through `GovernanceService._evaluate_policy`. Outcomes are strictly `ALLOW`, `DENY`, or `REQUIRE_APPROVAL`.
    2. *Strict Decision Precedence:* Hard identity, active status, tool version publication, agent permission, and schema validation failures result immediately in `DENY`. Risk-based human approval is evaluated only after all mandatory security checks succeed.
    3. *Exact ToolVersion Binding:* Every `ToolRequest` must reference a published, immutable `ToolVersion`.
    4. *Cryptographic Approval Integrity:* Tool arguments and versions are hashed via canonical SHA-256 (`compute_arguments_hash`). Approving an action re-verifies this hash before execution, preventing payload tampering or replay.
    5. *Role Separation:* Agent Operators who initiate runs/requests cannot approve them. Approval actions are restricted strictly to `ADMIN` and `SECURITY_ANALYST`.
    6. *Execution Sandboxing:* Handlers are restricted to a closed trusted registry (`calculator`, `echo`, `system-status`, `data-lookup`). Arbitrary Python, shell commands, or unvetted scripts are strictly rejected. Timeouts are enforced via `asyncio.wait_for` and failures are persisted.
    7. *Dry-Run Safety:* The `/api/v1/governance/evaluate` endpoint guarantees zero execution side effects and no database mutations.
  - **Consequences:** Provides an enterprise-grade, deterministic, and auditable security perimeter around agent execution. Eliminates execution of unvetted code while enabling controlled human oversight.

## Phase 6 - Policy Engine
- **ADR-006: Versioned Immutable Policy Engine and Multi-Tier Precedence**
  - **Context:** While the Phase 5 Governance Gateway establishes baseline safety floor checks, enterprise deployments require dynamic, fine-grained organizational policies (e.g., spending limits, environment restrictions, restricted time windows, parameter validations). These policies must be declarative, deterministic, versioned, auditable, and impossible to bypass or compromise via ReDoS or arbitrary code execution.
  - **Decision:**
    1. *Immutable Policy Versioning:* Policies (`Policy`) own versioned snapshots (`PolicyVersion`) containing ordered rules (`PolicyRule`). When a version is published, its rules and definition become permanently frozen and immutable. Modifications require branching a new draft version.
    2. *Multi-Tier Decision Precedence:*
       - *Tier 1 (Mandatory Platform Safety Floor):* Agent status, tool registration, published tool version, agent-tool permission mapping, and JSON schema validation take absolute precedence. A Tier 2 policy rule can never override a Tier 1 failure.
       - *Tier 2 (Active Organization Policies):* Evaluated by priority (descending) and rule order (ascending). `DENY` takes absolute precedence across rules. `REQUIRE_APPROVAL` overrides `ALLOW`. `ALLOW` requires all matching rules across active policies to grant access.
       - *Tier 3 (Platform Fallback Baseline):* If no rules match, the policy default action and platform risk/classification baseline are applied.
    3. *Safe AST Condition Evaluator:* Dynamic code execution (`eval`, `exec`) is completely banned. Condition trees are evaluated via a deterministic AST interpreter with strict structural limits (depth <= 5, condition count <= 20, payload <= 64KB, string length <= 1024).
    4. *ReDoS Immunity via Google RE2:* Replaced backtracking regex evaluation with Google RE2 (`google-re2`), a linear-time DFA/NFA automata engine. Guarantees mathematical $O(n)$ time complexity in input size, rendering catastrophic backtracking impossible without thread pools, timeouts, or worker task queues.
    5. *Auditability & Verification:* Every evaluated `ToolRequest` stores structured `policy_evaluations` JSON tracking matched policy IDs, versions, rule IDs, and violation codes.
    6. *Simulation / Dry-Run Endpoint:* `POST /api/v1/policies/simulate` provides pre-flight dry-run evaluation without state mutations or execution.
  - **Consequences:** Enables flexible, declarative, organization-specific policy governance while maintaining mathematical determinism, ReDoS immunity, multi-tenant isolation, and complete audit reproducibility.

## Phase 7 - Risk Engine & Dynamic Context Assessment
- **ADR-007: Four-Vector Deterministic Risk Scoring & 5-Stage Precedence Pipeline**
  - **Context:** While Phase 5 established baseline floor checks and Phase 6 enabled declarative AST policy rules, enterprise agent deployments require holistic quantitative risk scoring. Agent actions vary dynamically based on tool blast radius, sensitive data classification, agent history/trustworthiness, runtime context, and malicious argument patterns. This risk scoring must be deterministic, mathematically normalized, auditable, and seamlessly integrated into the Governance Gateway decision pipeline without client trust.
  - **Decision:**
    1. *Four-Vector Scoring Engine:*
       - **Tool Risk ($S_{\text{tool}}$, weight 0.35):** Base risk tier (LOW: 0, MEDIUM: 25, HIGH: 60, CRITICAL: 100), access type (READ: 0, WRITE: 50), reversibility (REVERSIBLE: 0, IRREVERSIBLE: 100).
       - **Data Risk ($S_{\text{data}}$, weight 0.25):** Data classification (PUBLIC: 0, INTERNAL: 25, CONFIDENTIAL: 60, RESTRICTED: 100), approval requirement (NOT_REQUIRED: 0, OPTIONAL: 50, REQUIRED: 100).
       - **Agent Risk ($S_{\text{agent}}$, weight 0.20):** Base risk tier (LOW: 0, MEDIUM: 25, HIGH: 60, CRITICAL: 100) combined with an empirical 7-day sliding-window violation rate ($N \le 50$). When $N < 5$, `INSUFFICIENT_DATA` conservative baseline (100 trust) applies.
       - **Runtime Context Risk ($S_{\text{context}}$, weight 0.20):** Environment (DEVELOPMENT: 0, STAGING: 25, PRODUCTION: 60) plus declarative and built-in argument heuristics (e.g., destructive command patterns, SQL injections, excessive limits, high financial values), clamped to [0, 100].
    2. *5-Stage Gateway Decision Precedence Pipeline:*
       - **Stage 1 (Mandatory Platform Safety Floor):** Evaluates agent status, tool registration, published tool version, explicit permission, and JSON Schema argument validation. Any failure returns immediate hard `DENY`.
       - **Stage 2 (Risk Denial Pre-Check):** If $S_{\text{composite}} \ge \text{deny\_threshold}$ (default 90), returns immediate `DENY` with `CRITICAL_RISK_THRESHOLD_EXCEEDED` before policy rules run.
       - **Stage 3 (Declarative Policy Engine Evaluation):** Evaluates organization policies enriched with trusted server-side `context.risk_score` and `context.risk_level`. Policy `DENY` is absolute. Policy `ALLOW` can **never** override a Stage 2 risk DENY or platform safety failure.
       - **Stage 4 (Approval Synthesis):** If $S_{\text{composite}} \ge \text{approval\_threshold}$ (default 60), synthesizes `REQUIRE_APPROVAL`. Platform baseline approval safety triggers cannot be overridden by policy `ALLOW`.
       - **Stage 5 (Clean ALLOW):** Granted only when all baseline checks, risk thresholds, and policy rules permit execution.
    3. *Immutable Risk Configuration Versioning:*
       - Multi-tenant risk configurations (`RiskConfiguration`) own immutable version snapshots (`RiskConfigurationVersion`).
       - Publishing requires `ADMIN` or `SECURITY_ANALYST` role and enforces transactional row locking (`with_for_update()`) to prevent race conditions.
       - Rigorous mathematical validation: weights sum to $1.00 \pm 0.001$, monotonicity of risk level thresholds, and action threshold alignment ($\text{approval\_threshold} \le \text{deny\_threshold}$).
    4. *Bidirectional Risk Assessment Persistence & Reproducibility:*
       - Every live evaluation persists an immutable `RiskAssessment` record bidirectionally linked with `ToolRequest`.
       - Stores full configuration snapshot, scoring algorithm version, 4 subscores, factor breakdown, heuristic matches, and human-readable explanation.
    5. *Dry-Run Simulation Safety:*
       - `POST /api/v1/risk/evaluate` resolves server-side metadata and computes comprehensive risk telemetry without creating or mutating any database records.
    6. *Fail-Closed Architecture:*
       - Any exception during risk scoring or assessment persistence causes the transaction to roll back and emit a fail-closed `DENY` (`RISK_EVALUATION_FAILED`), ensuring unvetted actions are never executed.
  - **Consequences:** Delivers a mathematically deterministic, transparent, and auditable risk scoring engine that seamlessly coordinates with declarative policies while upholding zero-trust guarantees and strict tenant isolation.
