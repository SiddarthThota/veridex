# VERIDEX — Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Phase 1 — Architecture & Scaffolding
- Created monorepo structure
- Backend scaffold: FastAPI + Pydantic v2 + SQLAlchemy 2.0
- Frontend scaffold: Next.js + React + TypeScript + Tailwind CSS
- Docker Compose: PostgreSQL 16, Redis 7, OTEL Collector, Jaeger
- Health endpoints: `/api/v1/health`, `/api/v1/ready`
- CI workflow: GitHub Actions with backend tests, security scan, frontend checks
- CLI scaffold: Typer-based commands
- Architecture documentation with Mermaid diagrams
- PowerShell dev scripts for Windows development

### Phase 0 — Environment & Discovery
- Environment assessment completed
- PROJECT_STATUS.md created
- DECISIONS.md created with 13 architectural decisions
