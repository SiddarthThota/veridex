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

---

## Phase 6 — Policy Engine (`/api/v1/policies`)

The Policy Engine provides declarative, versioned policy management with immutable published snapshots, fine-grained AST condition evaluation, and organization multi-tenancy.

### Policy Management Endpoints

| Method | Path | Required Role | Description |
|--------|------|---------------|-------------|
| POST | `/api/v1/policies` | ADMIN, SECURITY_ANALYST | Create policy container with initial draft v1 |
| GET | `/api/v1/policies` | Authenticated (Any role) | List policies with pagination (`limit`, `offset`) and filters (`type`, `status`) |
| GET | `/api/v1/policies/{policy_id}` | Authenticated (Any role) | Get policy details with active version and rules |
| PUT / PATCH | `/api/v1/policies/{policy_id}` | ADMIN, SECURITY_ANALYST | Update policy container metadata and priority |
| PATCH | `/api/v1/policies/{policy_id}/status` | ADMIN, SECURITY_ANALYST | Transition policy lifecycle state (`DRAFT` → `ACTIVE` → `INACTIVE` → `ARCHIVED`) |
| DELETE | `/api/v1/policies/{policy_id}` | ADMIN, SECURITY_ANALYST | Archive policy container (soft-retire for audit retention) |

### Versioning & Rule Management Endpoints

| Method | Path | Required Role | Description |
|--------|------|---------------|-------------|
| POST | `/api/v1/policies/{policy_id}/versions` | ADMIN, SECURITY_ANALYST | Branch new DRAFT version, cloning rules from current version |
| GET | `/api/v1/policies/{policy_id}/versions` | Authenticated (Any role) | List all historical versions of a policy |
| GET | `/api/v1/policies/{policy_id}/versions/{version_id}` | Authenticated (Any role) | Inspect a specific immutable version and its rules |
| POST | `/api/v1/policies/{policy_id}/versions/{version_id}/publish` | ADMIN, SECURITY_ANALYST | Publish draft version, retire old versions, and atomically activate |
| POST | `/api/v1/policies/{policy_id}/versions/{version_id}/rules` | ADMIN, SECURITY_ANALYST | Add rule to DRAFT version (returns 409 Conflict if published) |
| PUT / PATCH | `/api/v1/policies/{policy_id}/versions/{version_id}/rules/{rule_id}` | ADMIN, SECURITY_ANALYST | Update rule in DRAFT version (returns 409 Conflict if published) |
| DELETE | `/api/v1/policies/{policy_id}/versions/{version_id}/rules/{rule_id}` | ADMIN, SECURITY_ANALYST | Delete rule from DRAFT version (returns 409 Conflict if published) |

### Dry-Run Policy Simulation

| Method | Path | Required Role | Description |
|--------|------|---------------|-------------|
| POST | `/api/v1/policies/simulate` | ADMIN, SECURITY_ANALYST, AUDITOR, AGENT_OPERATOR | Simulate policy evaluation without side effects |

#### Policy Creation Request:
```json
{
  "name": "Financial Transfer Limits",
  "description": "Block unauthorized high-value transfers",
  "policy_type": "FINANCIAL",
  "priority": 100,
  "default_action": "DENY"
}
```

#### Rule Creation Request (on DRAFT version):
```json
{
  "rule_name": "Limit Transfers to $10,000",
  "description": "Deny single transactions exceeding $10,000",
  "rule_order": 1,
  "action": "DENY",
  "violation_code": "AMOUNT_EXCEEDED",
  "remediation_message": "Transfer amount must not exceed $10,000 without executive override",
  "target_scope": {
    "tool_ids": [],
    "agent_environments": ["PRODUCTION"]
  },
  "condition_tree": {
    "combinator": "AND",
    "conditions": [
      {
        "field": "arguments.amount",
        "operator": "GREATER_THAN",
        "value": 10000
      }
    ]
  }
}
```

#### Simulation Request:
```json
{
  "agent_id": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  "tool_id": "3fa85f64-5717-4562-b3fc-2c963f66afa7",
  "tool_version_id": "3fa85f64-5717-4562-b3fc-2c963f66afa8",
  "arguments": {
    "amount": 15000
  },
  "environment": "PRODUCTION"
}
```

#### Simulation Response:
```json
{
  "decision": "DENY",
  "violation_codes": ["AMOUNT_EXCEEDED"],
  "remediation_messages": ["Transfer amount must not exceed $10,000 without executive override"],
  "matched_policies": [
    {
      "policy_id": "3fa85f64-5717-4562-b3fc-2c963f66afa1",
      "policy_slug": "financial-transfer-limits",
      "policy_version_id": "3fa85f64-5717-4562-b3fc-2c963f66afa2",
      "version_number": 1,
      "matched_rules": [
        {
          "rule_id": "3fa85f64-5717-4562-b3fc-2c963f66afa3",
          "rule_name": "Limit Transfers to $10,000",
          "action": "DENY",
          "violation_code": "AMOUNT_EXCEEDED",
          "remediation_message": "Transfer amount must not exceed $10,000 without executive override"
        }
      ]
    }
  ],
  "simulated_at": "2026-11-08T10:00:00Z"
}
```
