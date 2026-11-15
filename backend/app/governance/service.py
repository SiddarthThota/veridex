"""Governance Gateway Service.

Enforces deterministic, default-deny governance policies for agent tool invocations:
- Organization isolation, agent permissions, tool permissions, and RBAC
- Tool risk metadata, data classification, reversibility, and approval requirements
- Exact ToolVersion binding and integrity hashing
- Approval workflow with replay prevention and re-validation
- Dry-run evaluation without tool execution
- Execution isolation via trusted ToolExecutor
"""

import contextlib
import time
import uuid
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any

import jsonschema
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.agents.models import Agent, AgentStatus
from app.governance.executor import ExecutionResult, ToolExecutor, default_executor
from app.governance.models import (
    AgentRun,
    ApprovalRequest,
    ApprovalStatus,
    GovernanceDecision,
    GovernanceViolationCode,
    RunStatus,
    ToolExecution,
    ToolRequest,
    compute_arguments_hash,
)
from app.governance.schemas import (
    AgentRunCreate,
    GovernanceEvaluateRequest,
    GovernanceEvaluateResponse,
    ToolInvocationRequest,
    ToolInvocationResponse,
)
from app.risk.models import (
    RiskAssessment,
    RiskConfiguration,
    RiskConfigurationVersion,
)
from app.risk.schemas import RiskEvaluationResult
from app.risk.service import (
    DEFAULT_APPROVAL_THRESHOLD,
    DEFAULT_DENY_THRESHOLD,
    RiskEngineService,
)
from app.telemetry import (
    get_tracer,
    record_governance_request,
    record_tool_execution,
    safe_set_attributes,
)
from app.tools.models import (
    AgentToolPermission,
    Tool,
    ToolAccessType,
    ToolApprovalRequirement,
    ToolDataClassification,
    ToolReversibility,
    ToolRiskLevel,
    ToolStatus,
    ToolVersion,
    ToolVersionStatus,
)


@dataclass(frozen=True)
class GovernanceEvaluationOutcome:
    """Immutable outcome of an internal governance evaluation."""

    decision: GovernanceDecision
    violation_codes: list[GovernanceViolationCode | str]
    reason: str
    tool: Tool | None = None
    tool_version: ToolVersion | None = None
    trace_data: dict[str, Any] = field(default_factory=dict)
    risk_evaluation: RiskEvaluationResult | None = None


