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

## Phase 2 Updates
- POST /api/v1/auth/login: Accepts OAuth2 form data to return JWT.
- GET /api/v1/users/me: Returns current authenticated user.
- GET /api/v1/users: Lists users (Admin only).
- GET /api/v1/organizations: Lists organizations (Admin only).

## Phase 3 Updates
- POST /api/v1/agents: Creates an agent (Admin/Agent Operator).
- GET /api/v1/agents/{agent_id}: Get specific agent details.
- GET /api/v1/agents: List agents for the authenticated user's organization.

## Phase 4 Updates
- POST /api/v1/tools: Creates a tool (Admin/Agent Operator).
- POST /api/v1/tools/{tool_id}/versions: Publish new tool versions.
- POST /api/v1/agents/{agent_id}/tools/{tool_id}: Grant an agent permission to use a tool.
- GET /api/v1/agents/{agent_id}/tools: View tools authorized for a given agent.

## Phase 5 Updates — Governance Gateway & Execution Isolation

### Agent Runs (`/api/v1/runs`)

| Method | Path | Required Role | Description |
|--------|------|---------------|-------------|
| POST | `/api/v1/runs` | ADMIN, AGENT_OPERATOR | Create a new agent execution run/session |
| GET | `/api/v1/runs` | Any authenticated | List agent runs (supports filtering by `agent_id` and `status`) |
| GET | `/api/v1/runs/{run_id}` | Any authenticated | Retrieve detailed status and telemetry for a specific run |
| PATCH | `/api/v1/runs/{run_id}/status` | ADMIN, AGENT_OPERATOR | Update the lifecycle status of an agent run (`RUNNING`, `COMPLETED`, `FAILED`, `CANCELLED`) |
| POST | `/api/v1/runs/{run_id}/invocations` | ADMIN, AGENT_OPERATOR | Invoke a tool within a run through the deterministic Governance Gateway |
| GET | `/api/v1/runs/{run_id}/invocations` | Any authenticated | List all tool invocation requests and execution outcomes for a run |

#### Tool Invocation Request Payload:
```json
{
  "tool_id": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  "tool_version_id": "3fa85f64-5717-4562-b3fc-2c963f66afa7",
  "arguments": {
    "expression": "42 * 2"
  },
  "idempotency_key": "inv-001"
}
```

#### Tool Invocation Response:
```json
{
  "decision": "ALLOW",
  "violation_codes": [],
  "tool_request_id": "3fa85f64-5717-4562-b3fc-2c963f66afa8",
  "execution": {
    "id": "3fa85f64-5717-4562-b3fc-2c963f66afa9",
    "status": "COMPLETED",
    "output_payload": {"result": 84},
    "error_message": null,
    "duration_ms": 12.5
  },
  "approval_request_id": null
}
```

### Governance & Approvals (`/api/v1/governance`)

| Method | Path | Required Role | Description |
|--------|------|---------------|-------------|
| POST | `/api/v1/governance/evaluate` | Any authenticated | Dry-run governance evaluation without tool execution or state creation |
| GET | `/api/v1/governance/approvals` | Any authenticated | List pending and decided approval requests |
| GET | `/api/v1/governance/approvals/{approval_id}` | Any authenticated | Get detailed view of an approval request with originating tool intent |
| POST | `/api/v1/governance/approvals/{approval_id}/decide` | ADMIN, SECURITY_ANALYST | Approve or reject a pending approval request (Agent Operator forbidden) |

#### Governance Dry-Run Evaluation Request:
```json
{
  "agent_id": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  "tool_id": "3fa85f64-5717-4562-b3fc-2c963f66afa7",
  "tool_version_id": "3fa85f64-5717-4562-b3fc-2c963f66afa8",
  "arguments": {
    "action": "delete_all"
  }
}
```

#### Governance Dry-Run Evaluation Response:
```json
{
  "decision": "REQUIRE_APPROVAL",
  "violation_codes": ["APPROVAL_REQUIRED"],
  "requires_approval": true,
  "message": "Evaluation decision: REQUIRE_APPROVAL"
}
```

#### Approval Decision Request:
```json
{
  "decision": "APPROVED",
  "reason": "Verified maintenance window with database team."
}
```
*Note: Approving automatically re-validates argument integrity hashes against the published tool version before triggering safe isolated execution.*
