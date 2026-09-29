# VERIDEX — API Guide

> This document will be expanded as API endpoints are implemented.

## Base URL

```
http://localhost:8000/api/v1
```

## Available Endpoints

### Health
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/health` | Application health check |
| GET | `/api/v1/ready` | Readiness check with dependency status |

### Planned API Areas
- `/api/v1/auth` — Authentication (Phase 2)
- `/api/v1/users` — User management (Phase 2)
- `/api/v1/agents` — Agent registry (Phase 3)
- `/api/v1/tools` — Tool registry (Phase 4)
- `/api/v1/policies` — Policy management (Phase 6)
- `/api/v1/runs` — Agent runs (Phase 5)
- `/api/v1/traces` — Distributed traces (Phase 12)
- `/api/v1/risk` — Risk analytics (Phase 7)
- `/api/v1/approvals` — Human approval workflow (Phase 8)
- `/api/v1/audit` — Audit log (Phase 9)
- `/api/v1/security` — Security events (Phase 13)
- `/api/v1/incidents` — Incident management (Phase 13)
- `/api/v1/evaluations` — Evaluation results (Phase 14)

## Response Format

All responses follow a consistent format:

```json
{
  "status": "string",
  "data": {},
  "message": "string (optional)"
}
```

## Error Format

```json
{
  "detail": "Error description"
}
```
