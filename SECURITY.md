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
