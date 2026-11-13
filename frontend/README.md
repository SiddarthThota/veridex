# VERIDEX — Frontend SecOps Dashboard

Security Operations Dashboard for the VERIDEX AI Agent Governance & Audit Platform.

Built with **Next.js 16 (App Router)**, **React 19**, and **Tailwind CSS v4**, backed by the audited FastAPI backend (v0.8.0).

---

## 1. Architectural Overview

The frontend operates as a secure **Backend-for-Frontend (BFF)** with zero client-side JWT exposure:

```
Browser (Same-Origin)
   │
   │  HTTPS / Cookie (veridex_session: AES-256-GCM Encrypted)
   ▼
Next.js BFF (Server-Side / Edge Runtime)
   │
   │  Decrypts cookie, validates expiration (30m), checks CSRF
   │  Injects Authorization: Bearer <access_token>
   ▼
FastAPI Gateway (v0.8.0 Backend)
```

### Security Safeguards (Phase 9.1)
- **Zero Client-Side JWT Exposure**: Browser JavaScript never stores, reads, or transmits JWT access tokens.
- **AES-256-GCM Encrypted Sessions**: Session cookie (`veridex_session`) encrypted using Web Crypto API HKDF-derived keys.
- **Strict 30-Minute Expiration**: Absolute lifetime enforced on the server; invalid or expired cookies automatically cleared.
- **Origin/Referer CSRF Defense**: Mutating requests require exact `Origin` or `Referer` matching and standard `X-Veridex-Request` headers.
- **SSRF & Path Traversal Protection**: Reverse proxy allowlists top-level backend domains (`/api/v1/*`) with strict segment validation.

---

## 2. Five-Role Access Control Framework (Phase 9.2)

VERIDEX enforces a unified role-based access control (RBAC) model across all 5 canonical roles grounded in the audited v0.8.0 backend API:

| Navigation Item | Route | Allowed Roles | Default Landing | Description |
| :--- | :--- | :--- | :---: | :--- |
| **Dashboard** | `/dashboard` | `ADMIN`, `SECURITY_ANALYST`, `AUDITOR` | Yes (for 3 roles) | Security operations overview & governance analytics |
| **Approvals** | `/approvals` | `ADMIN`, `SECURITY_ANALYST`, `AUDITOR`, `AGENT_OPERATOR` | No | Human-in-the-loop review queue for gated tool executions |
| **Agent Runs** | `/runs` | `ADMIN`, `SECURITY_ANALYST`, `AUDITOR`, `AGENT_OPERATOR` | Yes (`AGENT_OPERATOR`) | Execution runs, tool traces, and latency logs |
| **Agents** | `/agents` | `ADMIN`, `SECURITY_ANALYST`, `AUDITOR`, `AGENT_OPERATOR`, `VIEWER` | Yes (`VIEWER`) | AI agent directory, risk tiers, and tool bindings |
| **Tools** | `/tools` | `ADMIN`, `SECURITY_ANALYST`, `AUDITOR`, `AGENT_OPERATOR`, `VIEWER` | No | Governed tool registry, schemas, and classifications |
| **Policies** | `/policies` | `ADMIN`, `SECURITY_ANALYST`, `AUDITOR`, `AGENT_OPERATOR`, `VIEWER` | No | Declarative condition trees and simulation |
| **Risk Engine** | `/risk` | `ADMIN`, `SECURITY_ANALYST`, `AUDITOR`, `AGENT_OPERATOR`, `VIEWER` | No | Multi-dimensional scoring and configuration versions |
| **Organization** | `/organization` | `ADMIN`, `SECURITY_ANALYST`, `AUDITOR` | No | Tenant profile and user roster |

### 403 Loop Prevention (Landing Routes)
To prevent unauthorized redirect loops upon authentication:
- `ADMIN`, `SECURITY_ANALYST`, `AUDITOR` → `/dashboard`
- `AGENT_OPERATOR` → `/runs`
- `VIEWER` → `/agents`
- Unauthenticated → `/login`

---

## 3. Component Architecture

