# VERIDEX — PHASE 9.6 ARCHITECTURE SPECIFICATION
## Agent & Tool Registries with Execution Forensics

**Milestone:** Phase 9.6 — Agent Fleet Registry, Governed Tool Catalog, Version Lifecycle Management, and Execution Forensics Workbench  
**Backend Baseline:** FastAPI v0.8.0 (`commit 091f28416c77fc0a38679b54f03b5a4b06731b82`)  
**Frontend Baseline:** Next.js App Router v0.9.5 (`commit 55c870f8cf7d23e99010ded119b0aabb2af7f25d`)  
**Status:** Reconciled Architectural Design — Awaiting Project Owner Authorization for Implementation  

---

## 1. Executive Summary

Phase 9.6 represents the operational core of the VERIDEX Security Operations Center (SecOps). While Phase 9.3 provided observational analytics, Phase 9.4 provided human-in-the-loop approval gating, and Phase 9.5 provided declarative policy and quantitative risk engines, **Phase 9.6 operationalizes the entities and execution sessions governed by the platform**.

Phase 9.6 delivers three cohesive, enterprise-grade workbenches:
1. **Agent Fleet Registry (`/agents`):** Complete catalogue of registered AI agent profiles, risk tier assignments, active model provider/name specifications, immutable version history snapshots, permitted tool bindings, and sliding-window empirical trust scores.
2. **Governed Tool Catalog (`/tools`):** Authoritative registry of system and custom tools, sensitivity classifications, reversibility flags, approval gating requirements, rate limits, execution timeouts, JSON Schemas for inputs/outputs, and immutable tool version publishing.
3. **Execution Forensics & Audit Trail (`/runs` and `/runs/[id]`):** Deep-inspection session and tool invocation forensics. Correlates top-level agent run sessions with step-by-step tool requests, governance decision verdicts (ALLOW, DENY, REQUIRE_APPROVAL), violation codes, policy rule evaluations, empirical risk assessments, approval review rationales, execution outputs, and millisecond-level telemetry.

### Core Architectural Invariants
- **Same-Origin BFF Proxy:** All data flows through `/api/bff/agents/*`, `/api/bff/tools/*`, `/api/bff/runs/*`, `/api/bff/governance/*`, and `/api/bff/risk/*`. The browser never interacts directly with FastAPI and never handles raw JWT tokens.
- **Strict VIEWER Access Boundary:** The backend v0.8.0 explicitly denies `VIEWER` access to `/api/v1/runs`, `/api/v1/runs/{id}`, and `/api/v1/runs/{id}/invocations`. `VIEWER` cannot access run records, invocation records, or forensic details in any form (masked or unmasked). Enforced at the server-side BFF reverse proxy, in route middleware, and in navigation.
- **Deep Execution Error Safety:** Raw Python stack traces, internal filesystem paths, database URIs, environment variables, and framework guts are never rendered. Error messages are sanitized through recursive scrubbing before presentation.
- **Recursive Sensitive-Data Redaction:** Invocation arguments and execution outputs undergo recursive redaction before DOM rendering, covering nested objects, arrays, sensitive key patterns, and high-entropy secret value patterns (API keys, JWTs, private keys, connection strings).
- **Clipboard & Plaintext Reveal Controls:** Clipboard copying defaults to masked data across all roles. Plaintext reveal and unmasked copying are restricted strictly to `ADMIN` and `SECURITY_ANALYST`.
- **Accurate Agent Version Semantics:** The backend v0.8.0 does not provide an agent-version publishing endpoint. Newly created `AgentVersion` records are immutable `DRAFT` snapshots; the root `Agent` entity defines the current active model and status. No false "Publish" action is displayed for agent versions.
- **Zero Mock Data:** Built entirely on actual backend FastAPI v0.8.0 database models and REST endpoints.
- **Zero New Dependencies:** Implemented using standard React 19, TypeScript 5, Tailwind CSS 4, and native Web APIs.

---

## 2. Verified Current-State Architecture

### 2.1 Backend Baseline (FastAPI v0.8.0)
The backend implementation contains complete services, models, and endpoints for agents, tools, runs, governance evaluations, and risk scoring:
- **`app.agents` (`backend/app/agents/`):** Manages `Agent` and `AgentVersion` entities with unique organizational slugs, lifecycle statuses (`DRAFT`, `ACTIVE`, `SUSPENDED`, `DEACTIVATED`), and version tracking (`AgentVersionStatus`: `DRAFT`, `PUBLISHED`, `RETIRED`).
- **`app.tools` (`backend/app/tools/`):** Manages `Tool`, `ToolVersion`, and `AgentToolPermission` entities. Controls sensitivity attributes (`access_type`: READ/WRITE, `reversibility`: REVERSIBLE/IRREVERSIBLE, `risk_level`: LOW/MEDIUM/HIGH/CRITICAL, `data_classification`: PUBLIC/INTERNAL/CONFIDENTIAL/RESTRICTED, `approval_requirement`: NOT_REQUIRED/OPTIONAL/REQUIRED).
- **`app.governance` (`backend/app/governance/`):** Orchestrates `AgentRun`, `ToolRequest`, `ToolExecution`, and `ApprovalRequest`. Computes deterministic SHA-256 argument integrity hashes (`compute_arguments_hash`), enforces default-deny governance, and logs evaluation duration.
- **`app.risk` (`backend/app/risk/`):** Empirical agent risk profiles (`AgentRiskProfile`) and immutable historical risk assessment records (`RiskAssessment`).

