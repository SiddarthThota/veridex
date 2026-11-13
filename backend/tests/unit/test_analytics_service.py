"""Unit and integration tests for the Veridex Governance Analytics Engine (Phase 8.3)."""

import uuid
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import func, select
from sqlalchemy.dialects import postgresql
from sqlalchemy.ext.asyncio import AsyncSession

from app.agents.models import Agent, AgentEnvironment, AgentRiskTier, AgentStatus
from app.analytics.exceptions import (
    InvalidGranularityError,
    InvalidPaginationError,
    InvalidTimeRangeError,
)
from app.analytics.schemas import (
    AnomalySeverity,
    AnomalyStatus,
    AnomalyType,
    Granularity,
)
from app.analytics.service import AnalyticsService
from app.governance.models import (
    ApprovalRequest,
    ApprovalStatus,
    ExecutionStatus,
    GovernanceDecision,
    ToolExecution,
    ToolRequest,
)
from app.risk.models import AgentHistoryStatus, AgentRiskProfile, RiskAssessment, RiskLevel
from app.tools.models import (
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
from app.users.models import Organization, OrganizationStatus, Role, User, UserStatus


async def _create_base_fixtures(db: AsyncSession) -> tuple[Organization, Organization, User, Agent, Tool, ToolVersion]:
    """Helper to create two distinct organizations, a user, an agent, and a tool."""
    uid = uuid.uuid4()
    org_a = Organization(name=f"Org A {uid}", slug=f"org-a-{uid}", status=OrganizationStatus.ACTIVE)
    org_b = Organization(name=f"Org B {uid}", slug=f"org-b-{uid}", status=OrganizationStatus.ACTIVE)
    db.add_all([org_a, org_b])
    await db.commit()
    await db.refresh(org_a)
    await db.refresh(org_b)

    user = User(
        organization_id=org_a.id,
        email=f"user-{uid}@example.com",
        password_hash="hash",
        display_name="User A",
        status=UserStatus.ACTIVE,
        role=Role.ADMIN,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)

    agent = Agent(
        organization_id=org_a.id,
        name=f"Agent {uid}",
        slug=f"agent-{uid}",
        owner_user_id=user.id,
        status=AgentStatus.ACTIVE,
        environment=AgentEnvironment.PRODUCTION,
        risk_tier=AgentRiskTier.LOW,
        model_provider="mock",
        model_name="mock-model",
    )
    db.add(agent)
    await db.commit()
    await db.refresh(agent)

    tool = Tool(
        organization_id=org_a.id,
        name=f"Tool {uid}",
        slug=f"tool-{uid}",
        owner_user_id=user.id,
        status=ToolStatus.ACTIVE,
        risk_level=ToolRiskLevel.LOW,
        access_type=ToolAccessType.READ,
        reversibility=ToolReversibility.REVERSIBLE,
        data_classification=ToolDataClassification.INTERNAL,
        approval_requirement=ToolApprovalRequirement.NOT_REQUIRED,
    )
    db.add(tool)
    await db.commit()
    await db.refresh(tool)

    version = ToolVersion(
        tool_id=tool.id,
        version="1.0.0",
        created_by=user.id,
        status=ToolVersionStatus.PUBLISHED,
    )
    db.add(version)
    await db.commit()
    await db.refresh(version)

    return org_a, org_b, user, agent, tool, version


# ==============================================================================
# A. Time Range and Pagination Validation Tests
# ==============================================================================


def test_time_range_validation_success() -> None:
    """Test standard valid time range normalization."""
    now = datetime.now(UTC)
    start = now - timedelta(days=5)

    norm_start, norm_end = AnalyticsService.normalize_time_range(start, now)
    assert norm_start == start
    assert norm_end == now


def test_time_range_defaults_to_last_seven_days() -> None:
    """Test defaults when no timestamps are provided."""
    norm_start, norm_end = AnalyticsService.normalize_time_range(None, None)
    diff = norm_end - norm_start
    assert abs(diff.total_seconds() - (7 * 86400)) < 2.0


def test_time_range_rejects_inverted_or_equal_range() -> None:
    """Test rejection when start_time >= end_time."""
    now = datetime.now(UTC)
    with pytest.raises(InvalidTimeRangeError, match="strictly earlier"):
        AnalyticsService.normalize_time_range(now, now)

    with pytest.raises(InvalidTimeRangeError, match="strictly earlier"):
        AnalyticsService.normalize_time_range(now, now - timedelta(hours=1))


def test_time_range_rejects_exceeding_ninety_days() -> None:
    """Test rejection when range exceeds 90 days."""
    now = datetime.now(UTC)
    with pytest.raises(InvalidTimeRangeError, match="exceeds the maximum supported boundary of 90 days"):
        AnalyticsService.normalize_time_range(now - timedelta(days=91), now)


def test_pagination_validation() -> None:
    """Test page and page_size bounds."""
    assert AnalyticsService.validate_pagination(1, 20) == (1, 20)
    assert AnalyticsService.validate_pagination(5, 100) == (5, 100)

    with pytest.raises(InvalidPaginationError, match="page must be >= 1"):
        AnalyticsService.validate_pagination(0, 20)

    with pytest.raises(InvalidPaginationError, match="page_size must be between 1 and 100"):
        AnalyticsService.validate_pagination(1, 0)

    with pytest.raises(InvalidPaginationError, match="page_size must be between 1 and 100"):
        AnalyticsService.validate_pagination(1, 101)


# ==============================================================================
# B. Overview Analytics Tests
# ==============================================================================


@pytest.mark.asyncio
async def test_overview_analytics_counts_and_resolution_rate(db_session: AsyncSession) -> None:
    """Test volumetric counts, percentages, and approval resolution rate calculations."""
    org_a, org_b, user, agent, tool, version = await _create_base_fixtures(db_session)
    service = AnalyticsService(db_session)

    t0 = datetime(2026, 11, 1, 12, 0, 0, tzinfo=UTC)

    # 1. Requests for Org A: 2 ALLOW, 1 DENY, 1 REQUIRE_APPROVAL = 4 total
    req1 = ToolRequest(
        organization_id=org_a.id,
        agent_id=agent.id,
        tool_id=tool.id,
        tool_version_id=version.id,
        decision=GovernanceDecision.ALLOW,
        arguments={"x": 1},
        arguments_hash="h1",
        evaluated_at=t0 + timedelta(hours=1),
        evaluation_duration_ms=10.5,
    )
    req2 = ToolRequest(
        organization_id=org_a.id,
        agent_id=agent.id,
        tool_id=tool.id,
        tool_version_id=version.id,
        decision=GovernanceDecision.ALLOW,
        arguments={"x": 2},
        arguments_hash="h2",
        evaluated_at=t0 + timedelta(hours=2),
        evaluation_duration_ms=12.0,
    )
    req3 = ToolRequest(
        organization_id=org_a.id,
        agent_id=agent.id,
        tool_id=tool.id,
        tool_version_id=version.id,
        decision=GovernanceDecision.DENY,
        arguments={"x": 3},
        arguments_hash="h3",
        evaluated_at=t0 + timedelta(hours=3),
        evaluation_duration_ms=5.0,
    )
    req4 = ToolRequest(
        organization_id=org_a.id,
        agent_id=agent.id,
        tool_id=tool.id,
        tool_version_id=version.id,
        decision=GovernanceDecision.REQUIRE_APPROVAL,
        arguments={"x": 4},
        arguments_hash="h4",
        evaluated_at=t0 + timedelta(hours=4),
        evaluation_duration_ms=15.0,
    )
    # Request for Org B (must not leak into Org A)
    req_b = ToolRequest(
        organization_id=org_b.id,
        agent_id=agent.id,
        tool_id=tool.id,
        tool_version_id=version.id,
        decision=GovernanceDecision.ALLOW,
        arguments={"x": 99},
        arguments_hash="h99",
        evaluated_at=t0 + timedelta(hours=1),
        evaluation_duration_ms=10.0,
    )
    db_session.add_all([req1, req2, req3, req4, req_b])
    await db_session.commit()

    # Tool Execution on req1
    exec1 = ToolExecution(
        tool_request_id=req1.id,
        status=ExecutionStatus.SUCCESS,
        duration_ms=45,
        executed_at=t0 + timedelta(hours=1, minutes=1),
    )
    db_session.add(exec1)

    # Approvals for Org A: 2 APPROVED, 1 REJECTED, 1 PENDING, 1 EXPIRED
    app1 = ApprovalRequest(
        tool_request_id=req1.id,
        organization_id=org_a.id,
        status=ApprovalStatus.APPROVED,
        integrity_hash="app_h1",
        created_at=t0 + timedelta(hours=1),
    )
    app2 = ApprovalRequest(
        tool_request_id=req2.id,
        organization_id=org_a.id,
        status=ApprovalStatus.APPROVED,
        integrity_hash="app_h2",
        created_at=t0 + timedelta(hours=2),
    )
    app3 = ApprovalRequest(
        tool_request_id=req3.id,
        organization_id=org_a.id,
        status=ApprovalStatus.REJECTED,
        integrity_hash="app_h3",
        created_at=t0 + timedelta(hours=3),
    )
    app4 = ApprovalRequest(
        tool_request_id=req4.id,
        organization_id=org_a.id,
        status=ApprovalStatus.PENDING,
        integrity_hash="app_h4",
        created_at=t0 + timedelta(hours=4),
    )
    # 5th approval on a fake req id for expired test
    req_dummy = ToolRequest(
        organization_id=org_a.id,
        agent_id=agent.id,
        tool_id=tool.id,
        tool_version_id=version.id,
        decision=GovernanceDecision.REQUIRE_APPROVAL,
        arguments={"x": 5},
        arguments_hash="h5",
        evaluated_at=t0 + timedelta(hours=5),
    )
    db_session.add(req_dummy)
    await db_session.commit()

    app5 = ApprovalRequest(
        tool_request_id=req_dummy.id,
        organization_id=org_a.id,
        status=ApprovalStatus.EXPIRED,
        integrity_hash="app_h5",
        created_at=t0 + timedelta(hours=5),
    )
    db_session.add_all([app1, app2, app3, app4, app5])
    await db_session.commit()

    # Query Overview
    start_time = t0
    end_time = t0 + timedelta(days=1)
    overview = await service.get_overview(org_a.id, start_time, end_time)

    assert overview.total_invocations == 5
    assert overview.allow_count == 2
    assert overview.deny_count == 1
    assert overview.require_approval_count == 2
    assert overview.allow_percentage == 40.0
    assert overview.deny_percentage == 20.0
    assert overview.require_approval_percentage == 40.0
    assert overview.total_tool_executions == 1

    assert overview.total_approvals == 5
    assert overview.approved_approvals == 2
    assert overview.rejected_approvals == 1
    assert overview.pending_approvals == 1
    assert overview.expired_approvals == 1

    # resolution rate = approved / (approved + rejected) = 2 / (2 + 1) = 2/3 = 0.6667
    assert overview.approval_resolution_rate == 0.6667


@pytest.mark.asyncio
async def test_overview_resolution_rate_zero_denominator(db_session: AsyncSession) -> None:
    """Test that approval resolution rate is null when approved + rejected == 0."""
    org_a, _, _, _, _, _ = await _create_base_fixtures(db_session)
    service = AnalyticsService(db_session)

    overview = await service.get_overview(org_a.id, datetime(2026, 1, 1, tzinfo=UTC), datetime(2026, 1, 2, tzinfo=UTC))
    assert overview.total_invocations == 0
    assert overview.allow_percentage == 0.0
    assert overview.approval_resolution_rate is None


# ==============================================================================
# C. Trends Analytics Tests
# ==============================================================================


@pytest.mark.asyncio
async def test_trends_hourly_and_daily_aggregation(db_session: AsyncSession) -> None:
    """Test contiguous time-series aggregation and half-open boundary filtering."""
    org_a, _, user, agent, tool, version = await _create_base_fixtures(db_session)
    service = AnalyticsService(db_session)

    t0 = datetime(2026, 11, 1, 10, 0, 0, tzinfo=UTC)

    # Invocations at 10:15 and 11:30
    req1 = ToolRequest(
        organization_id=org_a.id,
        agent_id=agent.id,
        tool_id=tool.id,
        tool_version_id=version.id,
        decision=GovernanceDecision.ALLOW,
        arguments={"x": 1},
        arguments_hash="h1",
        evaluated_at=t0 + timedelta(minutes=15),
    )
    req2 = ToolRequest(
        organization_id=org_a.id,
        agent_id=agent.id,
        tool_id=tool.id,
        tool_version_id=version.id,
        decision=GovernanceDecision.DENY,
        arguments={"x": 2},
        arguments_hash="h2",
        evaluated_at=t0 + timedelta(hours=1, minutes=30),
    )
    db_session.add_all([req1, req2])
    await db_session.commit()

    # Query 3 hours: 10:00, 11:00, 12:00
    start = t0
    end = t0 + timedelta(hours=3)
    trends = await service.get_trends(org_a.id, start, end, granularity=Granularity.HOUR)

    assert trends.granularity == Granularity.HOUR
    assert len(trends.buckets) == 3

    b0 = trends.buckets[0]
    assert b0.timestamp == t0
    assert b0.total_invocations == 1
    assert b0.allow_count == 1
    assert b0.deny_count == 0

    b1 = trends.buckets[1]
    assert b1.timestamp == t0 + timedelta(hours=1)
    assert b1.total_invocations == 1
    assert b1.allow_count == 0
    assert b1.deny_count == 1

    b2 = trends.buckets[2]  # empty bucket filled with 0s
    assert b2.timestamp == t0 + timedelta(hours=2)
    assert b2.total_invocations == 0


@pytest.mark.asyncio
async def test_trends_hourly_granularity_limit(db_session: AsyncSession) -> None:
    """Test that hourly trends reject ranges exceeding 14 days."""
    org_a, _, _, _, _, _ = await _create_base_fixtures(db_session)
    service = AnalyticsService(db_session)

    start = datetime(2026, 1, 1, tzinfo=UTC)
    end = start + timedelta(days=15)

    with pytest.raises(InvalidGranularityError, match="14 days or less"):
        await service.get_trends(org_a.id, start, end, granularity="hour")


# ==============================================================================
# D. Risk Distribution Analytics Tests
# ==============================================================================


@pytest.mark.asyncio
async def test_risk_distribution_histogram_and_boundaries(db_session: AsyncSession) -> None:
    """Test 10-bucket histogram, exact boundaries, score 100 inclusion, and empty stats."""
    org_a, _, _, agent, tool, version = await _create_base_fixtures(db_session)
    service = AnalyticsService(db_session)

    t0 = datetime(2026, 11, 1, 12, 0, 0, tzinfo=UTC)

    # Risk scores: 0 (bucket 0), 10 (bucket 1), 59 (bucket 5), 60 (bucket 6), 100 (bucket 9)
    scores = [
        (0, RiskLevel.LOW),
        (10, RiskLevel.LOW),
        (59, RiskLevel.MEDIUM),
        (60, RiskLevel.HIGH),
        (100, RiskLevel.CRITICAL),
    ]
    for s, lvl in scores:
        ra = RiskAssessment(
            organization_id=org_a.id,
            agent_id=agent.id,
            tool_id=tool.id,
            tool_version_id=version.id,
            risk_score=s,
            risk_level=lvl,
            subscore_tool=float(s),
            subscore_data=float(s),
            subscore_agent=float(s),
            subscore_context=float(s),
            assessed_at=t0 + timedelta(minutes=s),
        )
        db_session.add(ra)
    await db_session.commit()

    dist = await service.get_risk_distribution(org_a.id, t0, t0 + timedelta(days=1))
    assert dist.total_assessments == 5
    assert dist.low_count == 2
    assert dist.medium_count == 1
    assert dist.high_count == 1
    assert dist.critical_count == 1
    assert dist.min_risk_score == 0
    assert dist.max_risk_score == 100
    assert dist.average_risk_score == round((0 + 10 + 59 + 60 + 100) / 5, 2)  # 45.8

    # Verify histogram buckets
    hist = {b.range_label: b.count for b in dist.histogram}
    assert hist["[0,10)"] == 1  # 0
    assert hist["[10,20)"] == 1  # 10
    assert hist["[50,60)"] == 1  # 59
    assert hist["[60,70)"] == 1  # 60
    assert hist["[90,100]"] == 1  # 100 included in last bucket


@pytest.mark.asyncio
async def test_risk_distribution_empty_dataset(db_session: AsyncSession) -> None:
    """Test risk distribution with zero records."""
    org_a, _, _, _, _, _ = await _create_base_fixtures(db_session)
    service = AnalyticsService(db_session)

    dist = await service.get_risk_distribution(
        org_a.id, datetime(2026, 1, 1, tzinfo=UTC), datetime(2026, 1, 2, tzinfo=UTC)
    )
    assert dist.total_assessments == 0
    assert dist.average_risk_score is None
    assert dist.min_risk_score is None
    assert dist.max_risk_score is None
    assert len(dist.histogram) == 10
    assert all(b.count == 0 for b in dist.histogram)


# ==============================================================================
# E. Agent Analytics Tests
# ==============================================================================


@pytest.mark.asyncio
async def test_agent_analytics_metrics_and_distinctions(db_session: AsyncSession) -> None:
    """Test per-agent aggregation, historical denial rate, and distinction from profile violation rate."""
    org_a, _, user, agent, tool, version = await _create_base_fixtures(db_session)
    service = AnalyticsService(db_session)

    t0 = datetime(2026, 11, 1, 12, 0, 0, tzinfo=UTC)

    # 4 requests: 1 ALLOW, 3 DENY
    for i in range(4):
        req = ToolRequest(
            organization_id=org_a.id,
            agent_id=agent.id,
            tool_id=tool.id,
            tool_version_id=version.id,
            decision=GovernanceDecision.DENY if i < 3 else GovernanceDecision.ALLOW,
            arguments={"idx": i},
            arguments_hash=f"hash_{i}",
            evaluated_at=t0 + timedelta(minutes=i * 10),
            evaluation_duration_ms=10.0 + i,
        )
        db_session.add(req)

    # Add AgentRiskProfile with distinct violation rate (e.g. 0.05 from sliding window)
    profile = AgentRiskProfile(
        organization_id=org_a.id,
        agent_id=agent.id,
        calculated_trust_score=88.5,
        total_eligible_invocations=50,
        total_violations=2,
        violation_rate=0.04,
        history_status=AgentHistoryStatus.VALID,
    )
    db_session.add(profile)
    await db_session.commit()

    res = await service.get_agent_analytics(org_a.id, t0, t0 + timedelta(days=1), page=1, page_size=20)
    assert res.pagination.total_items == 1
    assert len(res.items) == 1

    item = res.items[0]
    assert item.agent_id == agent.id
    assert item.total_invocations == 4
    assert item.deny_count == 3
    assert item.allow_count == 1
    # Historical denial rate: 3 / 4 = 0.75
    assert item.historical_denial_rate == 0.75
    # Distinct from profile violation rate: 0.04
    assert item.profile_violation_rate == 0.04
    assert item.calculated_trust_score == 88.5
    assert item.history_status == "VALID"


# ==============================================================================
# F. Tool Utilization Analytics Tests
# ==============================================================================


@pytest.mark.asyncio
async def test_tool_utilization_analytics(db_session: AsyncSession) -> None:
    """Test tool invocations, execution statuses, and execution failure vs governance deny distinction."""
    org_a, _, _, agent, tool, version = await _create_base_fixtures(db_session)
    service = AnalyticsService(db_session)

    t0 = datetime(2026, 11, 1, 12, 0, 0, tzinfo=UTC)

    # Request 1: ALLOW + Execution SUCCESS
    req1 = ToolRequest(
        organization_id=org_a.id,
        agent_id=agent.id,
        tool_id=tool.id,
        tool_version_id=version.id,
        decision=GovernanceDecision.ALLOW,
        arguments={"x": 1},
        arguments_hash="th1",
        evaluated_at=t0 + timedelta(minutes=10),
        evaluation_duration_ms=15.0,
    )
    db_session.add(req1)
    await db_session.commit()

    exec1 = ToolExecution(
        tool_request_id=req1.id,
        status=ExecutionStatus.SUCCESS,
        duration_ms=120,
        executed_at=t0 + timedelta(minutes=11),
    )
    # Request 2: ALLOW + Execution FAILED (Tool allowed, but backend execution crashed)
    req2 = ToolRequest(
        organization_id=org_a.id,
        agent_id=agent.id,
        tool_id=tool.id,
        tool_version_id=version.id,
        decision=GovernanceDecision.ALLOW,
        arguments={"x": 2},
        arguments_hash="th2",
        evaluated_at=t0 + timedelta(minutes=20),
        evaluation_duration_ms=20.0,
    )
    db_session.add(req2)
    await db_session.commit()

    exec2 = ToolExecution(
        tool_request_id=req2.id,
        status=ExecutionStatus.FAILED,
        duration_ms=50,
        executed_at=t0 + timedelta(minutes=21),
    )
    db_session.add_all([exec1, exec2])
    await db_session.commit()

    res = await service.get_tool_analytics(org_a.id, t0, t0 + timedelta(days=1), page=1, page_size=20)
    assert res.pagination.total_items == 1
    tool_stat = res.items[0]

    assert tool_stat.tool_id == tool.id
    assert tool_stat.invocation_count == 2
    assert tool_stat.allow_count == 2
    assert tool_stat.deny_count == 0
    assert tool_stat.execution_count == 2
    assert tool_stat.execution_success_count == 1
    assert tool_stat.execution_failed_count == 1
    assert tool_stat.avg_evaluation_duration_ms == 17.5
    assert tool_stat.avg_execution_duration_ms == 85.0


# ==============================================================================
# G. Latency Analytics Tests
# ==============================================================================


@pytest.mark.asyncio
async def test_latency_analytics_and_percentiles(db_session: AsyncSession) -> None:
    """Test evaluation and execution latency statistics (min/max/avg/p50/p95/p99)."""
    org_a, _, _, agent, tool, version = await _create_base_fixtures(db_session)
    service = AnalyticsService(db_session)

    t0 = datetime(2026, 11, 1, 12, 0, 0, tzinfo=UTC)

    # 10 requests with known evaluation durations: 10, 20, 30, 40, 50, 60, 70, 80, 90, 100
    for i in range(1, 11):
        req = ToolRequest(
            organization_id=org_a.id,
            agent_id=agent.id,
            tool_id=tool.id,
            tool_version_id=version.id,
            decision=GovernanceDecision.ALLOW,
            arguments={"i": i},
            arguments_hash=f"lath_{i}",
            evaluated_at=t0 + timedelta(minutes=i),
            evaluation_duration_ms=float(i * 10),
        )
        db_session.add(req)
        await db_session.commit()

        exec_rec = ToolExecution(
            tool_request_id=req.id,
            status=ExecutionStatus.SUCCESS,
            duration_ms=i * 100,
            executed_at=t0 + timedelta(minutes=i, seconds=1),
        )
        db_session.add(exec_rec)
    await db_session.commit()

    latency_res = await service.get_latency_analytics(org_a.id, t0, t0 + timedelta(days=1))

    # Evaluation latency stats
    ev = latency_res.evaluation_latency
    assert ev.count == 10
    assert ev.min == 10.0
    assert ev.max == 100.0
    assert ev.avg == 55.0
    assert ev.p50 is not None
    assert 50.0 <= ev.p50 <= 60.0
    assert ev.p95 is not None
    assert 90.0 <= ev.p95 <= 100.0
    assert ev.p99 is not None

    # Execution latency stats
    ex = latency_res.execution_latency
    assert ex.count == 10
    assert ex.min == 100.0
    assert ex.max == 1000.0
    assert ex.avg == 550.0
    assert ex.p50 is not None
    assert 500.0 <= ex.p50 <= 600.0


def test_postgresql_percentile_compilation() -> None:
    """Verify that PostgreSQL percentile queries compile to valid native SQL."""
    stmt = select(
        func.percentile_cont(0.50).within_group(ToolRequest.evaluation_duration_ms).label("p50"),
        func.percentile_cont(0.95).within_group(ToolRequest.evaluation_duration_ms).label("p95"),
    ).where(ToolRequest.organization_id == uuid.uuid4())

    compiled = str(stmt.compile(dialect=postgresql.dialect()))
    assert "percentile_cont" in compiled.lower()
    assert "within group (order by tool_requests.evaluation_duration_ms)" in compiled.lower()


# ==============================================================================
# H. Historical Heuristic Frequency Tests
# ==============================================================================


@pytest.mark.asyncio
async def test_heuristic_frequencies_grouping_and_isolation(db_session: AsyncSession) -> None:
    """Test heuristic rule frequency aggregation, severity mapping, and tenant isolation."""
    org_a, org_b, _, agent, tool, version = await _create_base_fixtures(db_session)
    service = AnalyticsService(db_session)

    t0 = datetime(2026, 11, 1, 12, 0, 0, tzinfo=UTC)

    # Org A: 2 matched heuristics
    ra1 = RiskAssessment(
        organization_id=org_a.id,
        agent_id=agent.id,
        tool_id=tool.id,
        tool_version_id=version.id,
        risk_score=75,
        risk_level=RiskLevel.HIGH,
        subscore_tool=75.0,
        subscore_data=75.0,
        subscore_agent=75.0,
        subscore_context=75.0,
        heuristics_matched=[
            {"rule_id": "hr_destructive_fs", "severity": "HIGH", "score_contribution": 25.0},
            {"rule_id": "hr_financial_threshold", "severity": "MEDIUM", "score_contribution": 15.0},
        ],
        assessed_at=t0 + timedelta(minutes=5),
    )
    ra2 = RiskAssessment(
        organization_id=org_a.id,
        agent_id=agent.id,
        tool_id=tool.id,
        tool_version_id=version.id,
        risk_score=85,
        risk_level=RiskLevel.CRITICAL,
        subscore_tool=85.0,
        subscore_data=85.0,
        subscore_agent=85.0,
        subscore_context=85.0,
        heuristics_matched=[
            {"rule_id": "hr_destructive_fs", "severity": "HIGH", "score_contribution": 30.0},
        ],
        assessed_at=t0 + timedelta(minutes=10),
    )
    # Org B: matched heuristic that must NOT be counted for Org A
    ra_b = RiskAssessment(
        organization_id=org_b.id,
        agent_id=agent.id,
        tool_id=tool.id,
        tool_version_id=version.id,
        risk_score=90,
        risk_level=RiskLevel.CRITICAL,
        subscore_tool=90.0,
        subscore_data=90.0,
        subscore_agent=90.0,
        subscore_context=90.0,
        heuristics_matched=[
            {"rule_id": "hr_other_org", "severity": "CRITICAL", "score_contribution": 40.0},
        ],
        assessed_at=t0 + timedelta(minutes=5),
    )
    db_session.add_all([ra1, ra2, ra_b])
    await db_session.commit()

    res = await service.get_heuristic_frequency(org_a.id, t0, t0 + timedelta(days=1))
    assert res.total_matches == 3
    assert len(res.items) == 2

    top = res.items[0]
    assert top.rule_id == "hr_destructive_fs"
    assert top.count == 2
    assert top.severity == "HIGH"
    assert top.avg_score_contribution == 27.5  # (25 + 30) / 2

    second = res.items[1]
    assert second.rule_id == "hr_financial_threshold"
    assert second.count == 1


# ==============================================================================
# I. Anomaly Detection Tests
# ==============================================================================


@pytest.mark.asyncio
async def test_anomaly_detection_insufficient_samples(db_session: AsyncSession) -> None:
    """Test that anomaly detection returns INSUFFICIENT_DATA when sample floors are not met."""
    org_a, _, _, _, _, _ = await _create_base_fixtures(db_session)
    service = AnalyticsService(db_session)

    report = await service.detect_anomalies(org_a.id)
    assert len(report.findings) == 3

    for f in report.findings:
        assert f.status == AnomalyStatus.INSUFFICIENT_DATA
        assert f.severity == AnomalySeverity.INFO


@pytest.mark.asyncio
async def test_anomaly_detection_denial_rate_spike_triggered(db_session: AsyncSession) -> None:
    """Test Rule A: Denial-Rate Spike triggers when current >= 20% and >= 2.5x baseline."""
    org_a, _, _, agent, tool, version = await _create_base_fixtures(db_session)
    service = AnalyticsService(db_session)

    now = datetime(2026, 11, 8, 12, 0, 0, tzinfo=UTC)

    # 1. Baseline: 100 requests, 2 denied (2% denial rate; effective baseline = 5%)
    # 2.5 * 5% = 12.5% threshold
    for i in range(100):
        req = ToolRequest(
            organization_id=org_a.id,
            agent_id=agent.id,
            tool_id=tool.id,
            tool_version_id=version.id,
            decision=GovernanceDecision.DENY if i < 2 else GovernanceDecision.ALLOW,
            arguments={"idx": i},
            arguments_hash=f"base_h_{i}",
            evaluated_at=now - timedelta(days=2, hours=i % 24),
            evaluation_duration_ms=10.0,
        )
        db_session.add(req)

    # 2. Current: 20 requests, 6 denied (30% denial rate)
    # 30% >= 20% floor and 30% >= 12.5% threshold -> TRIGGERED!
    for i in range(20):
        req = ToolRequest(
            organization_id=org_a.id,
            agent_id=agent.id,
            tool_id=tool.id,
            tool_version_id=version.id,
            decision=GovernanceDecision.DENY if i < 6 else GovernanceDecision.ALLOW,
            arguments={"curr_idx": i},
            arguments_hash=f"curr_h_{i}",
            evaluated_at=now - timedelta(minutes=i * 2 + 1),
            evaluation_duration_ms=10.0,
        )
        db_session.add(req)

    await db_session.commit()

    report = await service.detect_anomalies(org_a.id, evaluation_time=now)
    denial_finding = next(f for f in report.findings if f.anomaly_type == AnomalyType.DENIAL_RATE_SPIKE)

    assert denial_finding.status == AnomalyStatus.TRIGGERED
    assert denial_finding.severity == AnomalySeverity.HIGH
    assert denial_finding.current_value == 0.3
    assert denial_finding.baseline_value == 0.02
    assert denial_finding.threshold == 0.05
    assert "spiked to 30.0%" in denial_finding.explanation


@pytest.mark.asyncio
async def test_anomaly_detection_zero_baseline_denial_rate(db_session: AsyncSession) -> None:
    """Test Rule A fallback to 5% effective baseline when baseline denial rate is exactly 0.0."""
    org_a, _, _, agent, tool, version = await _create_base_fixtures(db_session)
    service = AnalyticsService(db_session)

    now = datetime(2026, 11, 8, 12, 0, 0, tzinfo=UTC)

    # 1. Baseline: 100 requests, ALL allowed (0% denial rate -> effective baseline = 5%, threshold = 12.5%)
    for i in range(100):
        req = ToolRequest(
            organization_id=org_a.id,
            agent_id=agent.id,
            tool_id=tool.id,
            tool_version_id=version.id,
            decision=GovernanceDecision.ALLOW,
            arguments={"idx": i},
            arguments_hash=f"zero_base_h_{i}",
            evaluated_at=now - timedelta(days=2, hours=i % 24),
            evaluation_duration_ms=10.0,
        )
        db_session.add(req)

    # 2. Current: 20 requests, 5 denied (25% denial rate >= 20% floor and >= 12.5% threshold)
    for i in range(20):
        req = ToolRequest(
            organization_id=org_a.id,
            agent_id=agent.id,
            tool_id=tool.id,
            tool_version_id=version.id,
            decision=GovernanceDecision.DENY if i < 5 else GovernanceDecision.ALLOW,
            arguments={"curr_idx": i},
            arguments_hash=f"zero_curr_h_{i}",
            evaluated_at=now - timedelta(minutes=i * 2 + 1),
            evaluation_duration_ms=10.0,
        )
        db_session.add(req)

    await db_session.commit()

    report = await service.detect_anomalies(org_a.id, evaluation_time=now)
    denial_finding = next(f for f in report.findings if f.anomaly_type == AnomalyType.DENIAL_RATE_SPIKE)

    assert denial_finding.status == AnomalyStatus.TRIGGERED
    assert denial_finding.severity == AnomalySeverity.HIGH
    assert denial_finding.current_value == 0.25
    assert denial_finding.baseline_value == 0.05  # Effective baseline floor
    assert denial_finding.threshold == 0.125  # 2.5 * 0.05
    assert "effective baseline (5.0%)" in denial_finding.explanation


@pytest.mark.asyncio
async def test_anomaly_detection_critical_risk_surge_triggered(db_session: AsyncSession) -> None:
    """Test Rule B: Critical Risk Surge triggers when current critical rate >= 15%."""
    org_a, _, _, agent, tool, version = await _create_base_fixtures(db_session)
    service = AnalyticsService(db_session)

    now = datetime(2026, 11, 8, 12, 0, 0, tzinfo=UTC)

    # 20 risk assessments in current hour: 4 CRITICAL (20% >= 15% threshold)
    for i in range(20):
        ra = RiskAssessment(
            organization_id=org_a.id,
            agent_id=agent.id,
            tool_id=tool.id,
            tool_version_id=version.id,
            risk_score=95 if i < 4 else 20,
            risk_level=RiskLevel.CRITICAL if i < 4 else RiskLevel.LOW,
            subscore_tool=50.0,
            subscore_data=50.0,
            subscore_agent=50.0,
            subscore_context=50.0,
            assessed_at=now - timedelta(minutes=i * 2 + 1),
        )
        db_session.add(ra)
    await db_session.commit()

    report = await service.detect_anomalies(org_a.id, evaluation_time=now)
    surge_finding = next(f for f in report.findings if f.anomaly_type == AnomalyType.CRITICAL_RISK_SURGE)

    assert surge_finding.status == AnomalyStatus.TRIGGERED
    assert surge_finding.severity == AnomalySeverity.CRITICAL
    assert surge_finding.current_value == 0.2
    assert surge_finding.threshold == 0.15


@pytest.mark.asyncio
async def test_anomaly_detection_latency_sla_degradation_triggered(db_session: AsyncSession) -> None:
    """Test Rule C: Latency SLA degradation triggers when current p95 >= 50ms and >= 3x baseline p95."""
    org_a, _, _, agent, tool, version = await _create_base_fixtures(db_session)
    service = AnalyticsService(db_session)

    now = datetime(2026, 11, 8, 12, 0, 0, tzinfo=UTC)

    # Baseline: 100 requests with p95 = 15ms
    for i in range(100):
        req = ToolRequest(
            organization_id=org_a.id,
            agent_id=agent.id,
            tool_id=tool.id,
            tool_version_id=version.id,
            decision=GovernanceDecision.ALLOW,
            arguments={"idx": i},
            arguments_hash=f"base_lat_{i}",
            evaluated_at=now - timedelta(days=1, hours=i % 20),
            evaluation_duration_ms=15.0,
        )
        db_session.add(req)

    # Current: 20 requests with p95 = 60ms (>= 50ms and >= 3 * 15ms = 45ms)
    for i in range(20):
        req = ToolRequest(
            organization_id=org_a.id,
            agent_id=agent.id,
            tool_id=tool.id,
            tool_version_id=version.id,
            decision=GovernanceDecision.ALLOW,
            arguments={"curr_idx": i},
            arguments_hash=f"curr_lat_{i}",
            evaluated_at=now - timedelta(minutes=i * 2 + 1),
            evaluation_duration_ms=60.0,
        )
        db_session.add(req)

    await db_session.commit()

    report = await service.detect_anomalies(org_a.id, evaluation_time=now)
    lat_finding = next(f for f in report.findings if f.anomaly_type == AnomalyType.LATENCY_SLA_DEGRADATION)

    assert lat_finding.status == AnomalyStatus.TRIGGERED
    assert lat_finding.severity == AnomalySeverity.HIGH
    assert lat_finding.current_value == 60.0
    assert lat_finding.baseline_value == 15.0


# ==============================================================================
# J. Read-Only Guarantee Tests
# ==============================================================================


@pytest.mark.asyncio
async def test_analytics_service_strictly_read_only(db_session: AsyncSession) -> None:
    """Verify that AnalyticsService queries and anomaly evaluations perform zero mutations."""
    org_a, _, _, _, _, _ = await _create_base_fixtures(db_session)
    service = AnalyticsService(db_session)

    # Snapshot table row counts
    cnt_tool_requests = (await db_session.execute(select(func.count(ToolRequest.id)))).scalar()
    cnt_executions = (await db_session.execute(select(func.count(ToolExecution.id)))).scalar()
    cnt_approvals = (await db_session.execute(select(func.count(ApprovalRequest.id)))).scalar()
    cnt_assessments = (await db_session.execute(select(func.count(RiskAssessment.id)))).scalar()

    # Execute all analytics methods
    await service.get_overview(org_a.id)
    await service.get_trends(org_a.id)
    await service.get_risk_distribution(org_a.id)
    await service.get_agent_analytics(org_a.id)
    await service.get_tool_analytics(org_a.id)
    await service.get_latency_analytics(org_a.id)
    await service.get_heuristic_frequency(org_a.id)
    await service.detect_anomalies(org_a.id)

    # Verify identical counts afterwards
    assert (await db_session.execute(select(func.count(ToolRequest.id)))).scalar() == cnt_tool_requests
    assert (await db_session.execute(select(func.count(ToolExecution.id)))).scalar() == cnt_executions
    assert (await db_session.execute(select(func.count(ApprovalRequest.id)))).scalar() == cnt_approvals
    assert (await db_session.execute(select(func.count(RiskAssessment.id)))).scalar() == cnt_assessments
