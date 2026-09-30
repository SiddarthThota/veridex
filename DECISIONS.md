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
