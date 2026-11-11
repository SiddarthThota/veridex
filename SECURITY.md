# VERIDEX — Security

> This document will be fully populated in Phase 17 (Advanced Security & Privacy).

## Security Principles

1. **LLMs never make security decisions.** All authorization, policy enforcement, and access control is deterministic code.
2. **Zero trust for agents.** Every agent tool request passes through the Governance Gateway.
3. **Defense in depth.** Multiple layers: authentication, authorization, policy, risk, security detection.
4. **Tamper-evident audit.** Hash-chained audit log detects unauthorized modifications.
5. **Least privilege.** Agents and users receive minimum necessary permissions.
6. **Secure by default.** Tools are denied unless explicitly authorized.

## Authentication

- JWT access tokens (short-lived, 30 min)
- Refresh tokens (7 days)
- bcrypt password hashing (cost factor 12)
- No plaintext credentials stored

## Authorization

- Role-Based Access Control (RBAC)
- Roles: ADMIN, SECURITY_ANALYST, AUDITOR, AGENT_OPERATOR, VIEWER
- Every API endpoint has explicit role requirements
- Agent-to-tool permissions are explicit and audited

## Reporting Security Issues

If you discover a security vulnerability, please report it responsibly.

## Phase 2 Updates
- Implemented strict RBAC via RequireRole dependency.
- Added passlib bcrypt password hashing.
- Implemented JWT-based stateless authentication.
- Verified unprivileged roles (e.g. VIEWER) are correctly blocked from admin-only endpoints.

## Phase 4 Updates
- Implemented default-deny agent-tool mappings. Agents must be explicitly granted permission to use any registered tool.
- Established strict organizational isolation for tool queries and permissions to ensure cross-org data leakage is prevented.
- Integrated risk_level and access_type properties for fine-grained authorization layers downstream.

## Phase 5 Updates — Governance Gateway Security Architecture

1. **Deterministic Default-Deny Evaluation:**
   - Every tool invocation intent MUST pass through `GovernanceService._evaluate_policy` before any execution can occur.
   - LLMs never make security decisions. The gateway evaluates strict deterministic code rules.
   - Strict decision precedence:
     1. Agent status & identity (blocks unknown/inactive agents).
     2. Tool status & identity (blocks unknown/inactive tools).
     3. Version publication state (blocks unpublished or draft versions).
     4. Agent-tool authorization (blocks without explicit active permission in `agent_tool_permissions`).
     5. Schema validation (blocks malformed arguments using JSON Schema Draft 7).
     6. Risk & Approval assessment (`CRITICAL` risk, `RESTRICTED` data classification, `WRITE` + `IRREVERSIBLE`, explicit `REQUIRED` approval trigger `REQUIRE_APPROVAL`).
     7. Only when all preceding checks succeed is `ALLOW` granted.

2. **Tool Version Integrity:**
   - Every `ToolRequest` is immutably bound to an exact published `ToolVersion` ID.
   - Post-approval execution is strictly guaranteed to execute the exact version evaluated by governance.

3. **Approval Integrity & Cryptographic Tamper Prevention:**
   - Evaluated arguments and tool version are hashed using canonical sorted SHA-256 (`compute_arguments_hash`).
   - The SHA-256 hash is verified before executing approved requests to prevent payload tampering.
   - Replay / double-decision protection: Only requests in `PENDING` state can be decided; concurrent or duplicate decisions are rejected.

4. **Role Separation for Human-in-the-Loop Approvals:**
   - Endpoints deciding approvals (`POST /api/v1/governance/approvals/{id}/decide`) strictly require `ADMIN` or `SECURITY_ANALYST` roles.
   - `AGENT_OPERATOR` users can initiate tool requests and runs but are forbidden from approving their own or any other approval requests.

5. **Execution Isolation & Sandboxing:**
   - Tool execution is decoupled from arbitrary runtime code execution.
   - The gateway uses a closed registry of trusted handlers (`calculator`, `echo`, `system-status`, `data-lookup`).
   - Execution of arbitrary user-submitted Python strings, shell commands, or unvetted scripts is strictly rejected.
   - Configurable per-tool execution timeouts (`asyncio.wait_for`) are enforced with guaranteed persistence of `TIMED_OUT` and `FAILED` states.

6. **Dry-Run Safety:**
   - `POST /api/v1/governance/evaluate` provides a dry-run evaluation for pre-flight simulation.
   - Guarantees zero execution side-effects and zero database mutation.

7. **Idempotency & Concurrency:**
   - `idempotency_key` enforcement on tool invocations prevents duplicate executions on retries.
   - Database transactions and state transition locks protect against race conditions.

## Phase 6 Updates — Policy Engine Security Architecture

