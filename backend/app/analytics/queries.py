"""SQL aggregation queries and helpers for the Veridex Analytics Engine (Phase 8.3)."""

import math
import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import and_, case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.agents.models import Agent
from app.governance.models import (
    ApprovalRequest,
    ApprovalStatus,
    ExecutionStatus,
    GovernanceDecision,
    ToolExecution,
    ToolRequest,
)
from app.risk.models import AgentRiskProfile, RiskAssessment, RiskLevel
from app.tools.models import Tool


def _compute_percentile_python(sorted_values: list[float], percentile: float) -> float | None:
    """Compute percentile using linear interpolation across sorted values (bounded SQLite fallback)."""
    if not sorted_values:
        return None
    if len(sorted_values) == 1:
        return sorted_values[0]
    k = (len(sorted_values) - 1) * percentile
    f = math.floor(k)
    c = math.ceil(k)
    if f == c:
        return sorted_values[int(k)]
    d0 = sorted_values[f] * (c - k)
    d1 = sorted_values[c] * (k - f)
    return round(d0 + d1, 3)


class AnalyticsQueries:
    """Encapsulates reusable, organization-isolated SQL aggregation queries."""

    @staticmethod
    async def get_overview_counts(
        session: AsyncSession,
        organization_id: uuid.UUID,
        start_time: datetime,
        end_time: datetime,
    ) -> dict[str, Any]:
        """Aggregate high-level governance invocations, executions, and approvals."""
        # 1. Tool Requests volumetric breakdown
        req_stmt = select(
            func.count(ToolRequest.id).label("total_invocations"),
            func.count(case((ToolRequest.decision == GovernanceDecision.ALLOW, 1))).label("allow_count"),
            func.count(case((ToolRequest.decision == GovernanceDecision.DENY, 1))).label("deny_count"),
            func.count(case((ToolRequest.decision == GovernanceDecision.REQUIRE_APPROVAL, 1))).label(
                "require_approval_count"
            ),
        ).where(
            and_(
                ToolRequest.organization_id == organization_id,
                ToolRequest.evaluated_at >= start_time,
                ToolRequest.evaluated_at < end_time,
            )
        )
        req_res = (await session.execute(req_stmt)).one()

        # 2. Tool Executions count (joined via ToolRequest to preserve tenant isolation)
        exec_stmt = (
            select(func.count(ToolExecution.id))
            .join(ToolRequest, ToolExecution.tool_request_id == ToolRequest.id)
            .where(
                and_(
                    ToolRequest.organization_id == organization_id,
                    ToolRequest.evaluated_at >= start_time,
                    ToolRequest.evaluated_at < end_time,
                )
            )
        )
        exec_res = (await session.execute(exec_stmt)).scalar() or 0

        # 3. Approvals breakdown
        app_stmt = select(
            func.count(ApprovalRequest.id).label("total_approvals"),
            func.count(case((ApprovalRequest.status == ApprovalStatus.APPROVED, 1))).label("approved_count"),
            func.count(case((ApprovalRequest.status == ApprovalStatus.REJECTED, 1))).label("rejected_count"),
            func.count(case((ApprovalRequest.status == ApprovalStatus.PENDING, 1))).label("pending_count"),
            func.count(case((ApprovalRequest.status == ApprovalStatus.EXPIRED, 1))).label("expired_count"),
        ).where(
            and_(
                ApprovalRequest.organization_id == organization_id,
                ApprovalRequest.created_at >= start_time,
                ApprovalRequest.created_at < end_time,
            )
        )
        app_res = (await session.execute(app_stmt)).one()

        return {
            "total_invocations": req_res.total_invocations or 0,
            "allow_count": req_res.allow_count or 0,
            "deny_count": req_res.deny_count or 0,
            "require_approval_count": req_res.require_approval_count or 0,
            "total_tool_executions": exec_res,
            "total_approvals": app_res.total_approvals or 0,
            "approved_approvals": app_res.approved_count or 0,
            "rejected_approvals": app_res.rejected_count or 0,
            "pending_approvals": app_res.pending_count or 0,
            "expired_approvals": app_res.expired_count or 0,
        }

    @staticmethod
    async def get_raw_trend_records(
        session: AsyncSession,
        organization_id: uuid.UUID,
        start_time: datetime,
        end_time: datetime,
        granularity: str,
    ) -> tuple[list[tuple[datetime, int, int, int, int]], list[tuple[datetime, int]], list[tuple[datetime, int]]]:
        """Query time-series aggregated rows for requests, executions, and risk assessments."""
        bind = session.get_bind()
        is_sqlite = bind.dialect.name == "sqlite"

        if is_sqlite:
            # SQLite compatibility formatting
            fmt = "%Y-%m-%d %H:00:00" if granularity == "hour" else "%Y-%m-%d 00:00:00"
            req_time_expr = func.strftime(fmt, ToolRequest.evaluated_at)
            risk_time_expr = func.strftime(fmt, RiskAssessment.assessed_at)
        else:
            # PostgreSQL native date_trunc
            req_time_expr = func.date_trunc(granularity, ToolRequest.evaluated_at)
            risk_time_expr = func.date_trunc(granularity, RiskAssessment.assessed_at)

        # 1. Tool Requests by bucket
        req_stmt = (
            select(
                req_time_expr.label("bucket"),
                func.count(ToolRequest.id).label("total"),
                func.count(case((ToolRequest.decision == GovernanceDecision.ALLOW, 1))).label("allow_c"),
                func.count(case((ToolRequest.decision == GovernanceDecision.DENY, 1))).label("deny_c"),
                func.count(case((ToolRequest.decision == GovernanceDecision.REQUIRE_APPROVAL, 1))).label(
                    "require_approval_c"
                ),
            )
            .where(
                and_(
                    ToolRequest.organization_id == organization_id,
                    ToolRequest.evaluated_at >= start_time,
                    ToolRequest.evaluated_at < end_time,
                )
            )
            .group_by("bucket")
            .order_by("bucket")
        )
        req_rows = (await session.execute(req_stmt)).all()

        # 2. Tool Executions by bucket (joined through ToolRequest)
        exec_stmt = (
            select(
                req_time_expr.label("bucket"),
                func.count(ToolExecution.id).label("total_exec"),
            )
            .join(ToolRequest, ToolExecution.tool_request_id == ToolRequest.id)
            .where(
                and_(
                    ToolRequest.organization_id == organization_id,
                    ToolRequest.evaluated_at >= start_time,
                    ToolRequest.evaluated_at < end_time,
                )
            )
            .group_by("bucket")
            .order_by("bucket")
        )
        exec_rows = (await session.execute(exec_stmt)).all()

        # 3. Risk Assessments by bucket
        risk_stmt = (
            select(
                risk_time_expr.label("bucket"),
                func.count(RiskAssessment.id).label("total_risk"),
            )
            .where(
                and_(
                    RiskAssessment.organization_id == organization_id,
                    RiskAssessment.assessed_at >= start_time,
                    RiskAssessment.assessed_at < end_time,
                )
            )
            .group_by("bucket")
            .order_by("bucket")
        )
        risk_rows = (await session.execute(risk_stmt)).all()

        def parse_bucket(val: Any) -> datetime:
            if isinstance(val, datetime):
                return val
            return datetime.fromisoformat(str(val))

        parsed_reqs = [(parse_bucket(r[0]), r[1], r[2], r[3], r[4]) for r in req_rows]
        parsed_execs = [(parse_bucket(r[0]), r[1]) for r in exec_rows]
        parsed_risks = [(parse_bucket(r[0]), r[1]) for r in risk_rows]

        return parsed_reqs, parsed_execs, parsed_risks

    @staticmethod
    async def get_risk_distribution_stats(
        session: AsyncSession,
        organization_id: uuid.UUID,
        start_time: datetime,
        end_time: datetime,
    ) -> dict[str, Any]:
        """Aggregate risk score metrics and the 10-bucket histogram in a single SQL query."""
        stmt = select(
            func.count(RiskAssessment.id).label("total_assessments"),
            func.count(case((RiskAssessment.risk_level == RiskLevel.LOW, 1))).label("low_count"),
            func.count(case((RiskAssessment.risk_level == RiskLevel.MEDIUM, 1))).label("medium_count"),
            func.count(case((RiskAssessment.risk_level == RiskLevel.HIGH, 1))).label("high_count"),
            func.count(case((RiskAssessment.risk_level == RiskLevel.CRITICAL, 1))).label("critical_count"),
            func.avg(RiskAssessment.risk_score).label("avg_score"),
            func.min(RiskAssessment.risk_score).label("min_score"),
            func.max(RiskAssessment.risk_score).label("max_score"),
            # Histogram Buckets [0,10), [10,20), ..., [90,100]
            func.count(case((and_(RiskAssessment.risk_score >= 0, RiskAssessment.risk_score < 10), 1))).label("b_0_10"),
            func.count(case((and_(RiskAssessment.risk_score >= 10, RiskAssessment.risk_score < 20), 1))).label(
                "b_10_20"
            ),
            func.count(case((and_(RiskAssessment.risk_score >= 20, RiskAssessment.risk_score < 30), 1))).label(
                "b_20_30"
            ),
            func.count(case((and_(RiskAssessment.risk_score >= 30, RiskAssessment.risk_score < 40), 1))).label(
                "b_30_40"
            ),
            func.count(case((and_(RiskAssessment.risk_score >= 40, RiskAssessment.risk_score < 50), 1))).label(
                "b_40_50"
            ),
            func.count(case((and_(RiskAssessment.risk_score >= 50, RiskAssessment.risk_score < 60), 1))).label(
                "b_50_60"
            ),
            func.count(case((and_(RiskAssessment.risk_score >= 60, RiskAssessment.risk_score < 70), 1))).label(
                "b_60_70"
            ),
            func.count(case((and_(RiskAssessment.risk_score >= 70, RiskAssessment.risk_score < 80), 1))).label(
                "b_70_80"
            ),
            func.count(case((and_(RiskAssessment.risk_score >= 80, RiskAssessment.risk_score < 90), 1))).label(
                "b_80_90"
            ),
            func.count(case((and_(RiskAssessment.risk_score >= 90, RiskAssessment.risk_score <= 100), 1))).label(
                "b_90_100"
            ),
        ).where(
            and_(
                RiskAssessment.organization_id == organization_id,
                RiskAssessment.assessed_at >= start_time,
                RiskAssessment.assessed_at < end_time,
            )
        )
        row = (await session.execute(stmt)).one()

        return {
            "total_assessments": row.total_assessments or 0,
            "low_count": row.low_count or 0,
            "medium_count": row.medium_count or 0,
            "high_count": row.high_count or 0,
            "critical_count": row.critical_count or 0,
            "avg_score": round(float(row.avg_score), 2) if row.avg_score is not None else None,
            "min_score": row.min_score,
            "max_score": row.max_score,
            "histogram": [
                {"range_label": "[0,10)", "min_score": 0, "max_score": 9, "count": row.b_0_10 or 0},
                {"range_label": "[10,20)", "min_score": 10, "max_score": 19, "count": row.b_10_20 or 0},
                {"range_label": "[20,30)", "min_score": 20, "max_score": 29, "count": row.b_20_30 or 0},
                {"range_label": "[30,40)", "min_score": 30, "max_score": 39, "count": row.b_30_40 or 0},
                {"range_label": "[40,50)", "min_score": 40, "max_score": 49, "count": row.b_40_50 or 0},
                {"range_label": "[50,60)", "min_score": 50, "max_score": 59, "count": row.b_50_60 or 0},
                {"range_label": "[60,70)", "min_score": 60, "max_score": 69, "count": row.b_60_70 or 0},
                {"range_label": "[70,80)", "min_score": 70, "max_score": 79, "count": row.b_70_80 or 0},
                {"range_label": "[80,90)", "min_score": 80, "max_score": 89, "count": row.b_80_90 or 0},
                {"range_label": "[90,100]", "min_score": 90, "max_score": 100, "count": row.b_90_100 or 0},
            ],
        }

    @staticmethod
    async def get_agent_analytics(
        session: AsyncSession,
        organization_id: uuid.UUID,
        start_time: datetime,
        end_time: datetime,
        offset: int,
        limit: int,
    ) -> tuple[int, list[dict[str, Any]]]:
        """Aggregate per-agent activity, denial rates, risk distributions, and profile metrics."""
        # 1. Total distinct active agents count
        count_stmt = select(func.count(func.distinct(ToolRequest.agent_id))).where(
            and_(
                ToolRequest.organization_id == organization_id,
                ToolRequest.evaluated_at >= start_time,
                ToolRequest.evaluated_at < end_time,
            )
        )
        total_items = (await session.execute(count_stmt)).scalar() or 0
        if total_items == 0:
            return 0, []

        # 2. Paginated agents with invocation metrics
        agent_stmt = (
            select(
                ToolRequest.agent_id,
                Agent.name.label("agent_name"),
                Agent.environment.label("agent_environment"),
                func.count(ToolRequest.id).label("total_invocations"),
                func.count(case((ToolRequest.decision == GovernanceDecision.ALLOW, 1))).label("allow_count"),
                func.count(case((ToolRequest.decision == GovernanceDecision.DENY, 1))).label("deny_count"),
                func.count(case((ToolRequest.decision == GovernanceDecision.REQUIRE_APPROVAL, 1))).label(
                    "require_approval_count"
                ),
                func.avg(ToolRequest.evaluation_duration_ms).label("avg_eval_ms"),
            )
            .join(Agent, ToolRequest.agent_id == Agent.id)
            .where(
                and_(
                    ToolRequest.organization_id == organization_id,
                    ToolRequest.evaluated_at >= start_time,
                    ToolRequest.evaluated_at < end_time,
                )
            )
            .group_by(ToolRequest.agent_id, Agent.name, Agent.environment)
            .order_by(func.count(ToolRequest.id).desc(), Agent.name.asc(), ToolRequest.agent_id.asc())
            .offset(offset)
            .limit(limit)
        )
        agent_rows = (await session.execute(agent_stmt)).all()
        if not agent_rows:
            return total_items, []

        agent_ids = [r.agent_id for r in agent_rows]

        # 3. Executions per agent
        exec_stmt = (
            select(
                ToolRequest.agent_id,
                func.count(ToolExecution.id).label("exec_count"),
            )
            .join(ToolRequest, ToolExecution.tool_request_id == ToolRequest.id)
            .where(
                and_(
                    ToolRequest.organization_id == organization_id,
                    ToolRequest.evaluated_at >= start_time,
                    ToolRequest.evaluated_at < end_time,
                    ToolRequest.agent_id.in_(agent_ids),
                )
            )
            .group_by(ToolRequest.agent_id)
        )
        exec_map = {r.agent_id: r.exec_count for r in (await session.execute(exec_stmt)).all()}

        # 4. Risk distributions per agent
        risk_stmt = (
            select(
                RiskAssessment.agent_id,
                RiskAssessment.risk_level,
                func.count(RiskAssessment.id).label("assessment_count"),
            )
            .where(
                and_(
                    RiskAssessment.organization_id == organization_id,
                    RiskAssessment.assessed_at >= start_time,
                    RiskAssessment.assessed_at < end_time,
                    RiskAssessment.agent_id.in_(agent_ids),
                )
            )
            .group_by(RiskAssessment.agent_id, RiskAssessment.risk_level)
        )
        risk_map: dict[uuid.UUID, dict[str, int]] = {aid: {} for aid in agent_ids}
        for r in (await session.execute(risk_stmt)).all():
            risk_map[r.agent_id][str(r.risk_level)] = r.assessment_count

        # 5. Live AgentRiskProfiles
        profile_stmt = select(
            AgentRiskProfile.agent_id,
            AgentRiskProfile.calculated_trust_score,
            AgentRiskProfile.violation_rate,
            AgentRiskProfile.history_status,
        ).where(
            and_(
                AgentRiskProfile.organization_id == organization_id,
                AgentRiskProfile.agent_id.in_(agent_ids),
            )
        )
        profile_map = {r.agent_id: r for r in (await session.execute(profile_stmt)).all()}

        # Assemble items
        items: list[dict[str, Any]] = []
        for r in agent_rows:
            total_inv = r.total_invocations or 0
            deny_c = r.deny_count or 0
            historical_denial_rate = round(deny_c / total_inv, 4) if total_inv > 0 else 0.0

            prof = profile_map.get(r.agent_id)
            items.append(
                {
                    "agent_id": r.agent_id,
                    "agent_name": r.agent_name,
                    "agent_environment": str(r.agent_environment),
                    "total_invocations": total_inv,
                    "allow_count": r.allow_count or 0,
                    "deny_count": deny_c,
                    "require_approval_count": r.require_approval_count or 0,
                    "historical_denial_rate": historical_denial_rate,
                    "risk_distribution": risk_map.get(r.agent_id, {}),
                    "total_tool_executions": exec_map.get(r.agent_id, 0),
                    "avg_evaluation_duration_ms": (
                        round(float(r.avg_eval_ms), 3) if r.avg_eval_ms is not None else None
                    ),
                    "calculated_trust_score": prof.calculated_trust_score if prof else None,
                    "profile_violation_rate": prof.violation_rate if prof else None,
                    "history_status": str(prof.history_status) if prof else None,
                }
            )

        return total_items, items

    @staticmethod
    async def get_tool_analytics(
        session: AsyncSession,
        organization_id: uuid.UUID,
        start_time: datetime,
        end_time: datetime,
        offset: int,
        limit: int,
    ) -> tuple[int, list[dict[str, Any]]]:
        """Aggregate per-tool invocation volume, execution results, and latency."""
        # 1. Total distinct tools count
        count_stmt = select(func.count(func.distinct(ToolRequest.tool_id))).where(
            and_(
                ToolRequest.organization_id == organization_id,
                ToolRequest.evaluated_at >= start_time,
                ToolRequest.evaluated_at < end_time,
            )
        )
        total_items = (await session.execute(count_stmt)).scalar() or 0
        if total_items == 0:
            return 0, []

        # 2. Paginated tools with request metrics
        tool_stmt = (
            select(
                ToolRequest.tool_id,
                Tool.name.label("tool_name"),
                Tool.slug.label("tool_slug"),
                func.count(ToolRequest.id).label("invocation_count"),
                func.count(case((ToolRequest.decision == GovernanceDecision.ALLOW, 1))).label("allow_count"),
                func.count(case((ToolRequest.decision == GovernanceDecision.DENY, 1))).label("deny_count"),
                func.count(case((ToolRequest.decision == GovernanceDecision.REQUIRE_APPROVAL, 1))).label(
                    "require_approval_count"
                ),
                func.avg(ToolRequest.evaluation_duration_ms).label("avg_eval_ms"),
            )
            .join(Tool, ToolRequest.tool_id == Tool.id)
            .where(
                and_(
                    ToolRequest.organization_id == organization_id,
                    ToolRequest.evaluated_at >= start_time,
                    ToolRequest.evaluated_at < end_time,
                )
            )
            .group_by(ToolRequest.tool_id, Tool.name, Tool.slug)
            .order_by(func.count(ToolRequest.id).desc(), Tool.name.asc(), ToolRequest.tool_id.asc())
            .offset(offset)
            .limit(limit)
        )
        tool_rows = (await session.execute(tool_stmt)).all()
        if not tool_rows:
            return total_items, []

        tool_ids = [r.tool_id for r in tool_rows]

        # 3. Executions metrics per tool
        exec_stmt = (
            select(
                ToolRequest.tool_id,
                func.count(ToolExecution.id).label("execution_count"),
                func.count(case((ToolExecution.status == ExecutionStatus.SUCCESS, 1))).label("success_count"),
                func.count(case((ToolExecution.status == ExecutionStatus.FAILED, 1))).label("failed_count"),
                func.count(case((ToolExecution.status == ExecutionStatus.TIMED_OUT, 1))).label("timeout_count"),
                func.avg(ToolExecution.duration_ms).label("avg_exec_ms"),
            )
            .join(ToolRequest, ToolExecution.tool_request_id == ToolRequest.id)
            .where(
                and_(
                    ToolRequest.organization_id == organization_id,
                    ToolRequest.evaluated_at >= start_time,
                    ToolRequest.evaluated_at < end_time,
                    ToolRequest.tool_id.in_(tool_ids),
                )
            )
            .group_by(ToolRequest.tool_id)
        )
        exec_map = {r.tool_id: r for r in (await session.execute(exec_stmt)).all()}

        # 4. Risk distributions per tool
        risk_stmt = (
            select(
                RiskAssessment.tool_id,
                RiskAssessment.risk_level,
                func.count(RiskAssessment.id).label("assessment_count"),
            )
            .where(
                and_(
                    RiskAssessment.organization_id == organization_id,
                    RiskAssessment.assessed_at >= start_time,
                    RiskAssessment.assessed_at < end_time,
                    RiskAssessment.tool_id.in_(tool_ids),
                )
            )
            .group_by(RiskAssessment.tool_id, RiskAssessment.risk_level)
        )
        risk_map: dict[uuid.UUID, dict[str, int]] = {tid: {} for tid in tool_ids}
        for r in (await session.execute(risk_stmt)).all():
            risk_map[r.tool_id][str(r.risk_level)] = r.assessment_count

        # Assemble items
        items: list[dict[str, Any]] = []
        for r in tool_rows:
            ex = exec_map.get(r.tool_id)
            items.append(
                {
                    "tool_id": r.tool_id,
                    "tool_name": r.tool_name,
                    "tool_slug": r.tool_slug,
                    "invocation_count": r.invocation_count or 0,
                    "allow_count": r.allow_count or 0,
                    "deny_count": r.deny_count or 0,
                    "require_approval_count": r.require_approval_count or 0,
                    "execution_count": ex.execution_count if ex else 0,
                    "execution_success_count": ex.success_count if ex else 0,
                    "execution_failed_count": ex.failed_count if ex else 0,
                    "execution_timeout_count": ex.timeout_count if ex else 0,
                    "avg_evaluation_duration_ms": (
                        round(float(r.avg_eval_ms), 3) if r.avg_eval_ms is not None else None
                    ),
                    "avg_execution_duration_ms": (
                        round(float(ex.avg_exec_ms), 3) if ex and ex.avg_exec_ms is not None else None
                    ),
                    "risk_distribution": risk_map.get(r.tool_id, {}),
                }
            )

        return total_items, items

    @staticmethod
    async def get_latency_stats(
        session: AsyncSession,
        organization_id: uuid.UUID,
        start_time: datetime,
        end_time: datetime,
    ) -> tuple[dict[str, Any], dict[str, Any]]:
        """Calculate statistical summaries (avg/min/max/p50/p95/p99) for evaluation and execution latencies."""
        bind = session.get_bind()
        is_sqlite = bind.dialect.name == "sqlite"

        # ----------------------------------------------------------------------
        # 1. Evaluation Latency (ToolRequest.evaluation_duration_ms)
        # ----------------------------------------------------------------------
        eval_base_filter = and_(
            ToolRequest.organization_id == organization_id,
            ToolRequest.evaluated_at >= start_time,
            ToolRequest.evaluated_at < end_time,
            ToolRequest.evaluation_duration_ms.is_not(None),
        )

        if not is_sqlite:
            # Native PostgreSQL percentile_cont
            eval_stmt = select(
                func.count(ToolRequest.evaluation_duration_ms).label("cnt"),
                func.avg(ToolRequest.evaluation_duration_ms).label("avg"),
                func.min(ToolRequest.evaluation_duration_ms).label("min"),
                func.max(ToolRequest.evaluation_duration_ms).label("max"),
                func.percentile_cont(0.50).within_group(ToolRequest.evaluation_duration_ms).label("p50"),
                func.percentile_cont(0.95).within_group(ToolRequest.evaluation_duration_ms).label("p95"),
                func.percentile_cont(0.99).within_group(ToolRequest.evaluation_duration_ms).label("p99"),
            ).where(eval_base_filter)
            eval_res = (await session.execute(eval_stmt)).one()
            eval_stats = {
                "count": eval_res.cnt or 0,
                "avg": round(float(eval_res.avg), 3) if eval_res.avg is not None else None,
                "min": round(float(eval_res.min), 3) if eval_res.min is not None else None,
                "max": round(float(eval_res.max), 3) if eval_res.max is not None else None,
                "p50": round(float(eval_res.p50), 3) if eval_res.p50 is not None else None,
                "p95": round(float(eval_res.p95), 3) if eval_res.p95 is not None else None,
                "p99": round(float(eval_res.p99), 3) if eval_res.p99 is not None else None,
            }
        else:
            # SQLite bounded fallback
            eval_summary_stmt = select(
                func.count(ToolRequest.evaluation_duration_ms).label("cnt"),
                func.avg(ToolRequest.evaluation_duration_ms).label("avg"),
                func.min(ToolRequest.evaluation_duration_ms).label("min"),
                func.max(ToolRequest.evaluation_duration_ms).label("max"),
            ).where(eval_base_filter)
            eval_row = (await session.execute(eval_summary_stmt)).one()
            cnt = eval_row.cnt or 0
            if cnt == 0:
                eval_stats = {
                    "count": 0,
                    "avg": None,
                    "min": None,
                    "max": None,
                    "p50": None,
                    "p95": None,
                    "p99": None,
                }
            else:
                eval_vals_stmt = (
                    select(ToolRequest.evaluation_duration_ms)
                    .where(eval_base_filter)
                    .order_by(ToolRequest.evaluation_duration_ms.asc())
                    .limit(10000)
                )
                vals = [float(v) for v in (await session.execute(eval_vals_stmt)).scalars().all() if v is not None]
                eval_stats = {
                    "count": cnt,
                    "avg": round(float(eval_row.avg), 3) if eval_row.avg is not None else None,
                    "min": round(float(eval_row.min), 3) if eval_row.min is not None else None,
                    "max": round(float(eval_row.max), 3) if eval_row.max is not None else None,
                    "p50": _compute_percentile_python(vals, 0.50),
                    "p95": _compute_percentile_python(vals, 0.95),
                    "p99": _compute_percentile_python(vals, 0.99),
                }

        # ----------------------------------------------------------------------
        # 2. Execution Latency (ToolExecution.duration_ms joined via ToolRequest)
        # ----------------------------------------------------------------------
        exec_base_filter = and_(
            ToolRequest.organization_id == organization_id,
            ToolRequest.evaluated_at >= start_time,
            ToolRequest.evaluated_at < end_time,
            ToolExecution.duration_ms.is_not(None),
        )

        if not is_sqlite:
            exec_stmt = (
                select(
                    func.count(ToolExecution.duration_ms).label("cnt"),
                    func.avg(ToolExecution.duration_ms).label("avg"),
                    func.min(ToolExecution.duration_ms).label("min"),
                    func.max(ToolExecution.duration_ms).label("max"),
                    func.percentile_cont(0.50).within_group(ToolExecution.duration_ms).label("p50"),
                    func.percentile_cont(0.95).within_group(ToolExecution.duration_ms).label("p95"),
                    func.percentile_cont(0.99).within_group(ToolExecution.duration_ms).label("p99"),
                )
                .join(ToolRequest, ToolExecution.tool_request_id == ToolRequest.id)
                .where(exec_base_filter)
            )
            exec_res = (await session.execute(exec_stmt)).one()
            exec_stats = {
                "count": exec_res.cnt or 0,
                "avg": round(float(exec_res.avg), 3) if exec_res.avg is not None else None,
                "min": float(exec_res.min) if exec_res.min is not None else None,
                "max": float(exec_res.max) if exec_res.max is not None else None,
                "p50": round(float(exec_res.p50), 3) if exec_res.p50 is not None else None,
                "p95": round(float(exec_res.p95), 3) if exec_res.p95 is not None else None,
                "p99": round(float(exec_res.p99), 3) if exec_res.p99 is not None else None,
            }
        else:
            exec_summary_stmt = (
                select(
                    func.count(ToolExecution.duration_ms).label("cnt"),
                    func.avg(ToolExecution.duration_ms).label("avg"),
                    func.min(ToolExecution.duration_ms).label("min"),
                    func.max(ToolExecution.duration_ms).label("max"),
                )
                .join(ToolRequest, ToolExecution.tool_request_id == ToolRequest.id)
                .where(exec_base_filter)
            )
            exec_row = (await session.execute(exec_summary_stmt)).one()
            ex_cnt = exec_row.cnt or 0
            if ex_cnt == 0:
                exec_stats = {
                    "count": 0,
                    "avg": None,
                    "min": None,
                    "max": None,
                    "p50": None,
                    "p95": None,
                    "p99": None,
                }
            else:
                exec_vals_stmt = (
                    select(ToolExecution.duration_ms)
                    .join(ToolRequest, ToolExecution.tool_request_id == ToolRequest.id)
                    .where(exec_base_filter)
                    .order_by(ToolExecution.duration_ms.asc())
                    .limit(10000)
                )
                ex_vals = [float(v) for v in (await session.execute(exec_vals_stmt)).scalars().all() if v is not None]
                exec_stats = {
                    "count": ex_cnt,
                    "avg": round(float(exec_row.avg), 3) if exec_row.avg is not None else None,
                    "min": float(exec_row.min) if exec_row.min is not None else None,
                    "max": float(exec_row.max) if exec_row.max is not None else None,
                    "p50": _compute_percentile_python(ex_vals, 0.50),
                    "p95": _compute_percentile_python(ex_vals, 0.95),
                    "p99": _compute_percentile_python(ex_vals, 0.99),
                }

        return eval_stats, exec_stats

    @staticmethod
    async def get_heuristic_frequencies(
        session: AsyncSession,
        organization_id: uuid.UUID,
        start_time: datetime,
        end_time: datetime,
    ) -> tuple[int, list[dict[str, Any]]]:
        """Aggregate frequency counts for matched risk heuristics using stored heuristics_matched JSON."""
        stmt = select(RiskAssessment.heuristics_matched).where(
            and_(
                RiskAssessment.organization_id == organization_id,
                RiskAssessment.assessed_at >= start_time,
                RiskAssessment.assessed_at < end_time,
            )
        )
        rows = (await session.execute(stmt)).scalars().all()

        freq_map: dict[str, dict[str, Any]] = {}
        total_matches = 0

        for match_list in rows:
            if not match_list or not isinstance(match_list, list):
                continue
            for item in match_list:
                if not isinstance(item, dict):
                    continue
                rule_id = item.get("rule_id")
                if not rule_id or not isinstance(rule_id, str):
                    continue
                severity = str(item.get("severity", "MEDIUM"))
                score_contrib = float(item.get("score_contribution", 0.0))

                total_matches += 1
                if rule_id not in freq_map:
                    freq_map[rule_id] = {
                        "rule_id": rule_id,
                        "count": 0,
                        "severity": severity,
                        "total_score_contribution": 0.0,
                    }
                freq_map[rule_id]["count"] += 1
                freq_map[rule_id]["total_score_contribution"] += score_contrib

        items: list[dict[str, Any]] = []
        for r_id, data in freq_map.items():
            cnt = data["count"]
            avg_contrib = round(data["total_score_contribution"] / cnt, 2) if cnt > 0 else 0.0
            items.append(
                {
                    "rule_id": r_id,
                    "count": cnt,
                    "severity": data["severity"],
                    "avg_score_contribution": avg_contrib,
                }
            )

        # Deterministic ordering: count DESC, rule_id ASC
        items.sort(key=lambda x: (-x["count"], x["rule_id"]))
        return total_matches, items