### 2.2 Frontend Baseline (Next.js v0.9.5)
- **Framework:** Next.js 16.3.7 App Router, React 19.2.8, TypeScript 5, Tailwind CSS 4.
- **BFF Reverse Proxy (`/api/bff/[...path]/route.ts`):** `ALLOWED_API_DOMAINS` already includes `"agents"`, `"tools"`, `"runs"`, `"governance"`, `"risk"`, and `"policies"`. Validates CSRF origins on mutating requests (`POST`, `PATCH`, `DELETE`) and decrypts HttpOnly session cookies.
- **Permissions Module (`src/lib/permissions.ts`):** Contains `canManageAgents`, `canManageTools`, `canManageRuns`, and route permissions.
- **Existing Shells:** Preliminary Phase 9.2 placeholder cards currently exist at `src/app/agents/page.tsx`, `src/app/tools/page.tsx`, and `src/app/runs/page.tsx`.

---

## 3. Backend Endpoint Inventory (28 Audited Endpoints)

All endpoints have been verified against the v0.8.0 backend source code (`backend/app/api/v1/agents.py`, `backend/app/api/v1/tools.py`, `backend/app/api/v1/runs.py`, `backend/app/api/v1/governance.py`, and `backend/app/api/v1/risk.py`).

### 3.1 Workstream A: Agent Registry Endpoints (12 Endpoints)

| # | HTTP Method | Backend Path | BFF Proxy Path | Permitted Roles | Description | Mutation? |
|---|-------------|--------------|----------------|-----------------|-------------|:---------:|
| 1 | `POST` | `/api/v1/agents` | `/api/bff/agents` | `ADMIN`, `AGENT_OPERATOR` | Create agent profile with auto-generated slug and initial draft version `0.1.0` | **Yes** |
| 2 | `GET` | `/api/v1/agents` | `/api/bff/agents` | All 5 Roles | List paginated agents within the organization (`skip`, `limit`) | No |
| 3 | `GET` | `/api/v1/agents/{id}` | `/api/bff/agents/{id}` | All 5 Roles | Retrieve single agent detail (403 if foreign organization) | No |
| 4 | `PATCH` | `/api/v1/agents/{id}` | `/api/bff/agents/{id}` | `ADMIN`, `AGENT_OPERATOR` | Update description, environment, or owner (owner must be in same org) | **Yes** |
| 5 | `POST` | `/api/v1/agents/{id}/activate` | `/api/bff/agents/{id}/activate` | `ADMIN`, `AGENT_OPERATOR` | Transition agent state to `ACTIVE` (from `DRAFT` or `SUSPENDED`) | **Yes** |
| 6 | `POST` | `/api/v1/agents/{id}/suspend` | `/api/bff/agents/{id}/suspend` | `ADMIN`, `AGENT_OPERATOR` | Transition agent state to `SUSPENDED` (from `ACTIVE`) | **Yes** |
| 7 | `POST` | `/api/v1/agents/{id}/deactivate` | `/api/bff/agents/{id}/deactivate` | `ADMIN`, `AGENT_OPERATOR` | Soft-delete agent to `DEACTIVATED` (409 if already deactivated) | **Yes** |
| 8 | `GET` | `/api/v1/agents/{id}/versions` | `/api/bff/agents/{id}/versions` | All 5 Roles | List all versions for an agent (plain list, ordered by `created_at desc`) | No |
| 9 | `POST` | `/api/v1/agents/{id}/versions` | `/api/bff/agents/{id}/versions` | `ADMIN`, `AGENT_OPERATOR` | Branch new version in `DRAFT` (requires `?version_string=...`, 409 on duplicate) | **Yes** |
| 10 | `GET` | `/api/v1/agents/{id}/tools` | `/api/bff/agents/{id}/tools` | All 5 Roles | List tool permissions for an agent (`tool_id`, `allowed`, `created_at`) | No |
| 11 | `POST` | `/api/v1/agents/{id}/tools/{tool_id}` | `/api/bff/agents/{id}/tools/{tool_id}` | `ADMIN`, `AGENT_OPERATOR` | Grant tool permission to agent (creates or updates `allowed=True`) | **Yes** |
| 12 | `DELETE` | `/api/v1/agents/{id}/tools/{tool_id}` | `/api/bff/agents/{id}/tools/{tool_id}` | `ADMIN`, `AGENT_OPERATOR` | Revoke tool permission from agent (hard delete from permission table) | **Yes** |

### 3.2 Workstream B: Tool Registry Endpoints (11 Endpoints)