1. **Immutable Policy Versioning & Freeze-on-Publish:**
   - Policies adopt an immutable versioning model (`PolicyVersion`).
   - When a `PolicyVersion` transitions to `PUBLISHED`, its rules and metadata are permanently frozen in the database.
   - Any modification to rules or settings requires creating a new `DRAFT` version via explicit version branching (`POST /api/v1/policies/{id}/versions`).
   - Published or retired versions cannot be updated or deleted, guaranteeing verifiable audit and reproducible governance evaluations.

2. **Multi-Tier Decision Precedence & Inviolable Platform Baseline:**
   - Tier 1: **Mandatory Platform Baseline Safety Floor** (Hard DENY): Agent status, tool registration, published tool version, explicit agent-tool permission, and JSON Schema argument validation are evaluated first. If any Tier 1 check fails, the invocation is immediately `DENY`ed with machine-readable violation codes. A dynamic policy rule cannot override a Tier 1 failure with `ALLOW`.
   - Tier 2: **Active Organization Policies:** Evaluated in order of `priority` (descending). Rules within each version are evaluated in order of `rule_order` (ascending).
     - `DENY` takes absolute precedence across all evaluated rules.
     - `REQUIRE_APPROVAL` overrides `ALLOW`.
     - `ALLOW` requires all matching rules across all applicable policies to permit the action, with no matching `DENY` or `REQUIRE_APPROVAL` rules.
   - Tier 3: **Default Policy Action / Risk Baseline:** If no rules match, the policy's configured `default_action` (or Gateway risk/classification baseline) applies.

3. **Safe AST Condition Evaluator (Zero Dynamic Code Execution):**
   - Dynamic code evaluation (`eval`, `exec`, `compile`, or external shell scripts) is strictly prohibited.
   - Rules are expressed as structured JSON condition trees parsed and evaluated by a dedicated, sandboxed AST evaluator.
   - **Recursion & Complexity Bounds:**
     - Maximum nesting depth: 5 levels.
     - Maximum condition count per rule: 20 nodes.
     - Maximum payload size evaluated: 64 KB.
     - Maximum string comparison length: 1,024 characters.
   - Supported deterministic operators: `EQUALS`, `NOT_EQUALS`, `GREATER_THAN`, `LESS_THAN`, `GREATER_THAN_OR_EQUAL`, `LESS_THAN_OR_EQUAL`, `CONTAINS`, `NOT_CONTAINS`, `IN`, `NOT_IN`, `STARTS_WITH`, `ENDS_WITH`, `MATCHES_REGEX`.

4. **ReDoS (Regular Expression Denial of Service) Immunity via Google RE2:**
   - Evaluates regular expressions using Google RE2 (`google-re2`), a linear-time automata-based (DFA/NFA) engine.
   - Guaranteed $O(n)$ time complexity in input string size; catastrophic backtracking is mathematically impossible.
   - Eliminates reliance on thread pools, timeouts, worker queues, and thread cancellation, preventing worker exhaustion and unbounded task accumulation.
   - Defense-in-depth static analysis rejects catastrophic constructs and non-linear features (backreferences) at authoring time.
   - Patterns are capped at 128 characters and target strings at 1,024 characters.

5. **Strict Multi-Tenant Isolation:**
   - Every policy, version, rule, and simulation request is strictly scoped to the caller's authenticated `organization_id`.
   - Cross-tenant lookups fail with HTTP 404 (preventing organization enumeration).
   - Policy simulation endpoints are quarantined to the caller's own organizational scope and cannot simulate against or expose policies from other tenants.

6. **Comprehensive Evaluation Auditability:**
   - Every evaluated `ToolRequest` records a structured `policy_evaluations` JSON record containing:
     - Evaluated policy IDs and slugs.
     - Exact policy version IDs and version numbers evaluated.
     - Matched rule IDs, actions, and violation codes.
     - Evaluated decision and remediation messages.
   - Audit logs and tool requests remain immutable and cannot be altered by application users.

## Phase 7 Updates — Risk Engine Security Architecture

