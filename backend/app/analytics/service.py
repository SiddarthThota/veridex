"""Governance Analytics Service coordinating read-only analytics queries and anomaly detection."""

import math
import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy.ext.asyncio import AsyncSession

from app.analytics.anomalies import AnomalyDetector
from app.analytics.exceptions import (
    InvalidGranularityError,
    InvalidPaginationError,
    InvalidTimeRangeError,
)
from app.analytics.queries import AnalyticsQueries
from app.analytics.schemas import (
    AgentAnalyticsItem,
    AgentAnalyticsResponse,
    AnomalyReport,
    Granularity,
    HeuristicFrequencyItem,
    HeuristicFrequencyResponse,
    LatencyAnalyticsResponse,
    LatencyMetricStats,
    OverviewAnalytics,
    PaginationMeta,
    RiskDistributionAnalytics,
    RiskHistogramBucket,
    ToolUtilizationItem,
    ToolUtilizationResponse,
    TrendBucket,
    TrendsAnalytics,
)


class AnalyticsService:
    """Service providing organization-isolated, read-only analytics and anomaly detection."""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    @staticmethod
    def normalize_time_range(
        start_time: datetime | None,
        end_time: datetime | None,
    ) -> tuple[datetime, datetime]:
        """Normalize and strictly validate time intervals in UTC.

        Rules:
        - Default end_time: datetime.now(UTC)
        - Default start_time: end_time - 7 days
        - Validates start_time < end_time (half-open: [start_time, end_time))
        - Enforces maximum range limit of 90 days.
        """
        now = datetime.now(UTC)
        resolved_end = end_time if end_time is not None else now
        if resolved_end.tzinfo is None:
            resolved_end = resolved_end.replace(tzinfo=UTC)

        resolved_start = start_time if start_time is not None else (resolved_end - timedelta(days=7))
        if resolved_start.tzinfo is None:
            resolved_start = resolved_start.replace(tzinfo=UTC)

        if resolved_start >= resolved_end:
            raise InvalidTimeRangeError(
                f"Invalid time range: start_time ({resolved_start.isoformat()}) "
                f"must be strictly earlier than end_time ({resolved_end.isoformat()})"
            )

        if (resolved_end - resolved_start).total_seconds() > (90 * 86400):
            raise InvalidTimeRangeError(
                f"Requested time range ({(resolved_end - resolved_start).days} days) "
                f"exceeds the maximum supported boundary of 90 days."
            )

        return resolved_start, resolved_end

    @staticmethod
    def validate_pagination(page: int, page_size: int) -> tuple[int, int]:
        """Validate and normalize pagination parameters."""
        if page < 1:
            raise InvalidPaginationError(f"page must be >= 1, got {page}")
        if page_size < 1 or page_size > 100:
            raise InvalidPaginationError(f"page_size must be between 1 and 100, got {page_size}")
        return page, page_size

    async def get_overview(
        self,
        organization_id: uuid.UUID,
        start_time: datetime | None = None,
        end_time: datetime | None = None,
    ) -> OverviewAnalytics:
        """Calculate high-level volumetric counts, decision rates, and approval resolution statistics."""
        norm_start, norm_end = self.normalize_time_range(start_time, end_time)
        data = await AnalyticsQueries.get_overview_counts(self.session, organization_id, norm_start, norm_end)

        total_inv = data["total_invocations"]
        allow_pct = round((data["allow_count"] / total_inv * 100.0), 2) if total_inv > 0 else 0.0
        deny_pct = round((data["deny_count"] / total_inv * 100.0), 2) if total_inv > 0 else 0.0
        req_app_pct = round((data["require_approval_count"] / total_inv * 100.0), 2) if total_inv > 0 else 0.0

        resolved_approvals = data["approved_approvals"] + data["rejected_approvals"]
        resolution_rate = round(data["approved_approvals"] / resolved_approvals, 4) if resolved_approvals > 0 else None

        return OverviewAnalytics(
            total_invocations=total_inv,
            allow_count=data["allow_count"],
            deny_count=data["deny_count"],
            require_approval_count=data["require_approval_count"],
            allow_percentage=allow_pct,
            deny_percentage=deny_pct,
            require_approval_percentage=req_app_pct,
            total_tool_executions=data["total_tool_executions"],
            total_approvals=data["total_approvals"],
            approved_approvals=data["approved_approvals"],
            rejected_approvals=data["rejected_approvals"],
            pending_approvals=data["pending_approvals"],
            expired_approvals=data["expired_approvals"],
            approval_resolution_rate=resolution_rate,
            start_time=norm_start,
            end_time=norm_end,
        )

    async def get_trends(
        self,
        organization_id: uuid.UUID,
        start_time: datetime | None = None,
        end_time: datetime | None = None,
        granularity: str | Granularity = Granularity.DAY,
    ) -> TrendsAnalytics:
        """Generate contiguous time-series buckets for governance invocations, executions, and risks."""
        norm_start, norm_end = self.normalize_time_range(start_time, end_time)

        try:
            resolved_gran = Granularity(str(granularity).lower())
        except ValueError as err:
            raise InvalidGranularityError(f"Unsupported granularity: {granularity}. Supported: hour, day") from err

        if resolved_gran == Granularity.HOUR and (norm_end - norm_start) > timedelta(days=14):
            raise InvalidGranularityError("Hourly granularity is limited to time ranges of 14 days or less.")

        req_rows, exec_rows, risk_rows = await AnalyticsQueries.get_raw_trend_records(
            self.session, organization_id, norm_start, norm_end, resolved_gran.value
        )

        # Build lookup maps normalized to UTC timestamp
        def norm_key(dt: datetime) -> datetime:
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=UTC)
            return dt

        req_map = {norm_key(r[0]): r for r in req_rows}
        exec_map = {norm_key(r[0]): r[1] for r in exec_rows}
        risk_map = {norm_key(r[0]): r[1] for r in risk_rows}

        # Generate contiguous time sequence from floored start_time
        if resolved_gran == Granularity.HOUR:
            curr = norm_start.replace(minute=0, second=0, microsecond=0)
            step = timedelta(hours=1)
        else:
            curr = norm_start.replace(hour=0, minute=0, second=0, microsecond=0)
            step = timedelta(days=1)

        buckets: list[TrendBucket] = []
        while curr < norm_end:
            req_data = req_map.get(curr)
            if req_data:
                total_inv = req_data[1]
                allow_c = req_data[2]
                deny_c = req_data[3]
                req_app_c = req_data[4]
            else:
                total_inv = allow_c = deny_c = req_app_c = 0

            exec_c = exec_map.get(curr, 0)
            risk_c = risk_map.get(curr, 0)

            buckets.append(
                TrendBucket(
                    timestamp=curr,
                    total_invocations=total_inv,
                    allow_count=allow_c,
                    deny_count=deny_c,
                    require_approval_count=req_app_c,
                    tool_executions_count=exec_c,
                    risk_assessments_count=risk_c,
                )
            )
            curr += step

        return TrendsAnalytics(
            granularity=resolved_gran,
            buckets=buckets,
            start_time=norm_start,
            end_time=norm_end,
        )

    async def get_risk_distribution(
        self,
        organization_id: uuid.UUID,
        start_time: datetime | None = None,
        end_time: datetime | None = None,
    ) -> RiskDistributionAnalytics:
        """Calculate quantitative risk score aggregates and standard 10-bucket histogram."""
        norm_start, norm_end = self.normalize_time_range(start_time, end_time)
        data = await AnalyticsQueries.get_risk_distribution_stats(self.session, organization_id, norm_start, norm_end)

        histogram_buckets = [RiskHistogramBucket(**b) for b in data["histogram"]]

        return RiskDistributionAnalytics(
            total_assessments=data["total_assessments"],
            low_count=data["low_count"],
            medium_count=data["medium_count"],
            high_count=data["high_count"],
            critical_count=data["critical_count"],
            average_risk_score=data["avg_score"],
            min_risk_score=data["min_score"],
            max_risk_score=data["max_score"],
            histogram=histogram_buckets,
            start_time=norm_start,
            end_time=norm_end,
        )

    async def get_agent_analytics(
        self,
        organization_id: uuid.UUID,
        start_time: datetime | None = None,
        end_time: datetime | None = None,
        page: int = 1,
        page_size: int = 20,
    ) -> AgentAnalyticsResponse:
        """Retrieve paginated agent activity, historical denial rates, and risk metrics."""
        norm_start, norm_end = self.normalize_time_range(start_time, end_time)
        norm_page, norm_page_size = self.validate_pagination(page, page_size)
        offset = (norm_page - 1) * norm_page_size

        total_items, raw_items = await AnalyticsQueries.get_agent_analytics(
            self.session, organization_id, norm_start, norm_end, offset, norm_page_size
        )

        total_pages = math.ceil(total_items / norm_page_size) if total_items > 0 else 0
        pagination = PaginationMeta(
            page=norm_page,
            page_size=norm_page_size,
            total_items=total_items,
            total_pages=total_pages,
        )

        items = [AgentAnalyticsItem(**item) for item in raw_items]
        return AgentAnalyticsResponse(
            items=items,
            pagination=pagination,
            start_time=norm_start,
            end_time=norm_end,
        )

    async def get_tool_analytics(
        self,
        organization_id: uuid.UUID,
        start_time: datetime | None = None,
        end_time: datetime | None = None,
        page: int = 1,
        page_size: int = 20,
    ) -> ToolUtilizationResponse:
        """Retrieve paginated tool invocation frequency, execution success rates, and latencies."""
        norm_start, norm_end = self.normalize_time_range(start_time, end_time)
        norm_page, norm_page_size = self.validate_pagination(page, page_size)
        offset = (norm_page - 1) * norm_page_size

        total_items, raw_items = await AnalyticsQueries.get_tool_analytics(
            self.session, organization_id, norm_start, norm_end, offset, norm_page_size
        )

        total_pages = math.ceil(total_items / norm_page_size) if total_items > 0 else 0
        pagination = PaginationMeta(
            page=norm_page,
            page_size=norm_page_size,
            total_items=total_items,
            total_pages=total_pages,
        )

        items = [ToolUtilizationItem(**item) for item in raw_items]
        return ToolUtilizationResponse(
            items=items,
            pagination=pagination,
            start_time=norm_start,
            end_time=norm_end,
        )

    async def get_latency_analytics(
        self,
        organization_id: uuid.UUID,
        start_time: datetime | None = None,
        end_time: datetime | None = None,
    ) -> LatencyAnalyticsResponse:
        """Retrieve statistical metrics and percentiles for evaluation and execution latencies."""
        norm_start, norm_end = self.normalize_time_range(start_time, end_time)
        eval_stats, exec_stats = await AnalyticsQueries.get_latency_stats(
            self.session, organization_id, norm_start, norm_end
        )

        return LatencyAnalyticsResponse(
            evaluation_latency=LatencyMetricStats(**eval_stats),
            execution_latency=LatencyMetricStats(**exec_stats),
            start_time=norm_start,
            end_time=norm_end,
        )

    async def get_heuristic_frequency(
        self,
        organization_id: uuid.UUID,
        start_time: datetime | None = None,
        end_time: datetime | None = None,
    ) -> HeuristicFrequencyResponse:
        """Retrieve aggregate counts and contribution statistics for matched risk heuristics."""
        norm_start, norm_end = self.normalize_time_range(start_time, end_time)
        total_matches, raw_items = await AnalyticsQueries.get_heuristic_frequencies(
            self.session, organization_id, norm_start, norm_end
        )

        items = [HeuristicFrequencyItem(**item) for item in raw_items]
        return HeuristicFrequencyResponse(
            items=items,
            total_matches=total_matches,
            start_time=norm_start,
            end_time=norm_end,
        )

    async def detect_anomalies(
        self,
        organization_id: uuid.UUID,
        evaluation_time: datetime | None = None,
    ) -> AnomalyReport:
        """Execute read-only anomaly detection rules against current and baseline windows."""
        return await AnomalyDetector.evaluate_anomalies(self.session, organization_id, evaluation_time)