- **`AppShell`** (`src/components/layout/app-shell.tsx`): Main dashboard wrapper orchestrating desktop collapse, mobile drawer, and main viewport.
- **`Sidebar`** (`src/components/layout/sidebar.tsx`): Role-aware navigation rendering only items authorized for current user role.
- **`Header`** (`src/components/layout/header.tsx`): Contextual page title, active tenant badge, user initials, `RoleBadge`, and accessible logout menu.
- **`RoleBadge`** (`src/components/ui/role-badge.tsx`): Enterprise dark-first color-coded role tags for all 5 canonical roles.
- **`RoleGuard`** (`src/components/auth/role-guard.tsx`): Client-side conditional UI wrapper with disabled-mode tooltip support for audit visibility.
- **`AuthProvider`** (`src/components/auth/auth-context.tsx`): Global reactive user context consuming `/api/auth/me` and `/api/bff/organizations/my`.
- **`middleware.ts`**: Edge middleware enforcing server-side route guards and redirecting forbidden paths to `/403`.

---

## 4. Security Analytics & Governance Overview Dashboard (Phase 9.3)

Phase 9.3 equips the SecOps dashboard with comprehensive security telemetry, governance analytics, and anomaly detection directly connected to audited v0.8.0 FastAPI endpoints via the BFF proxy (`/api/bff/analytics/*`):

| Endpoint Route | Capability | Visual Representation | Key Metrics & Schemas |
| :--- | :--- | :--- | :--- |
| `GET /api/v1/analytics/overview` | Governance Overview | 4 Stat Cards (`OverviewKpiGrid`) | Total evaluations, invocations, allow/deny/approval breakdown %, resolution rate |
| `GET /api/v1/analytics/trends` | Activity & Throughput Trends | Native Multi-Series SVG (`GovernanceTrendsChart`) | Evaluations, invocations, allowed, denied, requires approval, approvals approved/rejected |
| `GET /api/v1/analytics/risk-distribution` | Risk Engine Score Analytics | Tier Grid & 10-Bucket Histogram (`RiskDistributionCard`) | Critical/High/Medium/Low counts, avg/min/max risk scores, bucketed count histogram |
| `GET /api/v1/analytics/agents` | Fleet Activity & Trust | Paginated Fleet Table (`AgentAnalyticsTable`) | Agent invocations, decisions, historical denial rate %, evaluation ms, trust score |
| `GET /api/v1/analytics/tools` | Tool Utilization & Health | Paginated Tool Table (`ToolUtilizationTable`) | Tool invocations, success/failure/timeout executions, evaluation & execution durations |
| `GET /api/v1/analytics/anomalies` | Sliding-Window Anomaly Alerts | Findings Cards (`AnomalyPanel`) | `DENIAL_RATE_SPIKE`, `CRITICAL_RISK_SURGE`, `LATENCY_SLA_DEGRADATION` |

### Key Architectural Constraints
- **Strict Tenant Derivation**: No `organization_id` query parameter is ever transmitted or accepted from client requests; tenant identity is derived strictly from the server-side JWT session (`check_no_tenant_override`).
- **Half-Open Intervals**: Queries enforce standard UTC half-open boundaries `[start_time, end_time)`.
- **Interval Bounds**: Presets support `24h`, `7d`, and `30d`; custom intervals are constrained to a maximum of 90 days.
- **Granularity Rules**: Hourly granularity is strictly restricted to intervals $\le 7$ days; intervals $> 7$ days automatically require daily granularity to respect backend performance limits.
- **Native Enterprise SVG**: Zero third-party charting libraries (no Recharts, Chart.js, or TanStack Query); lightweight, zero-dependency, responsive, and high-performance SVG graphics.
- **Resilient Formatting**: Handlers safely manage empty states, zero-division ratios (`approval_resolution_rate: null`), and missing data points.

---

## 5. Approvals Queue & Governance Gateway Workbench (Phase 9.4)

