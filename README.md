# VERIDEX

## Govern AI Agents Before They Act.

**AI Agent Governance, Security, Audit & Observability Platform**

---

## What is Veridex?

Veridex is an enterprise-grade control plane that governs AI agents and their actions. It intercepts every agent tool call through a deterministic governance pipeline that validates identity, enforces policies, calculates risk, requires human approval for critical actions, produces tamper-evident audit trails, detects security threats, and provides end-to-end observability.

## Problem

AI agents are increasingly autonomous — choosing tools, accessing data, and making decisions. Without a governance layer:

- Agents can execute unauthorized actions
- Tool access is ungoverned
- There's no audit trail for AI decisions
- Risk is invisible
- Security threats go undetected
- Compliance is impossible to verify

## Architecture

```
User → Agent → Governance Gateway → Policy Engine → Risk Engine → Approval → Tool Execution → Audit
```

Every tool request passes through the **Governance Gateway**, which enforces:

1. **Identity validation** — Who is the agent? Who delegated the task?
2. **Authorization** — Is the agent allowed to use this tool?
3. **Input validation** — Are the arguments safe and well-formed?
4. **Policy evaluation** — What do versioned policies say about this action?
5. **Risk calculation** — What's the explainable risk score (0–100)?
6. **Security checks** — Are there indicators of prompt injection, privilege escalation, or data exfiltration?
7. **Approval check** — Does this action require human approval?

**Core design principle:** LLMs are used for reasoning and classification. Security decisions are always deterministic code.

## Features

- 🔐 **Agent Registry** — Register, version, and manage AI agents
- 🔧 **Tool Registry** — Governed tool definitions with risk levels and permissions
- 🛡️ **Governance Gateway** — Central control point for all tool executions
- 📋 **Policy Engine** — Versioned, deterministic policy evaluation
- ⚡ **Risk Engine** — Explainable risk scoring with signal decomposition
- ✅ **Human Approval** — Workflow for high-risk actions
- 📝 **Audit Log** — Tamper-evident hash-chained event trail
- 🔍 **Security Detection** — Prompt injection, privilege escalation, anomaly detection
- 🚨 **Incident System** — Evidence-linked security incidents
- 🤖 **AI Integration** — Provider abstraction (Mock + OpenAI-compatible)
- 📊 **Observability** — OpenTelemetry traces, metrics, structured logs
- 📈 **Evaluation Framework** — Measurable agent governance evaluation
- 💻 **Enterprise Dashboard** — Professional React/Next.js UI

## Tech Stack

| Layer          | Technology                                         |
|----------------|---------------------------------------------------|
| Backend        | Python, FastAPI, Pydantic v2, SQLAlchemy 2.0      |
| Database       | PostgreSQL 16, Redis 7                            |
| Frontend       | Next.js, React, TypeScript, Tailwind CSS          |
| AI             | OpenAI-compatible, Mock provider                   |
| Auth           | JWT, bcrypt, RBAC                                  |
| Observability  | OpenTelemetry, Jaeger, Prometheus                  |
| DevOps         | Docker, Docker Compose, GitHub Actions             |
| CLI            | Typer                                              |

## Quick Start

### Prerequisites

- Python 3.12+
- Node.js 22+
- Docker & Docker Compose

### Setup

```bash
# Clone the repository
git clone <repo-url>
cd veridex

# Copy environment configuration
cp .env.example .env

# Start all services
docker compose up --build

# Or run locally:

# Backend
cd backend
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -e ".[dev]"
uvicorn app.main:app --reload

# Frontend
cd frontend
npm install
npm run dev
```

### Endpoints

| Service    | URL                        |
|-----------|----------------------------|
| Backend   | http://localhost:8000      |
| Frontend  | http://localhost:3000      |
| API Docs  | http://localhost:8000/docs |
| Jaeger    | http://localhost:16686     |

## Security Model

See [SECURITY.md](SECURITY.md) and [THREAT_MODEL.md](THREAT_MODEL.md).

## Testing

```bash
# Backend tests
cd backend && python -m pytest tests/ -v

# Lint
python -m ruff check app/

# Type check
python -m mypy app/

# Security scan
python -m bandit -r app/
```

## Project Status

See [PROJECT_STATUS.md](PROJECT_STATUS.md) for current phase and progress.

## Documentation

- [ARCHITECTURE.md](ARCHITECTURE.md) — System architecture
- [SECURITY.md](SECURITY.md) — Security model
- [THREAT_MODEL.md](THREAT_MODEL.md) — Threat analysis
- [API_GUIDE.md](API_GUIDE.md) — API reference
- [DEMO_GUIDE.md](DEMO_GUIDE.md) — Demo walkthrough
- [OPERATIONS.md](OPERATIONS.md) — Operations guide
- [DECISIONS.md](DECISIONS.md) — Architectural decisions
- [EVALUATION.md](EVALUATION.md) — Evaluation framework

## License

MIT