| # | HTTP Method | Backend Path | BFF Proxy Path | Permitted Roles | Description | Mutation? |
|---|-------------|--------------|----------------|-----------------|-------------|:---------:|
| 13 | `POST` | `/api/v1/tools` | `/api/bff/tools` | `ADMIN`, `SECURITY_ANALYST` | Register tool definition with auto-generated slug and initial draft version `0.1.0-draft` | **Yes** |
| 14 | `GET` | `/api/v1/tools` | `/api/bff/tools` | All 5 Roles | List paginated tools within the organization (`skip`, `limit`) | No |
| 15 | `GET` | `/api/v1/tools/{id}` | `/api/bff/tools/{id}` | All 5 Roles | Retrieve tool metadata, sensitivity settings, and execution limits | No |
| 16 | `PATCH` | `/api/v1/tools/{id}` | `/api/bff/tools/{id}` | `ADMIN`, `SECURITY_ANALYST` | Update tool description, timeout seconds, or rate limit | **Yes** |
| 17 | `POST` | `/api/v1/tools/{id}/activate` | `/api/bff/tools/{id}/activate` | `ADMIN`, `SECURITY_ANALYST` | Transition tool state to `ACTIVE` (from `DRAFT` or `SUSPENDED`) | **Yes** |
| 18 | `POST` | `/api/v1/tools/{id}/suspend` | `/api/bff/tools/{id}/suspend` | `ADMIN`, `SECURITY_ANALYST` | Transition tool state to `SUSPENDED` (from `ACTIVE`) | **Yes** |
| 19 | `POST` | `/api/v1/tools/{id}/deactivate` | `/api/bff/tools/{id}/deactivate` | `ADMIN`, `SECURITY_ANALYST` | Soft-delete tool to `DEACTIVATED` (409 if already deactivated) | **Yes** |
| 20 | `GET` | `/api/v1/tools/{id}/versions` | `/api/bff/tools/{id}/versions` | All 5 Roles | List all versions for a tool (plain list, ordered by `created_at desc`) | No |
| 21 | `POST` | `/api/v1/tools/{id}/versions` | `/api/bff/tools/{id}/versions` | `ADMIN`, `SECURITY_ANALYST` | Create new version in `DRAFT` with input/output JSON schemas (409 on duplicate) | **Yes** |
| 22 | `GET` | `/api/v1/tools/{id}/versions/{v_id}` | `/api/bff/tools/{id}/versions/{v_id}` | All 5 Roles | Retrieve full version detail including input/output schemas | No |
| 23 | `POST` | `/api/v1/tools/{id}/versions/{v_id}/publish` | `/api/bff/tools/{id}/versions/{v_id}/publish` | `ADMIN`, `SECURITY_ANALYST` | Publish version (`DRAFT` → `PUBLISHED`; 409 if not draft) | **Yes** |

### 3.3 Workstream C: Execution Forensics Endpoints (5 Core + 3 Cross-Domain Endpoints)

| # | HTTP Method | Backend Path | BFF Proxy Path | Permitted Roles | Description | Mutation? |
|---|-------------|--------------|----------------|-----------------|-------------|:---------:|
| 24 | `POST` | `/api/v1/runs` | `/api/bff/runs` | `ADMIN`, `AGENT_OPERATOR` | Initiate a new agent run session (`environment`, `trace_id`, `input_prompt`) | **Yes** |
| 25 | `GET` | `/api/v1/runs` | `/api/bff/runs` | `ADMIN`, `SECURITY_ANALYST`, `AGENT_OPERATOR`, `AUDITOR` *(VIEWER: 403)* | Paginated runs list with `agent_id` and `status` filters (`limit`, `offset`) | No |
| 26 | `GET` | `/api/v1/runs/{id}` | `/api/bff/runs/{id}` | `ADMIN`, `SECURITY_ANALYST`, `AGENT_OPERATOR`, `AUDITOR` *(VIEWER: 403)* | Retrieve single agent run session metadata and completion timestamps | No |
| 27 | `PATCH` | `/api/v1/runs/{id}/status` | `/api/bff/runs/{id}/status` | `ADMIN`, `AGENT_OPERATOR` | Update run status (`COMPLETED`, `FAILED`, `CANCELLED`), output summary, error message | **Yes** |
| 28 | `GET` | `/api/v1/runs/{id}/invocations` | `/api/bff/runs/{id}/invocations` | `ADMIN`, `SECURITY_ANALYST`, `AGENT_OPERATOR`, `AUDITOR` *(VIEWER: 403)* | Paginated list of tool requests in run with execution & approval summaries | No |
| *29* | `POST` | `/api/v1/runs/{id}/invocations` | `/api/bff/runs/{id}/invocations` | `ADMIN`, `AGENT_OPERATOR` | Invoke a tool within run; executes if ALLOW, gates if REQUIRE_APPROVAL | **Yes** |
| *30* | `GET` | `/api/v1/governance/approvals/{id}` | `/api/bff/governance/approvals/{id}` | `ADMIN`, `SECURITY_ANALYST`, `AGENT_OPERATOR`, `AUDITOR` | Cross-domain deep inspection of human approval review context | No |
| *31* | `GET` | `/api/v1/risk/assessments/{id}` | `/api/bff/risk/assessments/{id}` | All 5 Roles | Cross-domain deep inspection of 4-vector risk evaluation linked to invocation | No |
| *32* | `GET` | `/api/v1/risk/profiles/agents/{agent_id}` | `/api/bff/risk/profiles/agents/{agent_id}` | All 5 Roles | Cross-domain sliding-window agent trust score and empirical violation history | No |

---

## 4. Authoritative Five-Role Permission Matrix

The backend enforces strict role-based access control via FastAPI dependency injection (`RequireRole(...)`). The table below outlines exact operational permissions across all five canonical platform roles:

