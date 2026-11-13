"""Risk Engine Service for Veridex (Phase 7).

Implements deterministic 4-vector risk scoring, empirical sliding-window agent
history tracking, path-scoped argument heuristics, and immutable audit assessment generation.
"""

import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload, selectinload

from app.agents.models import Agent
from app.governance.models import (
    ApprovalStatus,
    ExecutionStatus,
    GovernanceDecision,
    GovernanceViolationCode,
    ToolRequest,
)
from app.risk.heuristics import evaluate_argument_heuristics
from app.risk.models import (
    AgentHistoryStatus,
    AgentRiskProfile,
    RiskAssessment,
    RiskConfiguration,
    RiskConfigurationVersion,
    RiskLevel,
)
from app.risk.schemas import (
    AgentRiskProfileResponse,
    HeuristicMatch,
    RiskConfigurationVersionCreate,
    RiskEvaluationResult,
    RiskSimulateRequest,
    RiskSimulateResponse,
    SubscoresBreakdown,
)
from app.tools.models import Tool, ToolVersion

# Scoring Algorithm Metadata
SCORING_ALGORITHM_VERSION = "1.0.0"

# Default Vector Weights (must sum to 1.0)
DEFAULT_WEIGHT_TOOL = 0.35
DEFAULT_WEIGHT_DATA = 0.25
DEFAULT_WEIGHT_AGENT = 0.20
DEFAULT_WEIGHT_CONTEXT = 0.20

# Default Thresholds
DEFAULT_THRESHOLD_MEDIUM = 30
DEFAULT_THRESHOLD_HIGH = 60
DEFAULT_THRESHOLD_CRITICAL = 85
DEFAULT_APPROVAL_THRESHOLD = 60
DEFAULT_DENY_THRESHOLD = 90

# Fallback Points for Insufficient Agent History
FALLBACK_VIOLATION_SCORE = 35.0

# Factor Points Mappings
TOOL_RISK_LEVEL_POINTS: dict[str, float] = {
    "LOW": 10.0,
    "MEDIUM": 35.0,
    "HIGH": 70.0,
    "CRITICAL": 95.0,
}

TOOL_ACCESS_TYPE_POINTS: dict[str, float] = {
    "READ": 0.0,
    "WRITE": 30.0,
}

TOOL_REVERSIBILITY_POINTS: dict[str, float] = {
    "REVERSIBLE": 0.0,
    "IRREVERSIBLE": 40.0,
}

DATA_CLASSIFICATION_POINTS: dict[str, float] = {
    "PUBLIC": 0.0,
    "INTERNAL": 25.0,
    "CONFIDENTIAL": 60.0,
    "RESTRICTED": 100.0,
}

APPROVAL_REQUIREMENT_POINTS: dict[str, float] = {
    "NOT_REQUIRED": 0.0,
    "OPTIONAL": 20.0,
    "REQUIRED": 50.0,
}

AGENT_RISK_TIER_POINTS: dict[str, float] = {
    "LOW": 15.0,
    "MEDIUM": 40.0,
    "HIGH": 75.0,
    "CRITICAL": 95.0,
}

ENVIRONMENT_POINTS: dict[str, float] = {
    "DEVELOPMENT": 10.0,
    "STAGING": 40.0,
    "PRODUCTION": 80.0,
}

# Misconduct codes counted as violations in agent history
MISCONDUCT_VIOLATION_CODES: set[str] = {
    GovernanceViolationCode.PERMISSION_DENIED.value,
    GovernanceViolationCode.ARGUMENTS_HASH_MISMATCH.value,
    GovernanceViolationCode.DUPLICATE_APPROVAL_PROCESSING.value,
    GovernanceViolationCode.HIGH_RISK_RESTRICTION.value,
    GovernanceViolationCode.IRREVERSIBLE_WRITE_RESTRICTION.value,
    GovernanceViolationCode.RESTRICTED_DATA_ACCESS.value,
    GovernanceViolationCode.RATE_LIMIT_EXCEEDED.value,
    GovernanceViolationCode.CRITICAL_RISK_THRESHOLD_EXCEEDED.value,
    "POLICY_VIOLATION",
    "TAMPER_DETECTED",
}

# Exclusions from eligible invocations (infrastructure / rollout / unhandled states)
INFRASTRUCTURE_EXCLUSION_CODES: set[str] = {
    GovernanceViolationCode.UNKNOWN_AGENT.value,
    GovernanceViolationCode.INACTIVE_AGENT.value,
    GovernanceViolationCode.UNKNOWN_TOOL.value,
    GovernanceViolationCode.INACTIVE_TOOL.value,
    GovernanceViolationCode.UNPUBLISHED_TOOL_VERSION.value,
    GovernanceViolationCode.ORGANIZATION_MISMATCH.value,
}


