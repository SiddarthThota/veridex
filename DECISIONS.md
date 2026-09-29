# VERIDEX — Architectural Decision Record

## ADR-001: Project Location

**Date:** 2026-09-29  
**Status:** Accepted  
**Context:** Need a clean directory for the monorepo.  
**Decision:** Use `C:\Users\sidar\.gemini\antigravity-ide\scratch\veridex\` as project root.  
**Rationale:** Standard scratch directory for the IDE. User should set this as active workspace.

---

## ADR-002: Python Dependency Management

**Date:** 2026-09-29  
**Status:** Accepted  
**Context:** `uv` is not installed. Standard `pip` + `venv` is available. Python 3.13 is installed.  
**Decision:** Use `python -m venv` for virtual environment and `pip` with `pyproject.toml` for dependency management. All dev tools (ruff, mypy, bandit, pytest) installed inside venv.  
**Rationale:** No additional tooling required. `pyproject.toml` is the modern standard. All tools stay project-scoped.

---

## ADR-003: Cross-Platform Task Runner

**Date:** 2026-09-29  
**Status:** Accepted  
**Context:** `make` is not available on Windows. CI will run on Linux (GitHub Actions).  
**Decision:** Provide both `Makefile` (for CI and Linux/macOS users) and PowerShell scripts under `scripts/` (for local Windows development). Docker Compose wraps most complex orchestration.  
**Rationale:** Makefile is the CI standard. PowerShell scripts ensure Windows-native development works.

---

## ADR-004: Docker Strategy

**Date:** 2026-09-29  
**Status:** Accepted  
**Context:** Docker 28.2.2 + Compose v2.37 installed via Docker Desktop. Daemon not currently running.  
**Decision:** Docker Compose as the primary orchestration for local development. All services (PostgreSQL, Redis, backend, frontend, OTEL collector) defined in `docker-compose.yml`. Development also supports running backend/frontend natively for faster iteration.  
**Rationale:** Docker ensures reproducible environments. Hybrid approach (Docker for infra, native for app code during dev) provides best DX.

---

## ADR-005: Backend Framework — FastAPI + Pydantic v2

**Date:** 2026-09-29  
**Status:** Accepted  
**Context:** Need async Python web framework with strong typing.  
**Decision:** FastAPI with Pydantic v2, SQLAlchemy 2.0 (async), Alembic for migrations.  
**Rationale:** FastAPI is the production standard for typed Python APIs. Pydantic v2 is dramatically faster and is the current stable release. SQLAlchemy 2.0 async mode enables non-blocking DB access.

---

## ADR-006: Frontend Framework — Next.js 15 + React 19

**Date:** 2026-09-29  
**Status:** Accepted  
**Context:** Need a professional enterprise dashboard with SSR capabilities, file-based routing, and TypeScript.  
**Decision:** Next.js (latest stable) with React, TypeScript, and CSS Modules or Tailwind (if requested). shadcn/ui for component library. Recharts or similar for data visualization.  
**Rationale:** Next.js is the enterprise standard for React applications. App Router provides modern patterns. shadcn/ui provides professional, accessible components without runtime overhead.

---

## ADR-007: Database — PostgreSQL 16

**Date:** 2026-09-29  
**Status:** Accepted  
**Context:** Need relational database with strong constraint support, UUID generation, indexing, and JSON support where appropriate.  
**Decision:** PostgreSQL 16 via Docker. Use proper relational schemas — not JSONB-for-everything.  
**Rationale:** PostgreSQL is the enterprise standard. Strong typing, constraints, and indexing are critical for an audit/governance platform.

---

## ADR-008: Authentication — JWT with bcrypt

**Date:** 2026-09-29  
**Status:** Accepted  
**Context:** Need stateless API authentication with role-based access control.  
**Decision:** JWT access tokens (short-lived) + refresh tokens. bcrypt for password hashing. Deterministic RBAC middleware.  
**Rationale:** JWT is standard for API auth. bcrypt is proven for password storage. RBAC is deterministic — never LLM-driven.

---

## ADR-009: AI Provider Abstraction

**Date:** 2026-09-29  
**Status:** Accepted  
**Context:** Must support mock mode and real LLM providers. LLM must never control security decisions.  
**Decision:** Abstract `LLMProvider` interface. Implement `MockProvider` (deterministic, no API key) and `OpenAICompatibleProvider` (real API). LLM produces structured intent → deterministic governance pipeline evaluates.  
**Rationale:** Core design principle of Veridex: AI for reasoning, deterministic code for security. Mock mode enables testing without API keys.

---

## ADR-010: Observability — OpenTelemetry

**Date:** 2026-09-29  
**Status:** Accepted  
**Context:** Need distributed tracing, metrics, and structured logging.  
**Decision:** OpenTelemetry SDK for Python. OTLP exporter to local collector. Jaeger for trace visualization. Prometheus for metrics. Structured JSON logging.  
**Rationale:** OpenTelemetry is the industry standard. Local stack enables development without cloud dependencies.

---

## ADR-011: Audit Integrity — Hash Chain

**Date:** 2026-09-29  
**Status:** Accepted  
**Context:** Audit logs must be tamper-evident.  
**Decision:** Each audit event includes a SHA-256 hash of its payload + the previous event's hash, forming a blockchain-like chain. `verify_audit_chain()` validates integrity.  
**Rationale:** Hash chains provide cryptographic tamper evidence without requiring external blockchain infrastructure.

---

## ADR-012: Disk Space Management

**Date:** 2026-09-29  
**Status:** Accepted  
**Context:** C: drive has only ~30 GB free. Docker images, node_modules, and Python venv will consume significant space.  
**Decision:** Monitor disk usage throughout development. Use `.dockerignore` and `.gitignore` aggressively. Use multi-stage Docker builds to minimize image sizes. Consider E: drive if C: becomes critically low.  
**Rationale:** Space constraints are real. Proactive management prevents build failures.

---

## ADR-013: Monorepo Structure

**Date:** 2026-09-29  
**Status:** Accepted  
**Context:** Need clear separation of concerns across backend, frontend, agent simulator, evaluations, and infrastructure.  
**Decision:** Single Git repository with top-level directories: `backend/`, `frontend/`, `agent-simulator/`, `evals/`, `security-tests/`, `scripts/`, `docs/`, `otel/`, `docker/`, `fixtures/`, `.github/`.  
**Rationale:** Monorepo enables atomic changes across the stack while maintaining clear module boundaries. Each subdirectory has its own dependency management.