| Domain / Operation | `ADMIN` | `SECURITY_ANALYST` | `AGENT_OPERATOR` | `AUDITOR` | `VIEWER` |
|---|:---:|:---:|:---:|:---:|:---:|
| **Agent Registry** | | | | | |
| View Agents List & Details | Allowed | Allowed | Allowed | Allowed | Allowed |
| Register New Agent | Allowed | Denied (403) | Allowed | Denied (403) | Denied (403) |
| Update Agent Metadata (PATCH) | Allowed | Denied (403) | Allowed | Denied (403) | Denied (403) |
| Agent State (Activate / Suspend / Deactivate) | Allowed | Denied (403) | Allowed | Denied (403) | Denied (403) |
| Create Agent Version Snapshot | Allowed | Denied (403) | Allowed | Denied (403) | Denied (403) |
| View Permitted Tools | Allowed | Allowed | Allowed | Allowed | Allowed |
| Grant / Revoke Tool Access | Allowed | Denied (403) | Allowed | Denied (403) | Denied (403) |
| **Tool Registry** | | | | | |
| View Tools List & Details | Allowed | Allowed | Allowed | Allowed | Allowed |
| Register New Tool | Allowed | Allowed | Denied (403) | Denied (403) | Denied (403) |
| Update Tool Metadata (PATCH) | Allowed | Allowed | Denied (403) | Denied (403) | Denied (403) |
| Tool State (Activate / Suspend / Deactivate) | Allowed | Allowed | Denied (403) | Denied (403) | Denied (403) |
| Create Tool Version | Allowed | Allowed | Denied (403) | Denied (403) | Denied (403) |
| Publish Tool Version | Allowed | Allowed | Denied (403) | Denied (403) | Denied (403) |
| **Execution Forensics** | | | | | |
| List & View Agent Runs (`/runs`) | Allowed | Allowed | Allowed | Allowed | **Denied (403)** |
| View Run Detail & Session Metadata | Allowed | Allowed | Allowed | Allowed | **Denied (403)** |
| View Invocations & Telemetry | Allowed | Allowed | Allowed | Allowed | **Denied (403)** |
| Start Agent Run / Trigger Invocation | Allowed | Denied (403) | Allowed | Denied (403) | Denied (403) |
| Update Run Status (Complete / Cancel) | Allowed | Denied (403) | Allowed | Denied (403) | Denied (403) |
| **Forensic Data Inspection** | | | | | |
| View Masked Arguments & Results | Allowed | Allowed | Allowed | Allowed | **Denied (403)** |
| Reveal Unmasked Arguments & Outputs | **Allowed** | **Allowed** | Denied | Denied | **Denied (403)** |
| Copy Plaintext Arguments to Clipboard | **Blocked** | **Blocked** | **Blocked** | **Blocked** | **Blocked** |

> [!CAUTION]
> **Authoritative VIEWER Restrictions:**
> 1. In backend v0.8.0, `Role.VIEWER` is completely omitted from the permitted roles on `/api/v1/runs`, `/api/v1/runs/{id}`, and `/api/v1/runs/{id}/invocations`. A `VIEWER` cannot access run records, invocation records, or forensic details, **even in masked form**.
> 2. The server-side BFF route handler (`/api/bff/runs/*`) enforces this by intercepting requests from `VIEWER` users and immediately returning `403 Forbidden` (`{ "error": "Forbidden: VIEWER role cannot access execution runs or forensic telemetry" }`), preventing unnecessary backend traffic.
> 3. In the frontend navigation, the `/runs` navigation link is excluded from the sidebar for `VIEWER` via `getPermittedNavItems`. Direct navigation to `/runs` or `/runs/[id]` renders a `RoleGuard` restriction notice.

---

## 5. Execution Error Safety & Sanitization

Execution error information is captured at two levels in the backend:
1. `AgentRun.error_message`: Set on run failure via `PATCH /api/v1/runs/{id}/status`.
2. `ToolExecution.error_message`: Set by `ToolExecutor` when a tool handler throws an exception (`str(exc)`) or times out (`"Tool execution timed out after {effective_timeout}s"`).

### 5.1 Error Sanitization Invariants:
1. **No Raw Stack Traces:** The backend stores and returns `str(exc)` as a string; it does not return stack traces, line numbers, or code frames. The frontend must never claim stack traces are available or attempt to call nonexistent diagnostic endpoints.
2. **Scrubbing Internal Artifacts:** Before rendering any error string in the UI, the frontend applies recursive scrubbing to remove internal system paths, environment variable values, and connection strings:

```typescript
export function sanitizeExecutionError(errorMessage: string | null | undefined): string | null {
  if (!errorMessage || typeof errorMessage !== "string") return null;

  let sanitized = errorMessage;

  // 1. Scrub Windows absolute file paths (e.g. C:\Users\... or D:\app\...)
  sanitized = sanitized.replace(/[A-Za-z]:\\[\w.-]+(?:\\[\w.-]+)*/g, "[INTERNAL_PATH]");

  // 2. Scrub POSIX absolute file paths (e.g. /app/backend/..., /var/run/...)
  sanitized = sanitized.replace(/(?:\/[a-zA-Z0-9_.-]+){2,}/g, "[INTERNAL_PATH]");

  // 3. Scrub database URIs (e.g. postgresql+asyncpg://user:pass@host:5432/db)
  sanitized = sanitized.replace(
    /[a-zA-Z0-9+.-]+:\/\/[^\s@]+@[^\s/:]+(?::\d+)?\/[^\s]*/g,
    "[DATABASE_URI_REDACTED]"
  );

  // 4. Scrub embedded API keys and tokens
  sanitized = sanitized.replace(/sk-[A-Za-z0-9-_]{20,}/g, "sk-***[REDACTED]***");
  sanitized = sanitized.replace(/gh[pousr]-[A-Za-z0-9_]{36,}/g, "gh***[REDACTED]***");
  sanitized = sanitized.replace(/ey[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/g, "ey***[REDACTED_JWT]***");

  // 5. Trim and bound length
  return sanitized.trim().slice(0, 1000);
}
```