1. **Four-Vector Quantitative Risk Scoring:**
   - Every tool invocation intent is quantitatively assessed across four independent risk vectors:
     - **Tool Blast Radius ($S_{\text{tool}}$, weight 0.35):** Evaluates intrinsic tool risk tier (`LOW`: 0, `MEDIUM`: 25, `HIGH`: 60, `CRITICAL`: 100), access type (`READ`: 0, `WRITE`: 50), and reversibility (`REVERSIBLE`: 0, `IRREVERSIBLE`: 100).
     - **Data Sensitivity & Impact ($S_{\text{data}}$, weight 0.25):** Evaluates data classification (`PUBLIC`: 0, `INTERNAL`: 25, `CONFIDENTIAL`: 60, `RESTRICTED`: 100) and approval requirement (`NOT_REQUIRED`: 0, `OPTIONAL`: 50, `REQUIRED`: 100).
     - **Empirical Agent Trust & Violation History ($S_{\text{agent}}$, weight 0.20):** Combines configured agent risk tier with a 7-day sliding window of eligible invocations ($N \le 50$). When sample size is small ($N < 5$), the status is classified as `INSUFFICIENT_DATA`, defaulting to a conservative baseline trust score of 100.0 (0.0 violation rate) to avoid ungrounded penalties.
     - **Runtime Context Risk ($S_{\text{context}}$, weight 0.20):** Evaluates deployment environment (`DEVELOPMENT`: 0, `STAGING`: 25, `PRODUCTION`: 60) plus declarative and built-in argument heuristic rules (detecting destructive commands, SQL injections, privilege escalation, and high financial transaction values), clamped to $[0, 100]$.
   - The composite risk score is computed as:
     $$S_{\text{composite}} = \text{round}(w_{\text{tool}} S_{\text{tool}} + w_{\text{data}} S_{\text{data}} + w_{\text{agent}} S_{\text{agent}} + w_{\text{context}} S_{\text{context}})$$
     clamped strictly to $[0, 100]$ and classified into discrete bands: `LOW` (0–29), `MEDIUM` (30–59), `HIGH` (60–84), `CRITICAL` (85–100).

2. **5-Stage Precedence Pipeline & Policy Coordination:**
   - The Gateway coordinates platform floor, risk scoring, and policy evaluation in strict sequential order:
     - **Stage 1 (Mandatory Platform Safety Floor):** Identity, tenant ownership, active agent/tool status, tool version publication, agent permission mapping, and JSON Schema argument validation take absolute precedence. Any failure immediately triggers hard `DENY`.
     - **Stage 2 (Risk Denial Pre-Check):** If composite score $\ge \text{deny\_threshold}$ (default 90), the request is immediately denied with `CRITICAL_RISK_THRESHOLD_EXCEEDED` before any policy rules execute.
     - **Stage 3 (Declarative Policy Engine Evaluation):** Policy rules execute with trusted server-side `context.risk_score` and `context.risk_level`. Policy `DENY` is absolute. Policy `ALLOW` can **never** override Stage 2 risk denial or Stage 1 safety floor failures.
     - **Stage 4 (Approval Synthesis):** If composite score $\ge \text{approval\_threshold}$ (default 60) or platform baseline requires human sign-off, `REQUIRE_APPROVAL` is synthesized. Policy `ALLOW` cannot bypass this baseline.
     - **Stage 5 (Clean ALLOW):** Granted only when all checks, risk thresholds, and policy rules permit execution.

3. **Anti-Spoofing & Server-Side Trust Boundaries:**
   - All evaluation metadata (agent risk tier, tool classifications, historical violation counts, active organization configuration) is resolved exclusively from trusted server-side database records.
   - Client-supplied risk scores, trust levels, or bypass flags in headers or request payloads are strictly ignored.

4. **Fail-Closed Guarantees:**
   - If risk scoring encounters an unexpected exception, missing configuration, or persistence failure when saving the `RiskAssessment`, the active transaction is immediately rolled back and the invocation fails closed with a recorded `DENY` (`RISK_EVALUATION_FAILED`). Unvetted executions are mathematically prevented.

5. **Immutable Risk Configuration Versioning & Concurrency Protection:**
   - Tenant risk parameters (vector weights, classification cutoffs, approval/deny thresholds) are managed via immutable versions (`RiskConfigurationVersion`).
   - Publishing a new version is restricted to `ADMIN` and `SECURITY_ANALYST` roles and uses pessimistic row locking (`SELECT ... FOR UPDATE`) on the parent `RiskConfiguration` to prevent race conditions during concurrent administrative publishing.
   - Weights must sum to $1.00 \pm 0.001$, threshold monotonicity is enforced ($0 \le \text{low} < \text{med} < \text{hi} \le 100$), and action threshold alignment ($\text{approval\_threshold} \le \text{deny\_threshold}$) is mandatory.

6. **Infrastructure Failure Exclusions in Agent Profiles:**
   - External tool execution timeouts (`TIMED_OUT`) and handler exceptions (`FAILED`) are categorized as infrastructure failures and are excluded from the agent's eligible invocation sample. This ensures agents are not unfairly penalized with higher violation rates when third-party services fail.

7. **Pure Non-Mutating Simulation:**
   - `POST /api/v1/risk/evaluate` provides simulation capability for security analysts and operators. It computes complete risk telemetry, subscores, factor breakdowns, and heuristic matches using server-side metadata, while guaranteeing zero database mutations (no `ToolRequest` or `RiskAssessment` records created, no agent profile updates).
