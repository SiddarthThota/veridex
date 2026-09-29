# VERIDEX — Threat Model

> This document will be fully populated in Phase 17 (Advanced Security & Privacy).

## Threat Categories

| Category | Description | Phase |
|----------|------------|-------|
| Prompt Injection | Direct manipulation of agent behavior through crafted inputs | 13, 17 |
| Indirect Prompt Injection | Injection via tool outputs or retrieved data | 13, 17 |
| Tool Misuse | Agent using tools beyond intended scope | 5, 6, 17 |
| Privilege Escalation | Agent or user gaining unauthorized permissions | 2, 6, 17 |
| Credential Leakage | Exposure of API keys, tokens, or secrets | 17 |
| Agent Impersonation | Unauthorized entity acting as a registered agent | 3, 17 |
| Policy Tampering | Unauthorized modification of governance policies | 6, 17 |
| Audit Tampering | Modification of historical audit records | 9, 17 |
| Replay Attacks | Re-execution of captured valid requests | 17 |
| Approval Abuse | Circumventing the human approval workflow | 8, 17 |
| Cross-Tenant Access | Accessing data belonging to another organization | 2, 17 |
| Data Exfiltration | Unauthorized extraction of sensitive data | 13, 17 |
| Denial of Service | Overwhelming the governance system | 17 |
| Malicious Tool Registration | Registering tools with hidden dangerous behavior | 4, 17 |