3. **Presentation:** Sanitized errors are presented in high-contrast alert containers with clear remediation guidance (e.g. timeout vs execution failure vs governance rejection), avoiding cryptic internal jargon.

---

## 6. Sensitive Data Redaction & Safe Rendering Design

Tool invocation arguments (`ToolRequest.arguments`) and execution results (`ToolExecution.result`) frequently contain sensitive parameters, credentials, database connection strings, and financial or personal identifiers.

### 6.1 Recursive Redaction Algorithm
Redaction executes **prior to DOM rendering** across nested objects and arrays. It utilizes both key-based matching and value-based high-entropy pattern matching:

```typescript
// Key patterns indicating sensitive data
const SENSITIVE_KEY_PATTERNS = [
  /passw(or)?d/i,
  /secret/i,
  /token/i,
  /api[_-]?key/i,
  /auth/i,
  /bearer/i,
  /credential/i,
  /private[_-]?key/i,
  /session/i,
  /cookie/i,
  /ssn|social[_-]?security/i,
  /card[_-]?number|cvv|cvc|pan/i,
  /pin/i,
];

// Value patterns indicating sensitive strings regardless of key name
const SENSITIVE_VALUE_PATTERNS = [
  // JWT tokens
  /^ey[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/,
  // OpenAI API keys
  /^sk-[A-Za-z0-9-_]{20,}$/,
  // GitHub Personal Access Tokens
  /^gh[pousr]-[A-Za-z0-9_]{36,}$/,
  // AWS Access Key ID
  /^AKIA[0-9A-Z]{16}$/,
  // Private Key PEM headers
  /-----BEGIN[ A-Z0-9_-]+PRIVATE KEY-----/,
  // Database connection URIs
  /^[a-zA-Z0-9+.-]+:\/\/[^:]+:[^@]+@/,
];

export function maskSensitiveData(
  data: unknown,
  revealPlaintext = false
): unknown {
  if (revealPlaintext) return data;
  if (data === null || data === undefined) return data;

  // Handle primitives
  if (typeof data === "string") {
    for (const pattern of SENSITIVE_VALUE_PATTERNS) {
      if (pattern.test(data)) {
        return "******** [REDACTED_SECRET]";
      }
    }
    return data;
  }

  if (typeof data !== "object") {
    return data;
  }

  // Handle arrays
  if (Array.isArray(data)) {
    return data.map((item) => maskSensitiveData(item, revealPlaintext));
  }

  // Handle objects
  const masked: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
    const isSensitiveKey = SENSITIVE_KEY_PATTERNS.some((pattern) => pattern.test(key));
    if (isSensitiveKey) {
      masked[key] = "******** [REDACTED]";
    } else {
      masked[key] = maskSensitiveData(value, revealPlaintext);
    }
  }

  return masked;
}
```

### 6.2 Redaction and Clipboard Rules:
1. **Redacted by Default:** Data is always masked upon initial render.
2. **Authorized Reveal Only:** The reveal toggle is available **only** for `ADMIN` and `SECURITY_ANALYST`. `AUDITOR` and `AGENT_OPERATOR` see only masked values with no reveal control.
3. **Safe Clipboard Actions:** The "Copy" button copies masked data by default. Copying unmasked data requires active plaintext reveal and is blocked entirely for unauthorized roles.
4. **XSS Defense:** Arguments and outputs are never parsed or injected into the DOM as HTML. They are rendered inside `<pre><code>` with strict JSON formatting.
5. **Zero Leaks:** Masked data is sanitized in memory; plaintext values are never sent to analytics, log sinks, or error reporting.

---

## 7. Agent Version Lifecycle Semantics

### 7.1 Backend Truth:
In FastAPI v0.8.0:
- `Agent`: Contains `model_provider`, `model_name`, `status` (`DRAFT`, `ACTIVE`, `SUSPENDED`, `DEACTIVATED`), and `environment`. **This root record determines the active model and operational state.**
- `AgentVersion`: Created via `POST /api/v1/agents/{id}/versions?version_string=...`. Automatically initialized with `status = AgentVersionStatus.DRAFT`.
- **Gap:** While `publish_agent_version` exists in `agents/service.py`, **no HTTP route was registered in `agents.py`**. There is no endpoint to transition an agent version to `PUBLISHED`.

### 7.2 UI Representation Invariants:
1. **No Nonexistent Publish Button:** The UI will **NOT** display a "Publish Version" button or action on agent versions.
2. **Active vs Snapshot Distinction:**
   - The workbench clearly distinguishes the **Active Configuration** (from the root `Agent` entity: `model_provider`, `model_name`, `environment`) from historical **Version Snapshots** (`AgentVersion` list).
   - Historical versions are displayed in a "Version History" table with their exact version string, timestamp, created-by user ID, and `DRAFT` status badge.
   - The UI does not claim or imply that any version snapshot is active or published.
