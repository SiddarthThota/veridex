# VERIDEX — Demo Guide

> Full demo walkthrough will be documented after Phase 20.

## Demo Scenario Overview

1. Login as Agent Operator
2. Open Support Resolution Agent
3. Submit normal customer-support request → ALLOW
4. Submit small refund → ALLOW
5. Submit large refund → REQUIRE_APPROVAL
6. Login as approver → Approve
7. Inspect agent run (agent, user, tool, policy, risk, approval, audit, trace)
8. Attempt unauthorized finance access → DENY
9. Run prompt injection scenario → Security event
10. Open incident → Inspect evidence chain
11. Tamper with audit record → Verify chain integrity fails
12. Run policy simulator
13. Run evaluation suite → Show results
