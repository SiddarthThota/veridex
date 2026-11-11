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
## Phase 7 Updates — Risk Engine REST APIs (`/api/v1/risk`)

The Risk Engine provides endpoints for dry-run simulation, historical assessment auditing, dynamic agent risk profile review, and organization-level risk configuration management.

### Endpoints Overview

| Method | Path | Allowed Roles | Description | Mutation Behavior |
|--------|------|---------------|-------------|-------------------|
| `POST` | `/api/v1/risk/evaluate` | `ADMIN`, `SECURITY_ANALYST`, `AGENT_OPERATOR`, `AUDITOR` | Non-mutating risk simulation using server-side metadata | **Pure read-only**: Zero records created |
| `GET` | `/api/v1/risk/assessments` | `ADMIN`, `SECURITY_ANALYST`, `AGENT_OPERATOR`, `AUDITOR` | Paginated listing of historical assessments with filters | Read-only |
| `GET` | `/api/v1/risk/assessments/{id}` | `ADMIN`, `SECURITY_ANALYST`, `AGENT_OPERATOR`, `AUDITOR` | Retrieve individual historical risk assessment | Read-only |
| `GET` | `/api/v1/risk/profiles/agents/{agent_id}` | `ADMIN`, `SECURITY_ANALYST`, `AGENT_OPERATOR`, `AUDITOR` | Retrieve empirical risk profile & 7-day violation metrics | Read-only |
| `GET` | `/api/v1/risk/config` | `ADMIN`, `SECURITY_ANALYST`, `AGENT_OPERATOR`, `AUDITOR` | Retrieve active organization risk configuration & version | Idempotent read / auto-initializes default v1 |
| `POST` | `/api/v1/risk/config/versions` | `ADMIN`, `SECURITY_ANALYST` only | Publish new immutable configuration version | **Mutating**: Appends version, locks row |

---

### 1. Risk Evaluation Simulation (`POST /api/v1/risk/evaluate`)

Performs an isolated dry-run calculation without executing tools or writing records to the database.

#### Request Payload:
```json
{
  "agent_id": "3fa85f64-5717-4562-b3fc-2c963f66afa1",
  "tool_id": "3fa85f64-5717-4562-b3fc-2c963f66afa2",
  "tool_version_id": "3fa85f64-5717-4562-b3fc-2c963f66afa3",
  "arguments": {
    "account_id": "ACC-999",
    "amount": 500000.0,
    "command": "rm -rf /"
  },
  "environment": "PRODUCTION"
}
```
#### Response (HTTP 200 OK):
```json
{
  "risk_score": 85,
  "risk_level": "CRITICAL",
  "subscores": {
    "tool": 85.0,
    "data": 100.0,
    "agent": 50.0,
    "context": 90.0
  },
  "factor_breakdown": {
    "weights": {
      "tool": 0.35,
      "data": 0.25,
      "agent": 0.20,
      "context": 0.20
    },
    "subscores": {
      "tool": 85.0,
      "data": 100.0,
      "agent": 50.0,
      "context": 90.0
    },
    "contributions": {
      "tool": 29.75,
      "data": 25.0,
      "agent": 10.0,
      "context": 18.0
    },
    "raw_score": 82.75,
    "composite_score": 83,
    "risk_level": "CRITICAL"
  },
  "heuristics_matched": [
    {
      "rule_id": "HIGH_FINANCIAL_VALUE",
      "path": "amount",
      "severity": "HIGH",
      "score_contribution": 40.0
    }
  ],
  "explanation": "Calculated composite risk score: 83 (CRITICAL). Tool risk: 85.0, Data risk: 100.0, Agent risk: 50.0, Context risk: 90.0. Agent history has insufficient sample (0/5 required); conservative baseline applied. Heuristics triggered: [HIGH_FINANCIAL_VALUE].",
  "scoring_algorithm_version": "1.0.0",
  "config_version_id": "3fa85f64-5717-4562-b3fc-2c963f66afa4",
  "simulated_at": "2026-11-09T12:00:00Z"
}
```
---

### 2. List Historical Assessments (`GET /api/v1/risk/assessments`)

Supports filtering by `agent_id`, `tool_id`, `risk_level`, `start_date`, and `end_date` with `limit` (1..100) and `offset` pagination.

#### Query Parameters:
- `agent_id`: UUID (optional)
- `tool_id`: UUID (optional)
- `risk_level`: `LOW` | `MEDIUM` | `HIGH` | `CRITICAL` (optional)
- `start_date`: ISO 8601 DateTime (optional)
- `end_date`: ISO 8601 DateTime (optional)
- `limit`: int (default: 50, min: 1, max: 100)
- `offset`: int (default: 0, min: 0)

---

### 3. Retrieve Historical Assessment (`GET /api/v1/risk/assessments/{id}`)

Returns the full immutable snapshot of a specific historical risk assessment, including bidirectional `tool_request_id`, algorithm version, 4 subscores, factor breakdown, and heuristics triggered.

---

### 4. Agent Risk Profile (`GET /api/v1/risk/profiles/agents/{agent_id}`)

Retrieves the empirical risk and trust profile for an agent based on its 7-day sliding window invocation history.

#### Response:
```json
{
  "agent_id": "3fa85f64-5717-4562-b3fc-2c963f66afa1",
  "organization_id": "3fa85f64-5717-4562-b3fc-2c963f66afa0",
  "risk_tier": "HIGH",
  "history_status": "INSUFFICIENT_DATA",
  "total_eligible_invocations": 3,
  "total_violations": 1,
  "violation_rate": 0.0,
  "calculated_trust_score": 100.0,
  "observation_window_days": 7,
  "last_assessed_at": "2026-11-09T14:30:00Z"
}
```
---

### 5. Risk Configuration (`GET /api/v1/risk/config` & `POST /api/v1/risk/config/versions`)

- `GET /api/v1/risk/config`: Returns the active configuration and its current published version.
- `POST /api/v1/risk/config/versions`: Publishes a new immutable version. Requires `ADMIN` or `SECURITY_ANALYST`.

#### Publish Version Request Payload:
```json
{
  "weight_tool": 0.35,
  "weight_data": 0.25,
  "weight_agent": 0.20,
  "weight_context": 0.20,
  "threshold_medium": 30,
  "threshold_high": 60,
  "threshold_critical": 85,
  "approval_threshold": 60,
  "deny_threshold": 90,
  "heuristic_rules": [],
  "changelog": "Standard production risk profile"
}
```