3. **Updating the Active Agent:** Modifying the agent's active model or environment is performed via `PATCH /api/v1/agents/{id}` (restricted to `ADMIN` and `AGENT_OPERATOR`), which directly updates the authoritative root record.

---

## 8. Exact Forensic Response Contracts & Field Source Mapping

Every displayed field in the Execution Forensics workbench is mapped directly to actual Pydantic schemas in `backend/app/governance/schemas.py`:

### 8.1 Agent Run Contract (`AgentRunResponse`)

| Field Name | Source Model | Type | Nullable? | UI Source & Usage |
|---|---|---|:---:|---|
| `id` | `AgentRun.id` | `uuid.UUID` | No | Unique Run ID, header title, route parameter (`/runs/[id]`) |
| `organization_id` | `AgentRun.organization_id` | `uuid.UUID` | No | Tenant validation |
| `agent_id` | `AgentRun.agent_id` | `uuid.UUID` | No | Filter parameter, cross-link to Agent Fleet Registry |
| `agent_version_id` | `AgentRun.agent_version_id` | `uuid.UUID` | **Yes** | Bound version snapshot (if specified at run creation) |
| `user_id` | `AgentRun.user_id` | `uuid.UUID` | No | Run initiator identifier |
| `status` | `AgentRun.status` | `RunStatus` | No | Status badge: `PENDING`, `RUNNING`, `COMPLETED`, `FAILED`, `CANCELLED` |
| `environment` | `AgentRun.environment` | `str` | No | Environment pill (e.g. `DEVELOPMENT`, `STAGING`, `PRODUCTION`) |
| `trace_id` | `AgentRun.trace_id` | `str` | **Yes** | OpenTelemetry trace correlation identifier (monospace pill) |
| `input_prompt` | `AgentRun.input_prompt` | `str` | **Yes** | User/agent input prompt text block |
| `output_summary` | `AgentRun.output_summary` | `str` | **Yes** | Agent execution summary text block |
| `error_message` | `AgentRun.error_message` | `str` | **Yes** | Sanitized run failure reason |
| `started_at` | `AgentRun.started_at` | `datetime` | No | Timestamp of run initiation |
| `completed_at` | `AgentRun.completed_at` | `datetime` | **Yes** | Timestamp of terminal status (null while running) |
| `created_at` | `AgentRun.created_at` | `datetime` | No | Audit creation timestamp |
| `updated_at` | `AgentRun.updated_at` | `datetime` | No | Last state update timestamp |

### 8.2 Tool Request & Invocation Contract (`ToolRequestResponse`)
Retrieved via `GET /api/v1/runs/{id}/invocations` (ordered by `created_at asc`):

| Field Name | Source Model | Type | Nullable? | UI Source & Usage |
|---|---|---|:---:|---|
| `id` | `ToolRequest.id` | `uuid.UUID` | No | Invocation ID, header badge |
| `run_id` | `ToolRequest.run_id` | `uuid.UUID` | No | Run correlation foreign key |
| `agent_id` | `ToolRequest.agent_id` | `uuid.UUID` | No | Executing agent identifier |
| `tool_id` | `ToolRequest.tool_id` | `uuid.UUID` | No | Target tool identifier, cross-link to Tool Catalog |
| `tool_version_id` | `ToolRequest.tool_version_id` | `uuid.UUID` | No | Exact tool version evaluated |
| `decision` | `ToolRequest.decision` | `GovernanceDecision` | No | Verdict: `ALLOW` (emerald), `DENY` (rose), `REQUIRE_APPROVAL` (amber) |
| `violation_codes` | `ToolRequest.violation_codes` | `list[str]` | No | List of governance violation codes (empty if ALLOW) |
| `arguments_hash` | `ToolRequest.arguments_hash` | `str` | No | 64-character SHA-256 integrity hash |
| `arguments` | `ToolRequest.arguments` | `dict[str, Any]` | No | Input arguments (rendered via recursive masked viewer) |
| `idempotency_key` | `ToolRequest.idempotency_key` | `str` | **Yes** | Client-supplied idempotency key |
| `policy_evaluations` | `ToolRequest.policy_evaluations` | `dict[str, Any]` | **Yes** | Policy rule evaluation breakdown (AST rules matched) |
| `risk_assessment_id` | `ToolRequest.risk_assessment_id` | `uuid.UUID` | **Yes** | Cross-domain link to `GET /api/v1/risk/assessments/{id}` |
| `evaluation_duration_ms` | `ToolRequest.evaluation_duration_ms` | `float` | **Yes** | Governance decision latency in milliseconds |
| `created_at` | `ToolRequest.created_at` | `datetime` | No | Invocation submission timestamp |
| `execution` | `ToolExecution` | `ToolExecutionResponse` | **Yes** | Nested execution telemetry (null if DENIED or REJECTED) |
| `approval_request` | `ApprovalRequest` | `ApprovalRequestSummaryResponse` | **Yes** | Nested approval summary (null if not gated) |

