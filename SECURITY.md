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