class GovernanceService:
    """Service managing AgentRuns, governance evaluations, invocations, and approvals."""

    def __init__(self, executor: ToolExecutor | None = None) -> None:
        self.executor = executor or default_executor

    # --- Agent Runs ---

    async def create_agent_run(
        self,
        db: AsyncSession,
        organization_id: uuid.UUID,
        user_id: uuid.UUID,
        payload: AgentRunCreate,
    ) -> AgentRun:
        """Create a new AgentRun after validating agent existence and active status."""
        query = select(Agent).where(
            Agent.id == payload.agent_id,
            Agent.organization_id == organization_id,
        )
        result = await db.execute(query)
        agent = result.scalar_one_or_none()

        if not agent:
            raise ValueError(f"Agent '{payload.agent_id}' not found in organization")
        if agent.status != AgentStatus.ACTIVE:
            raise ValueError(f"Agent '{payload.agent_id}' is not active (current status: {agent.status})")

        run = AgentRun(
            organization_id=organization_id,
            agent_id=payload.agent_id,
            agent_version_id=payload.agent_version_id,
            user_id=user_id,
            status=RunStatus.RUNNING,
            environment=payload.environment,
            trace_id=payload.trace_id,
            input_prompt=payload.input_prompt,
            started_at=datetime.now(UTC),
        )
        db.add(run)
        await db.commit()
        await db.refresh(run)
        return run

    async def get_agent_run(
        self,
        db: AsyncSession,
        organization_id: uuid.UUID,
        run_id: uuid.UUID,
    ) -> AgentRun | None:
        """Retrieve an AgentRun by id within an organization."""
        query = select(AgentRun).where(
            AgentRun.id == run_id,
            AgentRun.organization_id == organization_id,
        )
        result = await db.execute(query)
        return result.scalar_one_or_none()

    async def list_agent_runs(
        self,
        db: AsyncSession,
        organization_id: uuid.UUID,
        agent_id: uuid.UUID | None = None,
        status: RunStatus | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> tuple[list[AgentRun], int]:
        """List AgentRuns with pagination and optional filtering."""
        query = select(AgentRun).where(AgentRun.organization_id == organization_id)
        if agent_id:
            query = query.where(AgentRun.agent_id == agent_id)
        if status:
            query = query.where(AgentRun.status == status)

        count_query = select(func.count()).select_from(query.subquery())
        total = (await db.execute(count_query)).scalar_one()

        query = query.order_by(AgentRun.created_at.desc()).limit(limit).offset(offset)
        result = await db.execute(query)
        return list(result.scalars().all()), total

    async def update_agent_run_status(
        self,
        db: AsyncSession,
        organization_id: uuid.UUID,
        run_id: uuid.UUID,
        new_status: RunStatus,
        output_summary: str | None = None,
        error_message: str | None = None,
    ) -> AgentRun | None:
        """Update an AgentRun status and record completion timestamp if terminal."""
        run = await self.get_agent_run(db, organization_id, run_id)
        if not run:
            return None

        run.status = new_status
        if output_summary is not None:
            run.output_summary = output_summary
        if error_message is not None:
            run.error_message = error_message
        if new_status in {RunStatus.COMPLETED, RunStatus.FAILED, RunStatus.CANCELLED}:
            run.completed_at = datetime.now(UTC)

        await db.commit()
        await db.refresh(run)
        return run

    # --- Governance Evaluation Engine ---

    async def evaluate(
        self,
        db: AsyncSession,
        organization_id: uuid.UUID,
        request: GovernanceEvaluateRequest,
    ) -> GovernanceEvaluateResponse:
        """Dry-run governance evaluation.

        Complies with Dry-Run Safety:
        - Never executes a tool.
        - Does NOT create an executable ToolExecution or persistent ToolRequest.
        - Returns the decision, machine-readable reason codes, and integrity hash.
        """
        outcome = await self._evaluate_policy(
            db=db,
            organization_id=organization_id,
            agent_id=request.agent_id,
            tool_id=request.tool_id,
            tool_version_id=request.tool_version_id,
            arguments=request.arguments,
        )

        integrity_hash = compute_arguments_hash(request.tool_version_id, request.arguments)

        v_codes: list[GovernanceViolationCode] = []
        for c in outcome.violation_codes:
            if isinstance(c, GovernanceViolationCode):
                v_codes.append(c)
            elif isinstance(c, str):
                with contextlib.suppress(ValueError):
                    v_codes.append(GovernanceViolationCode(c))

        return GovernanceEvaluateResponse(
            decision=outcome.decision,
            violation_codes=v_codes,
            reason=outcome.reason,
            evaluated_at=datetime.now(UTC),
            integrity_hash=integrity_hash,
            approval_required=(outcome.decision == GovernanceDecision.REQUIRE_APPROVAL),
            tool_id=request.tool_id,
            tool_version_id=request.tool_version_id,
        )

    async def _evaluate_policy(
        self,
        db: AsyncSession,
        organization_id: uuid.UUID,
        agent_id: uuid.UUID,
        tool_id: uuid.UUID,
        tool_version_id: uuid.UUID,
        arguments: dict[str, Any],
        run_environment: str = "DEVELOPMENT",
    ) -> GovernanceEvaluationOutcome:
        """Internal deterministic governance evaluation implementing strict decision precedence."""
        # 1. Agent Validation
        agent_query = select(Agent).where(
            Agent.id == agent_id,
            Agent.organization_id == organization_id,
        )
        agent = (await db.execute(agent_query)).scalar_one_or_none()
        if not agent:
            return GovernanceEvaluationOutcome(
                decision=GovernanceDecision.DENY,
                violation_codes=[GovernanceViolationCode.UNKNOWN_AGENT],
                reason=f"Agent '{agent_id}' not found in organization",
                tool=None,
                tool_version=None,
            )
        if agent.status != AgentStatus.ACTIVE:
            return GovernanceEvaluationOutcome(
                decision=GovernanceDecision.DENY,
                violation_codes=[GovernanceViolationCode.INACTIVE_AGENT],
                reason=f"Agent '{agent_id}' is not active (status: {agent.status})",
                tool=None,
                tool_version=None,
            )

        # 2. Tool Validation
        tool_query = select(Tool).where(
            Tool.id == tool_id,
            Tool.organization_id == organization_id,
        )
        tool = (await db.execute(tool_query)).scalar_one_or_none()
        if not tool:
            return GovernanceEvaluationOutcome(
                decision=GovernanceDecision.DENY,
                violation_codes=[GovernanceViolationCode.UNKNOWN_TOOL],
                reason=f"Tool '{tool_id}' not found in organization",
                tool=None,
                tool_version=None,
            )
        if tool.status != ToolStatus.ACTIVE:
            return GovernanceEvaluationOutcome(
                decision=GovernanceDecision.DENY,
                violation_codes=[GovernanceViolationCode.INACTIVE_TOOL],
                reason=f"Tool '{tool_id}' is not active (status: {tool.status})",
                tool=tool,
                tool_version=None,
            )

        # 3. ToolVersion Validation
        version_query = select(ToolVersion).where(
            ToolVersion.id == tool_version_id,
            ToolVersion.tool_id == tool.id,
        )
        tool_version = (await db.execute(version_query)).scalar_one_or_none()
        if not tool_version:
            return GovernanceEvaluationOutcome(
                decision=GovernanceDecision.DENY,
                violation_codes=[GovernanceViolationCode.UNPUBLISHED_TOOL_VERSION],
                reason=f"ToolVersion '{tool_version_id}' not found for tool '{tool_id}'",
                tool=tool,
                tool_version=None,
            )
        if tool_version.status != ToolVersionStatus.PUBLISHED:
            return GovernanceEvaluationOutcome(
                decision=GovernanceDecision.DENY,
                violation_codes=[GovernanceViolationCode.UNPUBLISHED_TOOL_VERSION],
                reason=f"ToolVersion '{tool_version.version}' is not published (status: {tool_version.status})",
                tool=tool,
                tool_version=tool_version,
            )

        # 4. Agent Tool Permission Check
        perm_query = select(AgentToolPermission).where(
            AgentToolPermission.agent_id == agent.id,
            AgentToolPermission.tool_id == tool.id,
        )
        permission = (await db.execute(perm_query)).scalar_one_or_none()
        if not permission or not permission.allowed:
            return GovernanceEvaluationOutcome(
                decision=GovernanceDecision.DENY,
                violation_codes=[GovernanceViolationCode.PERMISSION_DENIED],
                reason=f"Agent '{agent.name}' does not have permission to invoke tool '{tool.name}'",
                tool=tool,
                tool_version=tool_version,
            )

        # 5. Schema Validation
        if tool_version.input_schema:
            try:
                jsonschema.validate(instance=arguments, schema=tool_version.input_schema)
            except jsonschema.ValidationError as err:
                return GovernanceEvaluationOutcome(
                    decision=GovernanceDecision.DENY,
                    violation_codes=[GovernanceViolationCode.INVALID_ARGUMENTS],
                    reason=f"Arguments failed schema validation: {err.message}",
                    tool=tool,
                    tool_version=tool_version,
                )
            except Exception as exc:  # noqa: BLE001
                return GovernanceEvaluationOutcome(
                    decision=GovernanceDecision.DENY,
                    violation_codes=[GovernanceViolationCode.INVALID_ARGUMENTS],
                    reason=f"Schema validation error: {exc}",
                    tool=tool,
                    tool_version=tool_version,
                )

        # Stage 2: Risk Engine Quantitative Calculation & Risk Denial Pre-Check
        stmt_c = (
            select(RiskConfiguration)
            .options(selectinload(RiskConfiguration.current_version))
            .where(RiskConfiguration.organization_id == organization_id)
        )
        res_c = await db.execute(stmt_c)
        risk_config = res_c.scalar_one_or_none()
        selected_version: RiskConfigurationVersion | None = (
            risk_config.current_version
            if (risk_config and risk_config.is_active and risk_config.current_version)
            else None
        )

        try:
            (
                history_status,
                violation_rate,
                eligible_count,
                violation_count,
            ) = await RiskEngineService.get_agent_violation_metrics(
                db_session=db,
                organization_id=organization_id,
                agent_id=agent.id,
            )

            risk_eval = RiskEngineService.evaluate_risk(
                organization_id=organization_id,
                agent_risk_tier=str(agent.risk_tier),
                tool_risk_level=str(tool.risk_level),
                tool_access_type=str(tool.access_type),
                tool_reversibility=str(tool.reversibility),
                tool_data_classification=str(tool.data_classification),
                tool_approval_requirement=str(tool.approval_requirement),
                arguments=arguments,
                environment=run_environment,
                history_status=history_status,
                violation_rate=violation_rate,
                total_eligible_invocations=eligible_count,
                total_violations=violation_count,
                config_version=selected_version,
            )
        except Exception as exc:
            # Fail closed on risk evaluation errors
            return GovernanceEvaluationOutcome(
                decision=GovernanceDecision.DENY,
                violation_codes=[GovernanceViolationCode.RISK_EVALUATION_FAILED],
                reason=f"Risk evaluation failed (fail-closed): {exc}",
                tool=tool,
                tool_version=tool_version,
                trace_data={},
                risk_evaluation=None,
            )

        deny_threshold = selected_version.deny_threshold if selected_version else DEFAULT_DENY_THRESHOLD
        approval_threshold = selected_version.approval_threshold if selected_version else DEFAULT_APPROVAL_THRESHOLD

        # Risk Denial Pre-Check: risk_score >= deny_threshold -> DENY
        if risk_eval.risk_score >= deny_threshold:
            risk_deny_trace: dict[str, Any] = {
                "tier1_checks": "PASSED",
                "risk_score": risk_eval.risk_score,
                "risk_level": risk_eval.risk_level.value,
                "deny_threshold": deny_threshold,
                "decision": "DENY",
                "reason": f"Risk score ({risk_eval.risk_score}) exceeds critical deny threshold ({deny_threshold})",
            }
            return GovernanceEvaluationOutcome(
                decision=GovernanceDecision.DENY,
                violation_codes=[GovernanceViolationCode.CRITICAL_RISK_THRESHOLD_EXCEEDED],
                reason=f"Risk score ({risk_eval.risk_score}) exceeds critical deny threshold ({deny_threshold})",
                tool=tool,
                tool_version=tool_version,
                trace_data=risk_deny_trace,
                risk_evaluation=risk_eval,
            )

        # Stage 3: Declarative Policy Engine Evaluation
        from app.policies.models import PolicyAction
        from app.policies.service import policy_service

        additional_context = {
            "risk_score": risk_eval.risk_score,
            "risk_level": risk_eval.risk_level.value,
        }

        policy_action, policy_violations, policy_remediations, matched_traces = await policy_service.evaluate_policies(
            db=db,
            organization_id=organization_id,
            agent=agent,
            tool=tool,
            tool_version=tool_version,
            arguments=arguments,
            run_environment=run_environment,
            additional_context=additional_context,
        )

        trace_data: dict[str, Any] = {
            "matched_policies": matched_traces,
            "tier1_checks": "PASSED",
            "risk_score": risk_eval.risk_score,
            "risk_level": risk_eval.risk_level.value,
        }

        # Policy Precedence Rule: DENY always wins
        if policy_action == PolicyAction.DENY:
            combined_reason = "; ".join(policy_remediations) or "Denied by active organization policy"
            return GovernanceEvaluationOutcome(
                decision=GovernanceDecision.DENY,
                violation_codes=policy_violations,
                reason=combined_reason,
                tool=tool,
                tool_version=tool_version,
                trace_data={**trace_data, "decision": "DENY"},
                risk_evaluation=risk_eval,
            )

        # Stage 4: Approval Synthesis
        approval_reasons: list[str] = []

        if risk_eval.risk_score >= approval_threshold:
            approval_reasons.append(
                f"Risk score ({risk_eval.risk_score}) exceeds approval threshold ({approval_threshold})"
            )

        if tool.approval_requirement == ToolApprovalRequirement.REQUIRED:
            approval_reasons.append("Tool configuration explicitly requires approval")

        if tool.risk_level == ToolRiskLevel.CRITICAL:
            approval_reasons.append("Tool has CRITICAL risk level")

        if tool.access_type == ToolAccessType.WRITE and tool.reversibility == ToolReversibility.IRREVERSIBLE:
            approval_reasons.append("Tool performs IRREVERSIBLE WRITE operations")

        if tool.data_classification == ToolDataClassification.RESTRICTED:
            approval_reasons.append("Tool operates on RESTRICTED data")

        # If Policy Engine requested approval OR Risk threshold triggered OR Baseline Safety triggered
        if policy_action == PolicyAction.REQUIRE_APPROVAL or approval_reasons:
            combined_violations: list[GovernanceViolationCode | str] = []
            if approval_reasons:
                combined_violations.append(GovernanceViolationCode.APPROVAL_REQUIRED)
            combined_violations.extend(policy_violations)

            all_reasons = approval_reasons + policy_remediations
            combined_reason = "; ".join(all_reasons)

            return GovernanceEvaluationOutcome(
                decision=GovernanceDecision.REQUIRE_APPROVAL,
                violation_codes=combined_violations,
                reason=combined_reason,
                tool=tool,
                tool_version=tool_version,
                trace_data={
                    **trace_data,
                    "decision": "REQUIRE_APPROVAL",
                    "baseline_triggers": approval_reasons,
                },
                risk_evaluation=risk_eval,
            )

        # Stage 5: ALLOW - Every check passed cleanly
        return GovernanceEvaluationOutcome(
            decision=GovernanceDecision.ALLOW,
            violation_codes=[],
            reason="All governance policies and security checks passed",
            tool=tool,
            tool_version=tool_version,
            trace_data={**trace_data, "decision": "ALLOW"},
            risk_evaluation=risk_eval,
        )

    # --- Tool Execution with Telemetry ---

    async def _execute_tool_with_telemetry(
        self,
        tool: Tool,
        arguments: dict[str, Any],
        environment: str,
    ) -> ExecutionResult:
        """Execute a tool wrapped in an OpenTelemetry child span with metrics emission."""
        tracer = get_tracer("veridex.governance")
        op_category = (
            tool.access_type.value.lower()
            if hasattr(tool, "access_type") and tool.access_type is not None
            else "execute"
        )
        with tracer.start_as_current_span("veridex.tool.execute") as child_span:
            safe_set_attributes(
                child_span,
                {
                    "veridex.operation": op_category,
                    "veridex.tool_id": str(tool.id),
                },
            )

            exec_result = await self.executor.execute(
                slug=tool.slug,
                arguments=arguments,
                timeout_seconds=tool.timeout_seconds,
            )

            status_str = exec_result.status.value if hasattr(exec_result.status, "value") else str(exec_result.status)

            safe_set_attributes(
                child_span,
                {
                    "veridex.status": status_str,
                    "veridex.duration_ms": exec_result.duration_ms,
                },
            )

            record_tool_execution(
                operation=op_category,
                status=status_str,
                environment=environment,
                duration_seconds=exec_result.duration_ms / 1000.0,
            )

            return exec_result

    # --- Tool Invocation Gateway ---

    async def invoke_tool(
        self,
        db: AsyncSession,
        organization_id: uuid.UUID,
        run_id: uuid.UUID,
        request: ToolInvocationRequest,
    ) -> ToolInvocationResponse:
        """Execute a tool invocation through the deterministic Governance Gateway."""
        tracer = get_tracer("veridex.governance")
        eval_start_time = time.monotonic()

        with tracer.start_as_current_span("veridex.governance.evaluate") as span:
            safe_set_attributes(
                span,
                {
                    "veridex.organization_id": str(organization_id),
                    "veridex.run_id": str(run_id),
                    "veridex.agent_id": str(request.agent_id),
                    "veridex.tool_id": str(request.tool_id),
                    "veridex.tool_version_id": str(request.tool_version_id),
                },
            )

            # Validate active AgentRun
            run = await self.get_agent_run(db, organization_id, run_id)
            if not run:
                raise ValueError(f"AgentRun '{run_id}' not found in organization")
            if run.status != RunStatus.RUNNING:
                raise ValueError(f"AgentRun '{run_id}' is not in RUNNING status (current: {run.status})")

            # Idempotency Check
            if request.idempotency_key:
                existing_query = (
                    select(ToolRequest)
                    .where(
                        ToolRequest.organization_id == organization_id,
                        ToolRequest.idempotency_key == request.idempotency_key,
                    )
                    .options(
                        selectinload(ToolRequest.execution),
                        selectinload(ToolRequest.approval_request),
                    )
                )
                existing_req = (await db.execute(existing_query)).scalar_one_or_none()
                if existing_req:
                    duration_sec = time.monotonic() - eval_start_time
                    dec_str = (
                        existing_req.decision.value
                        if hasattr(existing_req.decision, "value")
                        else str(existing_req.decision)
                    )
                    safe_set_attributes(
                        span,
                        {
                            "veridex.decision": dec_str,
                            "veridex.violation_codes": [str(c) for c in (existing_req.violation_codes or [])],
                            "veridex.risk_level": "UNKNOWN",
                        },
                    )
                    record_governance_request(
                        decision=dec_str,
                        risk_level="UNKNOWN",
                        environment=run.environment,
                        duration_seconds=duration_sec,
                    )
                    return ToolInvocationResponse(
                        run_id=existing_req.run_id or run.id,
                        tool_request_id=existing_req.id,
                        decision=existing_req.decision,
                        violation_codes=existing_req.violation_codes,
                        reason="Idempotent replay of previously evaluated request",
                        arguments_hash=existing_req.arguments_hash,
                        execution_status=existing_req.execution.status if existing_req.execution else None,
                        result=existing_req.execution.result if existing_req.execution else None,
                        error_message=existing_req.execution.error_message if existing_req.execution else None,
                        approval_request_id=existing_req.approval_request.id if existing_req.approval_request else None,
                        idempotency_key=existing_req.idempotency_key,
                        evaluation_duration_ms=existing_req.evaluation_duration_ms,
                    )

            # Governance Evaluation Timing Boundary
            eval_start_ns = time.perf_counter_ns()
            try:
                outcome = await self._evaluate_policy(
                    db=db,
                    organization_id=organization_id,
                    agent_id=request.agent_id,
                    tool_id=request.tool_id,
                    tool_version_id=request.tool_version_id,
                    arguments=request.arguments,
                    run_environment=run.environment,
                )
            finally:
                eval_end_ns = time.perf_counter_ns()
                eval_duration_ms = (eval_end_ns - eval_start_ns) / 1_000_000.0
            duration_sec = time.monotonic() - eval_start_time
            decision = outcome.decision
            violation_codes = outcome.violation_codes
            reason = outcome.reason
            tool = outcome.tool
            policy_trace = outcome.trace_data
            risk_eval = outcome.risk_evaluation
            arguments_hash = compute_arguments_hash(request.tool_version_id, request.arguments)

            dec_str = decision.value if hasattr(decision, "value") else str(decision)
            v_codes_str = [code.value if hasattr(code, "value") else str(code) for code in violation_codes]

            risk_lvl_str = "UNKNOWN"
            if risk_eval is not None and risk_eval.risk_level is not None:
                risk_lvl_str = (
                    risk_eval.risk_level.value if hasattr(risk_eval.risk_level, "value") else str(risk_eval.risk_level)
                )
            elif tool is not None and tool.risk_level is not None:
                risk_lvl_str = tool.risk_level.value if hasattr(tool.risk_level, "value") else str(tool.risk_level)

            op_category = (
                tool.access_type.value.lower()
                if tool is not None and hasattr(tool, "access_type") and tool.access_type is not None
                else None
            )

            safe_set_attributes(
                span,
                {
                    "veridex.decision": dec_str,
                    "veridex.violation_codes": v_codes_str,
                    "veridex.risk_level": risk_lvl_str,
                    "veridex.operation": op_category,
                    "veridex.risk_score": int(risk_eval.risk_score) if risk_eval is not None else None,
                },
            )

            record_governance_request(
                decision=dec_str,
                risk_level=risk_lvl_str,
                environment=run.environment,
                duration_seconds=duration_sec,
            )

            # Record ToolRequest audit trail
            tool_request = ToolRequest(
                run_id=run.id,
                organization_id=organization_id,
                agent_id=request.agent_id,
                tool_id=request.tool_id,
                tool_version_id=request.tool_version_id,
                arguments=request.arguments,
                arguments_hash=arguments_hash,
                decision=decision,
                violation_codes=v_codes_str,
                reason=reason,
                policy_evaluations=policy_trace,
                environment=run.environment,
                evaluated_at=datetime.now(UTC),
                idempotency_key=request.idempotency_key,
                evaluation_duration_ms=eval_duration_ms,
            )
            db.add(tool_request)
            await db.flush()

            # Persist RiskAssessment if risk was evaluated
            if risk_eval is not None:
                try:
                    assessment = RiskAssessment(
                        organization_id=organization_id,
                        tool_request_id=tool_request.id,
                        agent_id=request.agent_id,
                        tool_id=request.tool_id,
                        tool_version_id=request.tool_version_id,
                        config_version_id=risk_eval.config_version_id,
                        scoring_algorithm_version=risk_eval.scoring_algorithm_version,
                        risk_score=risk_eval.risk_score,
                        risk_level=risk_eval.risk_level,
                        subscore_tool=risk_eval.subscores.tool,
                        subscore_data=risk_eval.subscores.data,
                        subscore_agent=risk_eval.subscores.agent,
                        subscore_context=risk_eval.subscores.context,
                        factor_breakdown=risk_eval.factor_breakdown,
                        heuristics_matched=[m.model_dump() for m in risk_eval.heuristics_matched],
                        config_snapshot=risk_eval.config_snapshot,
                        explanation=risk_eval.explanation,
                        assessed_at=risk_eval.assessed_at,
                    )
                    db.add(assessment)
                    await db.flush()
                    tool_request.risk_assessment_id = assessment.id
                    await db.flush()
                except Exception as exc:
                    await db.rollback()
                    failed_request = ToolRequest(
                        run_id=run.id,
                        organization_id=organization_id,
                        agent_id=request.agent_id,
                        tool_id=request.tool_id,
                        tool_version_id=request.tool_version_id,
                        arguments=request.arguments,
                        arguments_hash=arguments_hash,
                        decision=GovernanceDecision.DENY,
                        violation_codes=[GovernanceViolationCode.RISK_EVALUATION_FAILED.value],
                        reason=f"Risk assessment persistence failed (fail-closed): {exc}",
                        policy_evaluations=policy_trace,
                        environment=run.environment,
                        evaluated_at=datetime.now(UTC),
                        idempotency_key=request.idempotency_key,
                        evaluation_duration_ms=eval_duration_ms,
                    )
                    db.add(failed_request)
                    await db.commit()
                    return ToolInvocationResponse(
                        run_id=run.id,
                        tool_request_id=failed_request.id,
                        decision=GovernanceDecision.DENY,
                        violation_codes=[GovernanceViolationCode.RISK_EVALUATION_FAILED.value],
                        reason=f"Risk assessment persistence failed (fail-closed): {exc}",
                        arguments_hash=arguments_hash,
                        execution_status=None,
                        result=None,
                        error_message=None,
                        approval_request_id=None,
                        idempotency_key=request.idempotency_key,
                        evaluation_duration_ms=failed_request.evaluation_duration_ms,
                    )

            # Decision: DENY
            if decision == GovernanceDecision.DENY:
                await db.commit()
                return ToolInvocationResponse(
                    run_id=run.id,
                    tool_request_id=tool_request.id,
                    decision=decision,
                    violation_codes=v_codes_str,
                    reason=reason,
                    arguments_hash=arguments_hash,
                    execution_status=None,
                    result=None,
                    error_message=None,
                    approval_request_id=None,
                    idempotency_key=request.idempotency_key,
                    evaluation_duration_ms=tool_request.evaluation_duration_ms,
                )

            # Decision: REQUIRE_APPROVAL
            if decision == GovernanceDecision.REQUIRE_APPROVAL:
                approval_request = ApprovalRequest(
                    organization_id=organization_id,
                    tool_request_id=tool_request.id,
                    status=ApprovalStatus.PENDING,
                    integrity_hash=arguments_hash,
                )
                db.add(approval_request)
                await db.commit()
                await db.refresh(approval_request)

                return ToolInvocationResponse(
                    run_id=run.id,
                    tool_request_id=tool_request.id,
                    decision=decision,
                    violation_codes=v_codes_str,
                    reason=reason,
                    arguments_hash=arguments_hash,
                    execution_status=None,
                    result=None,
                    error_message=None,
                    approval_request_id=approval_request.id,
                    idempotency_key=request.idempotency_key,
                    evaluation_duration_ms=tool_request.evaluation_duration_ms,
                )

            # Decision: ALLOW -> Execute Tool
            assert tool is not None
            exec_result = await self._execute_tool_with_telemetry(
                tool=tool,
                arguments=request.arguments,
                environment=run.environment,
            )

            tool_execution = ToolExecution(
                tool_request_id=tool_request.id,
                status=exec_result.status,
                result=exec_result.result,
                error_message=exec_result.error_message,
                duration_ms=exec_result.duration_ms,
                executed_at=datetime.now(UTC),
            )
            db.add(tool_execution)
            await db.commit()

            return ToolInvocationResponse(
                run_id=run.id,
                tool_request_id=tool_request.id,
                decision=decision,
                violation_codes=[],
                reason=reason,
                arguments_hash=arguments_hash,
                execution_status=exec_result.status,
                result=exec_result.result,
                error_message=exec_result.error_message,
                approval_request_id=None,
                idempotency_key=request.idempotency_key,
                evaluation_duration_ms=tool_request.evaluation_duration_ms,
            )

    # --- Approval Workflow ---

    async def list_approvals(
        self,
        db: AsyncSession,
        organization_id: uuid.UUID,
        status: ApprovalStatus | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> tuple[list[ApprovalRequest], int]:
        """List approval requests with pagination and optional status filter."""
        query = select(ApprovalRequest).where(ApprovalRequest.organization_id == organization_id)
        if status:
            query = query.where(ApprovalRequest.status == status)

        count_query = select(func.count()).select_from(query.subquery())
        total = (await db.execute(count_query)).scalar_one()

        query = (
            query.options(selectinload(ApprovalRequest.tool_request).selectinload(ToolRequest.execution))
            .order_by(ApprovalRequest.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
        result = await db.execute(query)
        return list(result.scalars().all()), total

    async def get_approval(
        self,
        db: AsyncSession,
        organization_id: uuid.UUID,
        approval_id: uuid.UUID,
    ) -> ApprovalRequest | None:
        """Retrieve approval request details by id."""
        query = (
            select(ApprovalRequest)
            .where(
                ApprovalRequest.id == approval_id,
                ApprovalRequest.organization_id == organization_id,
            )
            .options(selectinload(ApprovalRequest.tool_request).selectinload(ToolRequest.execution))
        )
        result = await db.execute(query)
        return result.scalar_one_or_none()

    async def decide_approval(
        self,
        db: AsyncSession,
        organization_id: uuid.UUID,
        approval_id: uuid.UUID,
        approver_user_id: uuid.UUID,
        decision: ApprovalStatus,
        reason: str | None = None,
    ) -> ApprovalRequest:
        """Process an approval decision.

        Enforces:
        - Must be in PENDING status (prevents double approval / replay)
        - Decision must be APPROVED or REJECTED
        - Revalidates integrity hash against evaluated arguments and ToolVersion
        - Revalidates tool and agent state before execution
        - Executes tool upon approval and stores persistent execution outcome
        """
        if decision not in {ApprovalStatus.APPROVED, ApprovalStatus.REJECTED}:
            raise ValueError("Approval decision must be either APPROVED or REJECTED")

        query = (
            select(ApprovalRequest)
            .where(
                ApprovalRequest.id == approval_id,
                ApprovalRequest.organization_id == organization_id,
            )
            .options(selectinload(ApprovalRequest.tool_request).selectinload(ToolRequest.execution))
            .with_for_update()
        )
        result = await db.execute(query)
        approval = result.scalar_one_or_none()

        if not approval:
            raise ValueError(f"ApprovalRequest '{approval_id}' not found")

        if approval.status != ApprovalStatus.PENDING:
            raise ValueError(f"ApprovalRequest '{approval_id}' is already decided (status: {approval.status})")

        tool_request = approval.tool_request
        if not tool_request:
            raise ValueError("Associated ToolRequest not found for approval")

        # Approval Integrity: Re-validate arguments hash
        expected_hash = compute_arguments_hash(tool_request.tool_version_id, tool_request.arguments)
        if approval.integrity_hash != expected_hash:
            raise ValueError("Integrity hash mismatch: Tool arguments or version have been altered")

        # Re-validate tool and agent current state
        tool_query = select(Tool).where(Tool.id == tool_request.tool_id)
        tool = (await db.execute(tool_query)).scalar_one_or_none()
        if not tool or tool.status != ToolStatus.ACTIVE:
            raise ValueError("Tool is no longer active; cannot execute approved request")

        agent_query = select(Agent).where(Agent.id == tool_request.agent_id)
        agent = (await db.execute(agent_query)).scalar_one_or_none()
        if not agent or agent.status != AgentStatus.ACTIVE:
            raise ValueError("Agent is no longer active; cannot execute approved request")

        # Update approval record
        approval.status = decision
        approval.approver_user_id = approver_user_id
        approval.decision_reason = reason
        approval.decided_at = datetime.now(UTC)

        # If rejected, persist decision and return without execution
        if decision == ApprovalStatus.REJECTED:
            await db.commit()
            updated_approval = await self.get_approval(db, organization_id, approval_id)
            assert updated_approval is not None
            return updated_approval

        # If approved, ensure no duplicate execution
        if tool_request.execution:
            await db.commit()
            updated_approval = await self.get_approval(db, organization_id, approval_id)
            assert updated_approval is not None
            return updated_approval

        # Execute approved tool
        exec_result = await self._execute_tool_with_telemetry(
            tool=tool,
            arguments=tool_request.arguments,
            environment=tool_request.environment,
        )

        tool_execution = ToolExecution(
            tool_request_id=tool_request.id,
            status=exec_result.status,
            result=exec_result.result,
            error_message=exec_result.error_message,
            duration_ms=exec_result.duration_ms,
            executed_at=datetime.now(UTC),
        )
        db.add(tool_execution)
        tool_request.execution = tool_execution
        approval.tool_request = tool_request
        await db.commit()
        db.expire_all()
        updated_approval = await self.get_approval(db, organization_id, approval_id)
        assert updated_approval is not None
        return updated_approval

    # --- Tool Invocations Listing ---

    async def list_run_invocations(
        self,
        db: AsyncSession,
        organization_id: uuid.UUID,
        run_id: uuid.UUID,
        limit: int = 50,
        offset: int = 0,
    ) -> tuple[list[ToolRequest], int]:
        """List tool requests and executions within an AgentRun."""
        run = await self.get_agent_run(db, organization_id, run_id)
        if not run:
            raise ValueError(f"AgentRun '{run_id}' not found")

        query = select(ToolRequest).where(
            ToolRequest.run_id == run_id,
            ToolRequest.organization_id == organization_id,
        )

        count_query = select(func.count()).select_from(query.subquery())
        total = (await db.execute(count_query)).scalar_one()

        query = (
            query.options(
                selectinload(ToolRequest.execution),
                selectinload(ToolRequest.approval_request),
            )
            .order_by(ToolRequest.created_at.asc())
            .limit(limit)
            .offset(offset)
        )
        result = await db.execute(query)
        return list(result.scalars().all()), total


governance_service = GovernanceService()