### 8.3 Nested Execution Telemetry (`ToolExecutionResponse`)
Populated within `ToolRequestResponse.execution`:

| Field Name | Source Model | Type | Nullable? | UI Source & Usage |
|---|---|---|:---:|---|
| `id` | `ToolExecution.id` | `uuid.UUID` | No | Execution telemetry ID |
| `tool_request_id` | `ToolExecution.tool_request_id` | `uuid.UUID` | No | Back-reference to request |
| `status` | `ToolExecution.status` | `ExecutionStatus` | No | `PENDING`, `RUNNING`, `SUCCESS`, `FAILED`, `TIMED_OUT` |
| `result` | `ToolExecution.result` | `Any` | **Yes** | Tool return payload (rendered via masked viewer) |
| `error_message` | `ToolExecution.error_message` | `str` | **Yes** | Sanitized tool execution exception message |
| `duration_ms` | `ToolExecution.duration_ms` | `int` | **Yes** | Actual execution duration in milliseconds |
| `executed_at` | `ToolExecution.executed_at` | `datetime` | **Yes** | Execution completion timestamp |

### 8.4 Nested Approval Summary (`ApprovalRequestSummaryResponse`)
Populated within `ToolRequestResponse.approval_request`:

| Field Name | Source Model | Type | Nullable? | UI Source & Usage |
|---|---|---|:---:|---|
| `id` | `ApprovalRequest.id` | `uuid.UUID` | No | Approval ID, cross-link to `/approvals` queue |
| `status` | `ApprovalRequest.status` | `ApprovalStatus` | No | `PENDING`, `APPROVED`, `REJECTED`, `EXPIRED` |
| `approver_user_id` | `ApprovalRequest.reviewed_by_user_id` | `uuid.UUID` | **Yes** | Reviewer identifier (null while pending) |
| `decision_reason` | `ApprovalRequest.review_decision_reason` | `str` | **Yes** | Reviewer rationale text |
| `decided_at` | `ApprovalRequest.reviewed_at` | `datetime` | **Yes** | Decision timestamp (null while pending) |

---

## 9. Explicit Backend Capability Gaps & Deferred Features

1. **No `GET /tools/{tool_id}/agents` Endpoint:** Permissions are queried strictly from the agent side (`GET /api/v1/agents/{id}/tools`). There is no endpoint to fetch all agents permitted for a tool. The UI notes that bindings are managed on the agent side and links to the Agent Fleet Registry.
2. **No Agent Version Publishing Endpoint:** While `publish_agent_version` exists in `agents/service.py`, no HTTP route was added to `agents.py`. Agent versions can be created (`POST /agents/{id}/versions`), but remain in `DRAFT`. The UI displays versions as historical snapshots without a publish button.
3. **No Version Retirement Route:** Neither tool versions nor agent versions support a `retire` route in v0.8.0. Version retirement actions are omitted from the UI.
4. **No Global Invocations Query:** Tool requests cannot be listed globally across all runs; they can only be fetched per run (`GET /api/v1/runs/{id}/invocations`). Investigations are conducted by selecting a run and inspecting its timeline.
5. **No `tool_id` Query Filter on `/runs`:** `GET /api/v1/runs` accepts only `agent_id`, `status`, `limit`, and `offset`. Filtering by tool is conducted inside the run's invocation timeline.

---

## 10. Reconciled Component & Data-Flow Architecture

```mermaid
graph TD
    subgraph "Navigation & Auth Guard"
        NAV["Sidebar Navigation"] -->|All 5 Roles| P_AGENTS["/agents (Agent Fleet Registry)"]
        NAV -->|All 5 Roles| P_TOOLS["/tools (Governed Tool Catalog)"]
        NAV -->|ADMIN, SEC_ANALYST, AGENT_OP, AUDITOR| P_RUNS["/runs (Execution Forensics Directory)"]
        NAV -.->|VIEWER: BLOCKED 403| P_RUNS_DENIED["RoleGuard Restriction Notice"]
    end

    subgraph "BFF Gateway Boundary (/api/bff)"
        P_AGENTS -->|Fetch / Mutate| BFF_AGENTS["/api/bff/agents/*"]
        P_TOOLS -->|Fetch / Mutate| BFF_TOOLS["/api/bff/tools/*"]
        P_RUNS -->|Role Checked (No VIEWER)| BFF_RUNS["/api/bff/runs/*"]
    end

    subgraph "FastAPI v0.8.0 Backend"
        BFF_AGENTS --> API_AGENTS["/api/v1/agents/*"]
        BFF_TOOLS --> API_TOOLS["/api/v1/tools/*"]
        BFF_RUNS --> API_RUNS["/api/v1/runs/*"]
    end
```

### 10.1 Key Reconciled Components:
- **`src/app/runs/page.tsx`:** Uses `RoleGuard` to deny `VIEWER` access immediately. Displays paginated `RunHistoryTable` with agent and status filters.
- **`src/app/runs/[runId]/page.tsx`:** Dedicated forensics workspace. Loads run details and invocations list in parallel.
- **`InvocationTimeline`:** Chronological card stream displaying verdict, execution status, latency timings, and violation codes.
- **`InvocationDetailDrawer`:** Slide-over forensics inspector featuring:
  - Sanitized execution error alerts via `sanitizeExecutionError`.
  - Recursive sensitive-data masked arguments and result viewers via `maskSensitiveData`.
  - Reveal toggle strictly restricted to `ADMIN` and `SECURITY_ANALYST`.
  - Clipboard actions defaulting to masked data.
  - Linked `RiskAssessment` card and `ApprovalRequest` summary.
