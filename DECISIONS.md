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