Phase 9.4 equips VERIDEX with a human-in-the-loop (HITL) approval review queue and governance workbench directly connected to audited v0.8.0 FastAPI endpoints via the BFF proxy (`/api/bff/governance/approvals/*`):

| Endpoint Route | Capability | Visual Representation | Key Constraints & Behaviors |
| :--- | :--- | :--- | :--- |
| `GET /api/v1/governance/approvals` | Queue List & Status Tally | `ApprovalsQueueTable`, `ApprovalsHeader` | Supports `status` (`PENDING`, `APPROVED`, `REJECTED`, `EXPIRED`), `limit` (1..100), `offset` (>=0). Backend hardcoded `created_at.desc()` order. |
| `GET /api/v1/governance/approvals/{id}` | Approval Detail Inspection | `ApprovalDetailDrawer` | Eager loads `tool_request`, `tool_request.execution`, argument hashes, and violation codes. |
| `POST /api/v1/governance/approvals/{id}/decide` | Decision Submission | `ApprovalDecisionDialog` | Requires `decision` (`APPROVED` or `REJECTED`) and mandatory `reason` (>= 5 chars). Triggers immediate tool execution when approved. |

### Critical Security Safeguards (Phase 9.4)
- **Sensitive Argument Recursive Masking:** Keys matching `/password|secret|token|key|credential|auth|private/i` are masked by default (`••••••••`) across objects and arrays. Unmasking is restricted to `ADMIN` and `SECURITY_ANALYST` roles.
- **Masked Clipboard Copies:** Copying arguments JSON copies the masked representation by default to prevent accidental credential exfiltration.
- **Safe JSON Rendering:** Argument payloads are rendered as plain text in `<pre><code>` blocks, never parsed or executed as HTML.
- **Decoupled Decision vs Execution Status:** An `APPROVED` decision triggers tool execution, but does not guarantee success. The interface distinctly displays the governance verdict and the execution outcome (`SUCCESS`, `FAILED`, `TIMED_OUT`, `RUNNING`).
- **No Optimistic False Success:** Decisions never mutate state locally prior to confirmed backend commit. Concurrency conflicts (HTTP 409) automatically refresh server state.
- **Mandatory Audit Rationale:** A non-whitespace rationale of at least 5 characters (maximum 1000 characters) is enforced prior to submission.
- **Five-Role Enforcement:**
  - `ADMIN` & `SECURITY_ANALYST`: Queue inspection, detail review, approve/reject decisions, secret unmasking.
  - `AUDITOR` & `AGENT_OPERATOR`: Queue inspection and detail review in read-only mode (decision buttons disabled with tooltips; secrets masked).
  - `VIEWER`: Completely blocked from `/approvals` and related API endpoints (HTTP 403).

---

## 6. Verification and Testing

All security, authentication, navigation, analytics, and approval guarantees are validated via automated test suites:

```bash
# Run complete test suite (Phase 9.1 + Route Handlers + Phase 9.2 + Phase 9.3 + Phase 9.4)
npm test

# Type check
npx tsc --noEmit

# Lint check
npm run lint

# Production build
npm run build
```

### Test Suites Included
1. `test-phase-9-1.mjs`: Cryptographic session tests (AES-GCM, HKDF, expiry, CSRF, allowlists).
2. `test-route-handlers.mjs`: BFF route handler integration (login, logout, me, proxy).
3. `test-phase-9-2.mjs`: 5-role navigation visibility, `canAccessPage`, landing routes, functional permissions, and middleware guard logic.
4. `test-phase-9-3.mjs`: 6 analytics endpoint contracts, UTC half-open interval checks, 90-day ceiling, 7-day hourly constraint, schema validation (`findings` array parity, nullable rates), formatter robustness, SVG math resilience, and 5-role access enforcement.
5. `test-phase-9-4.mjs`: Governance approval endpoint contracts, status lifecycle (PENDING -> APPROVED/REJECTED), 5-role authorization boundaries, mandatory rationale validation (min 5, max 1000, control char strip), recursive sensitive argument masking & role reveal, decision vs execution decoupling, and 409 conflict/tamper handling.