- **`AgentDetailDrawer`:** Tabs for Overview, Versions (labeled `DRAFT`, no publish button), Permitted Tools, and Risk Trust Profile.
- **`ToolDetailDrawer`:** Tabs for Overview, JSON Schemas (Input/Output), and Versions (with `Publish` action for `ADMIN`/`SECURITY_ANALYST`).

---

## 11. Updated Test Strategy & Acceptance Criteria

### 11.1 Test Suite Plan (`frontend/test-phase-9-6.mjs`)
1. **VIEWER Access Restrictions:**
   - Verify server-side BFF route blocks `VIEWER` with HTTP 403.
   - Verify `canAccessPage` returns `false` for `VIEWER` on `/runs` and `/runs/[id]`.
2. **Execution Error Sanitization:**
   - Verify `sanitizeExecutionError` strips Windows paths (`C:\...`), POSIX paths (`/app/...`), database URIs, and API keys.
3. **Sensitive-Data Redaction:**
   - Verify recursive masking on nested objects and arrays.
   - Verify value-based secret detection (JWTs, OpenAI keys, GitHub tokens, PEM keys).
   - Verify reveal toggle works strictly for `ADMIN` and `SECURITY_ANALYST`.
4. **Agent Version Semantics:**
   - Verify agent versions render as `DRAFT` snapshots without any publish trigger.
5. **Contract Conformance:**
   - Verify TypeScript compilation (`npx tsc --noEmit`) passes with 0 errors.
   - Verify ESLint (`npm run lint`) passes with 0 warnings or errors.
   - Verify Next.js production build (`npm run build`) compiles cleanly.

### 11.2 Acceptance Criteria
- [ ] `VIEWER` cannot access `/runs` in navigation, page rendering, or BFF proxy.
- [ ] `/agents` renders fleet roster with status, tier, environment, and model specifications.
- [ ] Agent versions display clearly as `DRAFT` snapshots without a nonexistent publish action.
- [ ] Permitted tools can be granted and revoked for agents by `ADMIN` and `AGENT_OPERATOR`.
- [ ] `/tools` renders tool catalog with sensitivity tags and input/output JSON schemas.
- [ ] Tool version creation and publication (`DRAFT` → `PUBLISHED`) function cleanly for `ADMIN` and `SECURITY_ANALYST`.
- [ ] `/runs/[id]` renders complete session forensics and chronological invocation timeline.
- [ ] Tool request arguments and results are masked by default across all roles.
- [ ] Reveal toggle is functional only for `ADMIN` and `SECURITY_ANALYST`.
- [ ] Execution error messages are sanitized before display; raw stack traces and internal paths are scrubbed.
- [ ] Zero JWTs or credentials exposed in browser DOM or client network requests.
- [ ] Full compliance with Next.js App Router conventions and zero added dependencies.

---

## 12. Implementation Sequence & Estimated Complexity

```
┌────────────────────────────────────────────────────────────────────────┐
│ Stage 1: API Clients, Types, Formatters, Masking & Error Scrubbing     │
│ - Create types/agents.ts, types/tools.ts, types/runs.ts                │
│ - Create lib/agents, lib/tools, lib/runs (API clients & formatters)    │
│ - Implement recursive masking, clipboard copy & error sanitization     │
│ - Implement BFF server-side VIEWER role guard in /api/bff/[...path]    │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ Stage 2: Agent Fleet Registry Workbench (/agents)                      │
│ - Implement useAgents hook                                             │
│ - Build AgentRosterTable, AgentDetailDrawer, AgentModal                │
│ - Implement AgentVersionModal (DRAFT snapshots, no publish button)     │
│ - Implement AgentToolPermissionDialog                                  │
│ - Replace placeholder at src/app/agents/page.tsx                       │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ Stage 3: Governed Tool Catalog Workbench (/tools)                      │
│ - Implement useTools hook                                              │
│ - Build ToolCatalogTable, ToolDetailDrawer, ToolModal                  │
│ - Implement ToolVersionModal, ToolSchemaViewer, PublishVersionDialog   │
│ - Replace placeholder at src/app/tools/page.tsx                        │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ Stage 4: Execution Forensics & Audit Workbench (/runs & /runs/[id])    │
│ - Implement useRuns hook                                               │
│ - Build RunHistoryTable, RunsFilters, RunStatusBadge                   │
│ - Replace placeholder at src/app/runs/page.tsx (VIEWER blocked)        │
│ - Implement /runs/[id]/page.tsx forensics workspace                    │
│ - Build InvocationTimeline, InvocationCard, InvocationDetailDrawer     │
│ - Integrate sanitized errors, masked viewers & cross-domain cards      │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 13. Strict Execution Boundary Confirmation

This document constitutes **Architecture Discovery and Design ONLY**.

- No application source code has been modified.
- No backend code has been modified.
- No database migrations or schemas have been altered.
- No dependencies have been installed or upgraded.
- No Git commits, tags, or pushes have been executed.
- Phase 9.6 implementation has **NOT** been started.

*Submitted for project-owner review and formal implementation authorization.*