class RiskEngineService:
    """Core quantitative risk evaluation and assessment service."""

    @staticmethod
    def validate_configuration(
        weight_tool: float,
        weight_data: float,
        weight_agent: float,
        weight_context: float,
        threshold_medium: int,
        threshold_high: int,
        threshold_critical: int,
        approval_threshold: int,
        deny_threshold: int,
    ) -> None:
        """Validate that weights and thresholds conform to mathematical constraints."""
        weights = [weight_tool, weight_data, weight_agent, weight_context]
        if any(w < 0.0 or w > 1.0 for w in weights):
            raise ValueError("Risk weights must each be between 0.0 and 1.0")

        total_weight = sum(weights)
        if abs(total_weight - 1.0) > 0.001:
            raise ValueError(f"Risk weights must sum to 1.0, got {round(total_weight, 4)}")

        if not (0 <= threshold_medium <= threshold_high <= threshold_critical <= 100):
            raise ValueError("Threshold boundaries must satisfy 0 <= MEDIUM <= HIGH <= CRITICAL <= 100")

        if not (0 <= approval_threshold <= deny_threshold <= 100):
            raise ValueError("Trigger thresholds must satisfy 0 <= APPROVAL <= DENY <= 100")

    @classmethod
    def calculate_tool_subscore(
        cls,
        risk_level: str,
        access_type: str,
        reversibility: str,
    ) -> float:
        """Compute Tool Intrinsic Risk subscore (S_tool in [0, 100])."""
        rl_pts = TOOL_RISK_LEVEL_POINTS.get(risk_level.upper(), 70.0)
        at_pts = TOOL_ACCESS_TYPE_POINTS.get(access_type.upper(), 0.0)
        rev_pts = TOOL_REVERSIBILITY_POINTS.get(reversibility.upper(), 0.0)

        raw = 0.50 * rl_pts + 0.20 * at_pts + 0.30 * rev_pts
        return min(100.0, max(0.0, round(raw, 2)))

    @classmethod
    def calculate_data_subscore(
        cls,
        data_classification: str,
        approval_requirement: str,
    ) -> float:
        """Compute Data Classification & Impact Risk subscore (S_data in [0, 100])."""
        dc_pts = DATA_CLASSIFICATION_POINTS.get(data_classification.upper(), 25.0)
        ar_pts = APPROVAL_REQUIREMENT_POINTS.get(approval_requirement.upper(), 0.0)

        raw = 0.70 * dc_pts + 0.30 * ar_pts
        return min(100.0, max(0.0, round(raw, 2)))

    @classmethod
    def calculate_agent_subscore(
        cls,
        risk_tier: str,
        history_status: AgentHistoryStatus | str,
        violation_rate: float,
    ) -> tuple[float, float]:
        """Compute Agent Trust & Violation History subscore (S_agent in [0, 100]).

        Returns:
            tuple[float, float]: (subscore_agent, violation_points_applied)
        """
        rt_pts = AGENT_RISK_TIER_POINTS.get(str(risk_tier).upper(), 40.0)

        status_enum = (
            history_status
            if isinstance(history_status, AgentHistoryStatus)
            else AgentHistoryStatus(str(history_status))
        )

        if status_enum == AgentHistoryStatus.INSUFFICIENT_DATA:
            violation_pts = FALLBACK_VIOLATION_SCORE
        else:
            if violation_rate <= 0.0:
                violation_pts = 0.0
            elif violation_rate <= 0.10:
                violation_pts = 25.0
            elif violation_rate <= 0.25:
                violation_pts = 55.0
            else:
                violation_pts = 85.0

        raw = 0.60 * rt_pts + 0.40 * violation_pts
        return min(100.0, max(0.0, round(raw, 2))), violation_pts

    @classmethod
    def calculate_context_subscore(
        cls,
        environment: str,
        arguments: Any,
        heuristic_rules: list[dict[str, Any]] | None = None,
    ) -> tuple[float, list[dict[str, Any]]]:
        """Compute Runtime Context & Path-Scoped Heuristics subscore (S_context in [0, 100]).

        Returns:
            tuple[float, list[dict[str, Any]]]: (subscore_context, matched_heuristics)
        """
        env_pts = ENVIRONMENT_POINTS.get(str(environment).upper(), 40.0)
        heuristic_pts, matches = evaluate_argument_heuristics(arguments, heuristic_rules)

        raw = 0.40 * env_pts + 0.60 * heuristic_pts
        return min(100.0, max(0.0, round(raw, 2))), matches

    @classmethod
    def calculate_composite_score(
        cls,
        subscore_tool: float,
        subscore_data: float,
        subscore_agent: float,
        subscore_context: float,
        weight_tool: float = DEFAULT_WEIGHT_TOOL,
        weight_data: float = DEFAULT_WEIGHT_DATA,
        weight_agent: float = DEFAULT_WEIGHT_AGENT,
        weight_context: float = DEFAULT_WEIGHT_CONTEXT,
    ) -> int:
        """Compute the weighted, bounded composite risk score (0-100)."""
        weighted_sum = (
            weight_tool * subscore_tool
            + weight_data * subscore_data
            + weight_agent * subscore_agent
            + weight_context * subscore_context
        )
        clamped = max(0.0, min(100.0, weighted_sum))
        return int(round(clamped))

    @classmethod
    def classify_risk_score(
        cls,
        score: int,
        threshold_medium: int = DEFAULT_THRESHOLD_MEDIUM,
        threshold_high: int = DEFAULT_THRESHOLD_HIGH,
        threshold_critical: int = DEFAULT_THRESHOLD_CRITICAL,
    ) -> RiskLevel:
        """Classify a 0-100 composite risk score into a normalized RiskLevel tier."""
        if score < threshold_medium:
            return RiskLevel.LOW
        if score < threshold_high:
            return RiskLevel.MEDIUM
        if score < threshold_critical:
            return RiskLevel.HIGH
        return RiskLevel.CRITICAL

    @classmethod
    async def get_agent_violation_metrics(
        cls,
        db_session: AsyncSession,
        organization_id: uuid.UUID,
        agent_id: uuid.UUID,
        window_days: int = 7,
        max_samples: int = 50,
        now: datetime | None = None,
    ) -> tuple[AgentHistoryStatus, float, int, int]:
        """Query server-side database for 7-day sliding-window agent invocations.

        Returns:
            tuple: (history_status, violation_rate, eligible_count, violation_count)
        """
        current_time = now or datetime.now(UTC)
        cutoff = current_time - timedelta(days=window_days)

        # Organization-scoped, ordered server-side query
        stmt = (
            select(ToolRequest)
            .options(
                joinedload(ToolRequest.execution),
                joinedload(ToolRequest.approval_request),
            )
            .where(
                ToolRequest.organization_id == organization_id,
                ToolRequest.agent_id == agent_id,
                ToolRequest.evaluated_at >= cutoff,
            )
            .order_by(ToolRequest.evaluated_at.desc())
        )

        res = await db_session.execute(stmt)
        requests = res.unique().scalars().all()

        eligible_requests: list[ToolRequest] = []
        seen_ids: set[uuid.UUID] = set()

        for req in requests:
            # Prevent duplicate counting
            if req.id in seen_ids:
                continue
            seen_ids.add(req.id)

            # Check eligibility exclusions:
            # Exclude infrastructure executions
            if req.execution and req.execution.status in {ExecutionStatus.TIMED_OUT, ExecutionStatus.FAILED}:
                continue

            # Exclude non-misconduct denials (inactive agent/tool, unpublished version, org mismatch)
            if req.decision == GovernanceDecision.DENY:
                codes = set(req.violation_codes or [])
                if codes.intersection(INFRASTRUCTURE_EXCLUSION_CODES):
                    continue

            eligible_requests.append(req)
            if len(eligible_requests) >= max_samples:
                break

        eligible_count = len(eligible_requests)

        # Count misconduct violations
        violation_count = 0
        for req in eligible_requests:
            if req.decision == GovernanceDecision.DENY:
                codes = set(req.violation_codes or [])
                if codes.intersection(MISCONDUCT_VIOLATION_CODES) or not codes:
                    violation_count += 1
            elif (
                req.decision == GovernanceDecision.REQUIRE_APPROVAL
                and req.approval_request
                and req.approval_request.status == ApprovalStatus.REJECTED
            ):
                violation_count += 1

        # Insufficient data rule: N < 5
        if eligible_count < 5:
            return (
                AgentHistoryStatus.INSUFFICIENT_DATA,
                0.0,
                eligible_count,
                violation_count,
            )

        rate = round(violation_count / eligible_count, 4)
        return (
            AgentHistoryStatus.VALID,
            rate,
            eligible_count,
            violation_count,
        )

    @classmethod
    async def get_or_update_agent_risk_profile(
        cls,
        db_session: AsyncSession,
        organization_id: uuid.UUID,
        agent_id: uuid.UUID,
        window_days: int = 7,
        max_samples: int = 50,
        now: datetime | None = None,
    ) -> AgentRiskProfile:
        """Fetch or create and update cached AgentRiskProfile row in database."""
        current_time = now or datetime.now(UTC)
        history_status, violation_rate, eligible_count, violation_count = await cls.get_agent_violation_metrics(
            db_session,
            organization_id,
            agent_id,
            window_days=window_days,
            max_samples=max_samples,
            now=current_time,
        )

        stmt = select(AgentRiskProfile).where(
            AgentRiskProfile.organization_id == organization_id,
            AgentRiskProfile.agent_id == agent_id,
        )
        res = await db_session.execute(stmt)
        profile = res.scalar_one_or_none()

        if profile is None:
            profile = AgentRiskProfile(
                organization_id=organization_id,
                agent_id=agent_id,
                observation_window_days=window_days,
            )
            db_session.add(profile)

        profile.history_status = history_status
        profile.total_eligible_invocations = eligible_count
        profile.total_violations = violation_count
        profile.violation_rate = violation_rate
        profile.observation_window_days = window_days
        profile.last_assessed_at = current_time

        # Trust score is 100.0 for 0 violations or unproven baseline, but history_status is authoritative
        if history_status == AgentHistoryStatus.INSUFFICIENT_DATA:
            profile.calculated_trust_score = 100.0
        else:
            profile.calculated_trust_score = max(0.0, min(100.0, round(100.0 * (1.0 - violation_rate), 2)))

        await db_session.commit()
        await db_session.refresh(profile)
        return profile

    @classmethod
    def evaluate_risk(
        cls,
        organization_id: uuid.UUID,
        agent_risk_tier: str,
        tool_risk_level: str,
        tool_access_type: str,
        tool_reversibility: str,
        tool_data_classification: str,
        tool_approval_requirement: str,
        arguments: Any,
        environment: str,
        history_status: AgentHistoryStatus | str = AgentHistoryStatus.INSUFFICIENT_DATA,
        violation_rate: float = 0.0,
        total_eligible_invocations: int = 0,
        total_violations: int = 0,
        config_version: RiskConfigurationVersion | None = None,
        config_snapshot_override: dict[str, Any] | None = None,
        assessed_at: datetime | None = None,
    ) -> RiskEvaluationResult:
        """Pure, deterministic risk evaluation producing a complete RiskEvaluationResult."""
        current_time = assessed_at or datetime.now(UTC)

        # 1. Resolve configuration parameters
        if config_snapshot_override:
            weight_tool = float(config_snapshot_override.get("weight_tool", DEFAULT_WEIGHT_TOOL))
            weight_data = float(config_snapshot_override.get("weight_data", DEFAULT_WEIGHT_DATA))
            weight_agent = float(config_snapshot_override.get("weight_agent", DEFAULT_WEIGHT_AGENT))
            weight_context = float(config_snapshot_override.get("weight_context", DEFAULT_WEIGHT_CONTEXT))
            threshold_med = int(config_snapshot_override.get("threshold_medium", DEFAULT_THRESHOLD_MEDIUM))
            threshold_hi = int(config_snapshot_override.get("threshold_high", DEFAULT_THRESHOLD_HIGH))
            threshold_crit = int(config_snapshot_override.get("threshold_critical", DEFAULT_THRESHOLD_CRITICAL))
            approval_thresh = int(config_snapshot_override.get("approval_threshold", DEFAULT_APPROVAL_THRESHOLD))
            deny_thresh = int(config_snapshot_override.get("deny_threshold", DEFAULT_DENY_THRESHOLD))
            heuristic_rules = config_snapshot_override.get("heuristic_rules", [])
            version_id = (
                uuid.UUID(config_snapshot_override["version_id"])
                if config_snapshot_override.get("version_id")
                else None
            )
            version_num = int(config_snapshot_override.get("version_number", 1))
            algo_ver = str(config_snapshot_override.get("scoring_algorithm_version", SCORING_ALGORITHM_VERSION))
        elif config_version:
            weight_tool = config_version.weight_tool
            weight_data = config_version.weight_data
            weight_agent = config_version.weight_agent
            weight_context = config_version.weight_context
            threshold_med = config_version.threshold_medium
            threshold_hi = config_version.threshold_high
            threshold_crit = config_version.threshold_critical
            approval_thresh = config_version.approval_threshold
            deny_thresh = config_version.deny_threshold
            heuristic_rules = config_version.heuristic_rules
            version_id = config_version.id
            version_num = config_version.version_number
            algo_ver = config_version.scoring_algorithm_version
        else:
            weight_tool = DEFAULT_WEIGHT_TOOL
            weight_data = DEFAULT_WEIGHT_DATA
            weight_agent = DEFAULT_WEIGHT_AGENT
            weight_context = DEFAULT_WEIGHT_CONTEXT
            threshold_med = DEFAULT_THRESHOLD_MEDIUM
            threshold_hi = DEFAULT_THRESHOLD_HIGH
            threshold_crit = DEFAULT_THRESHOLD_CRITICAL
            approval_thresh = DEFAULT_APPROVAL_THRESHOLD
            deny_thresh = DEFAULT_DENY_THRESHOLD
            heuristic_rules = []
            version_id = None
            version_num = 1
            algo_ver = SCORING_ALGORITHM_VERSION

        cls.validate_configuration(
            weight_tool,
            weight_data,
            weight_agent,
            weight_context,
            threshold_med,
            threshold_hi,
            threshold_crit,
            approval_thresh,
            deny_thresh,
        )

        # 2. Calculate Subscores
        subscore_tool = cls.calculate_tool_subscore(tool_risk_level, tool_access_type, tool_reversibility)
        subscore_data = cls.calculate_data_subscore(tool_data_classification, tool_approval_requirement)
        subscore_agent, violation_pts_applied = cls.calculate_agent_subscore(
            agent_risk_tier, history_status, violation_rate
        )
        subscore_context, matched_heuristics = cls.calculate_context_subscore(environment, arguments, heuristic_rules)

        # 3. Calculate Composite Score and Classification
        risk_score = cls.calculate_composite_score(
            subscore_tool,
            subscore_data,
            subscore_agent,
            subscore_context,
            weight_tool=weight_tool,
            weight_data=weight_data,
            weight_agent=weight_agent,
            weight_context=weight_context,
        )
        risk_level = cls.classify_risk_score(
            risk_score,
            threshold_medium=threshold_med,
            threshold_high=threshold_hi,
            threshold_critical=threshold_crit,
        )

        # 4. Construct Immutable Configuration Snapshot
        config_snapshot = {
            "version_id": str(version_id) if version_id else None,
            "version_number": version_num,
            "weight_tool": weight_tool,
            "weight_data": weight_data,
            "weight_agent": weight_agent,
            "weight_context": weight_context,
            "threshold_medium": threshold_med,
            "threshold_high": threshold_hi,
            "threshold_critical": threshold_crit,
            "approval_threshold": approval_thresh,
            "deny_threshold": deny_thresh,
            "scoring_algorithm_version": algo_ver,
            "heuristic_rules_count": len(heuristic_rules) if heuristic_rules else 0,
        }

        # 5. Build Factor Breakdown
        status_enum = (
            history_status
            if isinstance(history_status, AgentHistoryStatus)
            else AgentHistoryStatus(str(history_status))
        )
        factor_breakdown: dict[str, Any] = {
            "tool": {
                "subscore": subscore_tool,
                "weight": weight_tool,
                "weighted_contribution": round(weight_tool * subscore_tool, 2),
                "risk_level": tool_risk_level,
                "access_type": tool_access_type,
                "reversibility": tool_reversibility,
            },
            "data": {
                "subscore": subscore_data,
                "weight": weight_data,
                "weighted_contribution": round(weight_data * subscore_data, 2),
                "data_classification": tool_data_classification,
                "approval_requirement": tool_approval_requirement,
            },
            "agent": {
                "subscore": subscore_agent,
                "weight": weight_agent,
                "weighted_contribution": round(weight_agent * subscore_agent, 2),
                "risk_tier": agent_risk_tier,
                "history_status": status_enum.value,
                "violation_rate": violation_rate,
                "total_eligible_invocations": total_eligible_invocations,
                "total_violations": total_violations,
                "violation_points_applied": violation_pts_applied,
                "fallback_applied": (status_enum == AgentHistoryStatus.INSUFFICIENT_DATA),
            },
            "context": {
                "subscore": subscore_context,
                "weight": weight_context,
                "weighted_contribution": round(weight_context * subscore_context, 2),
                "environment": environment,
                "heuristics_matched_count": len(matched_heuristics),
            },
        }

        # 6. Generate Human-Readable Explanation
        explanation = cls._generate_explanation(
            risk_score,
            risk_level,
            subscore_tool,
            subscore_data,
            subscore_agent,
            subscore_context,
            status_enum,
            total_eligible_invocations,
            total_violations,
            matched_heuristics,
        )

        heuristic_match_objs = [
            HeuristicMatch(
                rule_id=m["rule_id"],
                path=m["path"],
                severity=m["severity"],
                score_contribution=m["score_contribution"],
            )
            for m in matched_heuristics
        ]

        return RiskEvaluationResult(
            risk_score=risk_score,
            risk_level=risk_level,
            subscores=SubscoresBreakdown(
                tool=subscore_tool,
                data=subscore_data,
                agent=subscore_agent,
                context=subscore_context,
            ),
            factor_breakdown=factor_breakdown,
            heuristics_matched=heuristic_match_objs,
            config_snapshot=config_snapshot,
            explanation=explanation,
            scoring_algorithm_version=algo_ver,
            assessed_at=current_time,
            config_version_id=version_id,
        )

    @classmethod
    async def create_and_persist_assessment(
        cls,
        db_session: AsyncSession,
        organization_id: uuid.UUID,
        agent_id: uuid.UUID,
        agent_risk_tier: str,
        tool_id: uuid.UUID,
        tool_version_id: uuid.UUID,
        tool_risk_level: str,
        tool_access_type: str,
        tool_reversibility: str,
        tool_data_classification: str,
        tool_approval_requirement: str,
        arguments: Any,
        environment: str,
        tool_request_id: uuid.UUID | None = None,
        config_version_id: uuid.UUID | None = None,
        now: datetime | None = None,
    ) -> RiskAssessment:
        """Evaluate and persist an immutable RiskAssessment record into database."""
        current_time = now or datetime.now(UTC)

        # 1. Fetch active RiskConfigurationVersion for org if not provided
        selected_version: RiskConfigurationVersion | None = None
        if config_version_id:
            stmt_v = select(RiskConfigurationVersion).where(RiskConfigurationVersion.id == config_version_id)
            res_v = await db_session.execute(stmt_v)
            selected_version = res_v.scalar_one_or_none()

        if selected_version is None:
            # Look up active organization configuration
            stmt_c = (
                select(RiskConfiguration)
                .options(joinedload(RiskConfiguration.current_version))
                .where(RiskConfiguration.organization_id == organization_id)
            )
            res_c = await db_session.execute(stmt_c)
            config = res_c.scalar_one_or_none()
            if config and config.current_version:
                selected_version = config.current_version

        # 2. Compute empirical agent history from server-side database
        history_status, violation_rate, eligible_count, violation_count = await cls.get_agent_violation_metrics(
            db_session,
            organization_id,
            agent_id,
            now=current_time,
        )

        # 3. Evaluate risk
        eval_result = cls.evaluate_risk(
            organization_id=organization_id,
            agent_risk_tier=agent_risk_tier,
            tool_risk_level=tool_risk_level,
            tool_access_type=tool_access_type,
            tool_reversibility=tool_reversibility,
            tool_data_classification=tool_data_classification,
            tool_approval_requirement=tool_approval_requirement,
            arguments=arguments,
            environment=environment,
            history_status=history_status,
            violation_rate=violation_rate,
            total_eligible_invocations=eligible_count,
            total_violations=violation_count,
            config_version=selected_version,
            assessed_at=current_time,
        )

        # 4. Construct and save RiskAssessment model
        assessment = RiskAssessment(
            organization_id=organization_id,
            tool_request_id=tool_request_id,
            agent_id=agent_id,
            tool_id=tool_id,
            tool_version_id=tool_version_id,
            config_version_id=eval_result.config_version_id,
            scoring_algorithm_version=eval_result.scoring_algorithm_version,
            risk_score=eval_result.risk_score,
            risk_level=eval_result.risk_level,
            subscore_tool=eval_result.subscores.tool,
            subscore_data=eval_result.subscores.data,
            subscore_agent=eval_result.subscores.agent,
            subscore_context=eval_result.subscores.context,
            factor_breakdown=eval_result.factor_breakdown,
            heuristics_matched=[m.model_dump() for m in eval_result.heuristics_matched],
            config_snapshot=eval_result.config_snapshot,
            explanation=eval_result.explanation,
            assessed_at=eval_result.assessed_at,
        )
        db_session.add(assessment)
        await db_session.commit()
        await db_session.refresh(assessment)

        return assessment

    @staticmethod
    def _generate_explanation(
        score: int,
        level: RiskLevel,
        subscore_tool: float,
        subscore_data: float,
        subscore_agent: float,
        subscore_context: float,
        history_status: AgentHistoryStatus,
        eligible_count: int,
        violation_count: int,
        matched_heuristics: list[dict[str, Any]],
    ) -> str:
        """Build clear, deterministic explanation string."""
        parts = [
            f"{level.value} Risk ({score}/100).",
            (
                f"Tool: {subscore_tool:.1f}, Data: {subscore_data:.1f}, "
                f"Agent: {subscore_agent:.1f}, Context: {subscore_context:.1f}."
            ),
        ]

        if history_status == AgentHistoryStatus.INSUFFICIENT_DATA:
            parts.append(
                f"Agent history has insufficient sample ({eligible_count}/5 required); conservative baseline applied."
            )
        else:
            parts.append(
                f"Agent history verified with {violation_count} violations across {eligible_count} invocations."
            )

        if matched_heuristics:
            matched_rules = ", ".join(m["rule_id"] for m in matched_heuristics)
            parts.append(f"Heuristics triggered: [{matched_rules}].")
        else:
            parts.append("No high-risk argument heuristics triggered.")

        return " ".join(parts)

    # ==============================================================================
    # Phase 7.4 Service Layer Operations (REST API Support)
    # ==============================================================================

    @classmethod
    async def simulate_risk(
        cls,
        db: AsyncSession,
        organization_id: uuid.UUID,
        payload: RiskSimulateRequest,
    ) -> RiskSimulateResponse:
        """Execute a non-mutating risk evaluation simulation using server-side trusted metadata."""
        # 1. Resolve agent within caller's organization
        agent_stmt = select(Agent).where(
            Agent.id == payload.agent_id,
            Agent.organization_id == organization_id,
        )
        agent = (await db.execute(agent_stmt)).scalar_one_or_none()
        if not agent:
            raise ValueError(f"Agent '{payload.agent_id}' not found")

        # 2. Resolve tool within caller's organization
        tool_stmt = select(Tool).where(
            Tool.id == payload.tool_id,
            Tool.organization_id == organization_id,
        )
        tool = (await db.execute(tool_stmt)).scalar_one_or_none()
        if not tool:
            raise ValueError(f"Tool '{payload.tool_id}' not found")

        # 3. Resolve tool version belonging to tool
        version_stmt = select(ToolVersion).where(
            ToolVersion.id == payload.tool_version_id,
            ToolVersion.tool_id == tool.id,
        )
        tool_version = (await db.execute(version_stmt)).scalar_one_or_none()
        if not tool_version:
            raise ValueError(f"ToolVersion '{payload.tool_version_id}' not found for tool")

        # 4. Resolve active organization configuration
        stmt_c = (
            select(RiskConfiguration)
            .options(joinedload(RiskConfiguration.current_version))
            .where(RiskConfiguration.organization_id == organization_id)
        )
        res_c = await db.execute(stmt_c)
        risk_config = res_c.scalar_one_or_none()
        selected_version: RiskConfigurationVersion | None = (
            risk_config.current_version
            if (risk_config and risk_config.is_active and risk_config.current_version)
            else None
        )

        # 5. Resolve empirical agent violation metrics (sliding window)
        history_status, violation_rate, eligible_count, violation_count = await cls.get_agent_violation_metrics(
            db,
            organization_id,
            agent.id,
        )

        # 6. Evaluate risk (pure, non-mutating)
        eval_result = cls.evaluate_risk(
            organization_id=organization_id,
            agent_risk_tier=str(agent.risk_tier.value if hasattr(agent.risk_tier, "value") else agent.risk_tier),
            tool_risk_level=str(tool.risk_level.value if hasattr(tool.risk_level, "value") else tool.risk_level),
            tool_access_type=str(tool.access_type.value if hasattr(tool.access_type, "value") else tool.access_type),
            tool_reversibility=str(
                tool.reversibility.value if hasattr(tool.reversibility, "value") else tool.reversibility
            ),
            tool_data_classification=str(
                tool.data_classification.value
                if hasattr(tool.data_classification, "value")
                else tool.data_classification
            ),
            tool_approval_requirement=str(
                tool.approval_requirement.value
                if hasattr(tool.approval_requirement, "value")
                else tool.approval_requirement
            ),
            arguments=payload.arguments,
            environment=payload.environment,
            history_status=history_status,
            violation_rate=violation_rate,
            total_eligible_invocations=eligible_count,
            total_violations=violation_count,
            config_version=selected_version,
        )

        return RiskSimulateResponse(
            risk_score=eval_result.risk_score,
            risk_level=eval_result.risk_level,
            subscores=eval_result.subscores,
            factor_breakdown=eval_result.factor_breakdown,
            heuristics_matched=eval_result.heuristics_matched,
            config_snapshot=eval_result.config_snapshot,
            explanation=eval_result.explanation,
            scoring_algorithm_version=eval_result.scoring_algorithm_version,
            assessed_at=eval_result.assessed_at,
            config_version_id=eval_result.config_version_id,
        )

    @classmethod
    async def list_assessments(
        cls,
        db: AsyncSession,
        organization_id: uuid.UUID,
        agent_id: uuid.UUID | None = None,
        tool_id: uuid.UUID | None = None,
        risk_level: RiskLevel | None = None,
        start_date: datetime | None = None,
        end_date: datetime | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> tuple[list[RiskAssessment], int]:
        """List historical risk assessments with filtering and pagination."""
        query = select(RiskAssessment).where(RiskAssessment.organization_id == organization_id)
        if agent_id:
            query = query.where(RiskAssessment.agent_id == agent_id)
        if tool_id:
            query = query.where(RiskAssessment.tool_id == tool_id)
        if risk_level:
            query = query.where(RiskAssessment.risk_level == risk_level)
        if start_date:
            query = query.where(RiskAssessment.assessed_at >= start_date)
        if end_date:
            query = query.where(RiskAssessment.assessed_at <= end_date)

        count_stmt = select(func.count()).select_from(query.subquery())
        total = (await db.execute(count_stmt)).scalar_one()

        query = query.order_by(RiskAssessment.assessed_at.desc()).limit(limit).offset(offset)
        items = (await db.execute(query)).scalars().all()
        return list(items), total

    @classmethod
    async def get_assessment(
        cls,
        db: AsyncSession,
        organization_id: uuid.UUID,
        assessment_id: uuid.UUID,
    ) -> RiskAssessment | None:
        """Retrieve an immutable historical risk assessment record by ID."""
        stmt = select(RiskAssessment).where(
            RiskAssessment.id == assessment_id,
            RiskAssessment.organization_id == organization_id,
        )
        return (await db.execute(stmt)).scalar_one_or_none()

    @classmethod
    async def get_agent_profile_details(
        cls,
        db: AsyncSession,
        organization_id: uuid.UUID,
        agent_id: uuid.UUID,
    ) -> AgentRiskProfileResponse:
        """Retrieve the empirical risk profile and trust metrics for an agent."""
        agent_stmt = select(Agent).where(
            Agent.id == agent_id,
            Agent.organization_id == organization_id,
        )
        agent = (await db.execute(agent_stmt)).scalar_one_or_none()
        if not agent:
            raise ValueError(f"Agent '{agent_id}' not found")

        profile = await cls.get_or_update_agent_risk_profile(db, organization_id, agent_id)
        return AgentRiskProfileResponse(
            agent_id=agent.id,
            organization_id=organization_id,
            risk_tier=str(agent.risk_tier.value if hasattr(agent.risk_tier, "value") else agent.risk_tier),
            history_status=profile.history_status,
            total_eligible_invocations=profile.total_eligible_invocations,
            total_violations=profile.total_violations,
            violation_rate=profile.violation_rate,
            calculated_trust_score=profile.calculated_trust_score,
            observation_window_days=profile.observation_window_days,
            last_assessed_at=profile.last_assessed_at,
        )

    @classmethod
    async def get_active_configuration(
        cls,
        db: AsyncSession,
        organization_id: uuid.UUID,
    ) -> RiskConfiguration:
        """Fetch the active risk configuration and version for an organization."""
        stmt = (
            select(RiskConfiguration)
            .options(selectinload(RiskConfiguration.current_version))
            .where(RiskConfiguration.organization_id == organization_id)
        )
        config = (await db.execute(stmt)).scalar_one_or_none()
        if not config:
            # Initialize default configuration container & version 1
            config = RiskConfiguration(organization_id=organization_id, is_active=True)
            db.add(config)
            await db.flush()

            v1 = RiskConfigurationVersion(
                risk_configuration_id=config.id,
                version_number=1,
                weight_tool=DEFAULT_WEIGHT_TOOL,
                weight_data=DEFAULT_WEIGHT_DATA,
                weight_agent=DEFAULT_WEIGHT_AGENT,
                weight_context=DEFAULT_WEIGHT_CONTEXT,
                threshold_medium=DEFAULT_THRESHOLD_MEDIUM,
                threshold_high=DEFAULT_THRESHOLD_HIGH,
                threshold_critical=DEFAULT_THRESHOLD_CRITICAL,
                approval_threshold=DEFAULT_APPROVAL_THRESHOLD,
                deny_threshold=DEFAULT_DENY_THRESHOLD,
                heuristic_rules=[],
                changelog="Initial default risk configuration",
                scoring_algorithm_version=SCORING_ALGORITHM_VERSION,
            )
            db.add(v1)
            await db.flush()

            config.current_version_id = v1.id
            await db.commit()
            await db.refresh(config)

            # Re-fetch with loaded current_version relationship
            stmt = (
                select(RiskConfiguration)
                .options(selectinload(RiskConfiguration.current_version))
                .where(RiskConfiguration.id == config.id)
            )
            config = (await db.execute(stmt)).scalar_one()

        return config

    @classmethod
    async def create_configuration_version(
        cls,
        db: AsyncSession,
        organization_id: uuid.UUID,
        user_id: uuid.UUID,
        payload: RiskConfigurationVersionCreate,
    ) -> RiskConfigurationVersion:
        """Create and publish a new immutable risk configuration version."""
        # 1. Validate weights sum to 1.0
        total_weight = payload.weight_tool + payload.weight_data + payload.weight_agent + payload.weight_context
        if abs(total_weight - 1.0) > 0.001:
            raise ValueError(f"Configuration weights must sum to 1.0 (got {total_weight:.4f})")

        # 2. Validate classification thresholds: 0 <= medium <= high <= critical <= 100
        if not (0 <= payload.threshold_medium <= payload.threshold_high <= payload.threshold_critical <= 100):
            raise ValueError("Classification thresholds must satisfy: 0 <= medium <= high <= critical <= 100")

        # 3. Validate action thresholds: 0 <= approval <= deny <= 100
        if not (0 <= payload.approval_threshold <= payload.deny_threshold <= 100):
            raise ValueError("Action thresholds must satisfy: 0 <= approval_threshold <= deny_threshold <= 100")

        # 4. Validate heuristic rules if present
        if payload.heuristic_rules:
            for rule in payload.heuristic_rules:
                if not isinstance(rule, dict) or "rule_id" not in rule:
                    raise ValueError("Each heuristic rule must be an object with at least 'rule_id'")

        # 5. Concurrency safe: lock configuration row
        stmt = select(RiskConfiguration).where(RiskConfiguration.organization_id == organization_id).with_for_update()
        config = (await db.execute(stmt)).scalar_one_or_none()
        if not config:
            config = RiskConfiguration(organization_id=organization_id, is_active=True)
            db.add(config)
            await db.flush()

        # 6. Calculate next version number
        ver_num_stmt = select(func.coalesce(func.max(RiskConfigurationVersion.version_number), 0)).where(
            RiskConfigurationVersion.risk_configuration_id == config.id
        )
        current_max = (await db.execute(ver_num_stmt)).scalar_one()
        next_ver = current_max + 1

        new_version = RiskConfigurationVersion(
            risk_configuration_id=config.id,
            version_number=next_ver,
            weight_tool=payload.weight_tool,
            weight_data=payload.weight_data,
            weight_agent=payload.weight_agent,
            weight_context=payload.weight_context,
            threshold_medium=payload.threshold_medium,
            threshold_high=payload.threshold_high,
            threshold_critical=payload.threshold_critical,
            approval_threshold=payload.approval_threshold,
            deny_threshold=payload.deny_threshold,
            heuristic_rules=payload.heuristic_rules,
            changelog=payload.changelog,
            created_by_user_id=user_id,
            scoring_algorithm_version=SCORING_ALGORITHM_VERSION,
        )
        db.add(new_version)
        await db.flush()

        config.current_version_id = new_version.id
        config.is_active = True
        await db.commit()
        await db.refresh(new_version)
        return new_version


risk_service = RiskEngineService()
