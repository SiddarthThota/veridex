"""Unit tests for Phase 7 Risk Engine domain models and relationships."""

import uuid
from datetime import UTC, datetime

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.agents.models import Agent, AgentEnvironment, AgentRiskTier, AgentStatus
from app.governance.models import (
    GovernanceDecision,
    ToolRequest,
    compute_arguments_hash,
)
from app.risk.models import (
    AgentHistoryStatus,
    AgentRiskProfile,
    RiskAssessment,
    RiskConfiguration,
    RiskConfigurationVersion,
    RiskLevel,
)
from app.tools.models import (
    Tool,
    ToolStatus,
    ToolVersion,
    ToolVersionStatus,
)
from app.users.models import Organization, OrganizationStatus, Role, User, UserStatus


def test_risk_enums() -> None:
    """Verify RiskLevel and AgentHistoryStatus enum variants and strings."""
    assert RiskLevel.LOW == "LOW"
    assert RiskLevel.MEDIUM == "MEDIUM"
    assert RiskLevel.HIGH == "HIGH"
    assert RiskLevel.CRITICAL == "CRITICAL"

    assert AgentHistoryStatus.VALID == "VALID"
    assert AgentHistoryStatus.INSUFFICIENT_DATA == "INSUFFICIENT_DATA"


def test_risk_configuration_model_instantiation() -> None:
    """Verify RiskConfiguration model attributes and fields."""
    org_id = uuid.uuid4()
    version_id = uuid.uuid4()

    config = RiskConfiguration(
        organization_id=org_id,
        current_version_id=version_id,
        is_active=True,
    )

    assert config.organization_id == org_id
    assert config.current_version_id == version_id
    assert config.is_active is True


def test_risk_configuration_version_instantiation() -> None:
    """Verify RiskConfigurationVersion explicit attribute instantiation."""
    config_id = uuid.uuid4()
    user_id = uuid.uuid4()

    version = RiskConfigurationVersion(
        risk_configuration_id=config_id,
        version_number=1,
        weight_tool=0.35,
        weight_data=0.25,
        weight_agent=0.20,
        weight_context=0.20,
        threshold_medium=30,
        threshold_high=60,
        threshold_critical=85,
        approval_threshold=60,
        deny_threshold=90,
        heuristic_rules=[],
        scoring_algorithm_version="1.0.0",
        created_by_user_id=user_id,
        changelog="Default organization risk weights",
    )

    assert version.risk_configuration_id == config_id
    assert version.version_number == 1
    assert version.scoring_algorithm_version == "1.0.0"
    assert version.changelog == "Default organization risk weights"
    assert version.created_by_user_id == user_id

    # 4-Vector weights sum to 1.0
    assert version.weight_tool == 0.35
    assert version.weight_data == 0.25
    assert version.weight_agent == 0.20
    assert version.weight_context == 0.20
    assert (
        round(
            version.weight_tool + version.weight_data + version.weight_agent + version.weight_context,
            2,
        )
        == 1.00
    )

    # Threshold boundaries
    assert version.threshold_medium == 30
    assert version.threshold_high == 60
    assert version.threshold_critical == 85

    # Action triggers
    assert version.approval_threshold == 60
    assert version.deny_threshold == 90
    assert version.heuristic_rules == []


def test_agent_risk_profile_model_instantiation() -> None:
    """Verify AgentRiskProfile model attribute instantiation."""
    org_id = uuid.uuid4()
    agent_id = uuid.uuid4()

    profile = AgentRiskProfile(
        organization_id=org_id,
        agent_id=agent_id,
        calculated_trust_score=100.0,
        total_eligible_invocations=0,
        total_violations=0,
        violation_rate=0.0,
        history_status=AgentHistoryStatus.INSUFFICIENT_DATA,
        observation_window_days=7,
    )

    assert profile.organization_id == org_id
    assert profile.agent_id == agent_id
    assert profile.calculated_trust_score == 100.0
    assert profile.total_eligible_invocations == 0
    assert profile.total_violations == 0
    assert profile.violation_rate == 0.0
    assert profile.history_status == AgentHistoryStatus.INSUFFICIENT_DATA
    assert profile.observation_window_days == 7
    assert profile.last_assessed_at is None


def test_risk_assessment_model_instantiation() -> None:
    """Verify RiskAssessment model attributes and breakdown vectors."""
    org_id = uuid.uuid4()
    agent_id = uuid.uuid4()
    tool_id = uuid.uuid4()
    tool_version_id = uuid.uuid4()
    req_id = uuid.uuid4()
    config_v_id = uuid.uuid4()
    now = datetime.now(UTC)

    factor_breakdown = {
        "tool": {"subscore": 75.0, "weight": 0.35, "weighted_contribution": 26.25},
        "data": {"subscore": 80.0, "weight": 0.25, "weighted_contribution": 20.0},
        "agent": {"subscore": 40.0, "weight": 0.20, "weighted_contribution": 8.0},
        "context": {"subscore": 50.0, "weight": 0.20, "weighted_contribution": 10.0},
    }

    assessment = RiskAssessment(
        organization_id=org_id,
        tool_request_id=req_id,
        agent_id=agent_id,
        tool_id=tool_id,
        tool_version_id=tool_version_id,
        config_version_id=config_v_id,
        scoring_algorithm_version="1.0.0",
        risk_score=64,
        risk_level=RiskLevel.HIGH,
        subscore_tool=75.0,
        subscore_data=80.0,
        subscore_agent=40.0,
        subscore_context=50.0,
        factor_breakdown=factor_breakdown,
        heuristics_matched=[
            {
                "rule_name": "bulk_export_restriction",
                "matched_path": "arguments.export_all",
                "added_penalty": 30.0,
            }
        ],
        config_snapshot={"weight_tool": 0.35, "approval_threshold": 60},
        explanation="High-risk tool combined with confidential data classification.",
        assessed_at=now,
    )

    assert assessment.organization_id == org_id
    assert assessment.tool_request_id == req_id
    assert assessment.risk_score == 64
    assert assessment.risk_level == RiskLevel.HIGH
    assert assessment.subscore_tool == 75.0
    assert assessment.heuristics_matched[0]["rule_name"] == "bulk_export_restriction"
    assert assessment.config_snapshot["approval_threshold"] == 60
    assert assessment.assessed_at == now


def test_tool_request_risk_assessment_id_field() -> None:
    """Verify ToolRequest model accepts nullable risk_assessment_id."""
    tool_version_id = uuid.uuid4()
    assessment_id = uuid.uuid4()
    args = {"limit": 100}

    req = ToolRequest(
        organization_id=uuid.uuid4(),
        agent_id=uuid.uuid4(),
        tool_id=uuid.uuid4(),
        tool_version_id=tool_version_id,
        decision=GovernanceDecision.ALLOW,
        arguments=args,
        arguments_hash=compute_arguments_hash(tool_version_id, args),
        violation_codes=[],
        environment="PRODUCTION",
        risk_assessment_id=assessment_id,
    )

    assert req.risk_assessment_id == assessment_id
    assert req.risk_assessment is None


@pytest.mark.asyncio
async def test_risk_configuration_db_lifecycle(db_session: AsyncSession) -> None:
    """Verify persisting RiskConfiguration and version lineage in database."""
    uid = uuid.uuid4()
    org = Organization(name=f"Risk Org {uid}", slug=f"risk-org-{uid}", status=OrganizationStatus.ACTIVE)
    db_session.add(org)
    await db_session.commit()
    await db_session.refresh(org)

    config = RiskConfiguration(organization_id=org.id, is_active=True)
    db_session.add(config)
    await db_session.commit()
    await db_session.refresh(config)

    v1 = RiskConfigurationVersion(
        risk_configuration_id=config.id,
        version_number=1,
        weight_tool=0.40,
        weight_data=0.20,
        weight_agent=0.20,
        weight_context=0.20,
        approval_threshold=55,
        deny_threshold=85,
        changelog="Initial v1 tuning",
    )
    db_session.add(v1)
    await db_session.commit()
    await db_session.refresh(v1)

    # Set as current version
    config.current_version_id = v1.id
    await db_session.commit()
    await db_session.refresh(config)

    # Add v2
    v2 = RiskConfigurationVersion(
        risk_configuration_id=config.id,
        version_number=2,
        weight_tool=0.30,
        weight_data=0.30,
        weight_agent=0.20,
        weight_context=0.20,
        changelog="v2 adjusted weights",
    )
    db_session.add(v2)
    await db_session.commit()

    # Query back configuration
    stmt = select(RiskConfiguration).where(RiskConfiguration.id == config.id)
    result = await db_session.execute(stmt)
    fetched_config = result.scalar_one()

    assert fetched_config is not None
    assert fetched_config.current_version_id == v1.id

    # Query versions
    stmt_v = (
        select(RiskConfigurationVersion)
        .where(RiskConfigurationVersion.risk_configuration_id == config.id)
        .order_by(RiskConfigurationVersion.version_number)
    )
    result_v = await db_session.execute(stmt_v)
    versions = result_v.scalars().all()

    assert len(versions) == 2
    assert versions[0].version_number == 1
    assert versions[0].approval_threshold == 55
    assert versions[1].version_number == 2


@pytest.mark.asyncio
async def test_risk_configuration_version_db_defaults(db_session: AsyncSession) -> None:
    """Verify RiskConfigurationVersion column defaults when persisted to database."""
    uid = uuid.uuid4()
    org = Organization(name=f"Risk Def Org {uid}", slug=f"risk-def-org-{uid}")
    db_session.add(org)
    await db_session.commit()
    await db_session.refresh(org)

    config = RiskConfiguration(organization_id=org.id)
    db_session.add(config)
    await db_session.commit()
    await db_session.refresh(config)

    # Persist version with default column values
    v_def = RiskConfigurationVersion(risk_configuration_id=config.id)
    db_session.add(v_def)
    await db_session.commit()
    await db_session.refresh(v_def)

    assert v_def.version_number == 1
    assert v_def.scoring_algorithm_version == "1.0.0"
    assert v_def.weight_tool == 0.35
    assert v_def.weight_data == 0.25
    assert v_def.weight_agent == 0.20
    assert v_def.weight_context == 0.20
    assert v_def.threshold_medium == 30
    assert v_def.threshold_high == 60
    assert v_def.threshold_critical == 85
    assert v_def.approval_threshold == 60
    assert v_def.deny_threshold == 90
    assert v_def.heuristic_rules == []


@pytest.mark.asyncio
async def test_agent_risk_profile_db_persistence(db_session: AsyncSession) -> None:
    """Verify persisting and querying AgentRiskProfile."""
    uid = uuid.uuid4()
    org = Organization(name=f"Risk Org Profile {uid}", slug=f"risk-org-profile-{uid}")
    db_session.add(org)
    await db_session.commit()
    await db_session.refresh(org)

    user = User(
        organization_id=org.id,
        email=f"owner-{uid}@example.com",
        password_hash="fake-hash",
        display_name="Agent Owner",
        status=UserStatus.ACTIVE,
        role=Role.ADMIN,
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)

    agent = Agent(
        organization_id=org.id,
        owner_user_id=user.id,
        name=f"Profile Agent {uid}",
        slug=f"profile-agent-{uid}",
        model_provider="anthropic",
        model_name="claude-3-5-sonnet",
        status=AgentStatus.ACTIVE,
        environment=AgentEnvironment.PRODUCTION,
        risk_tier=AgentRiskTier.MEDIUM,
    )
    db_session.add(agent)
    await db_session.commit()
    await db_session.refresh(agent)

    # Test minimal profile default persistence
    profile_default = AgentRiskProfile(
        organization_id=org.id,
        agent_id=agent.id,
    )
    db_session.add(profile_default)
    await db_session.commit()
    await db_session.refresh(profile_default)

    assert profile_default.calculated_trust_score == 100.0
    assert profile_default.total_eligible_invocations == 0
    assert profile_default.total_violations == 0
    assert profile_default.violation_rate == 0.0
    assert profile_default.history_status == AgentHistoryStatus.INSUFFICIENT_DATA
    assert profile_default.observation_window_days == 7

    # Update profile to validated metrics
    profile_default.calculated_trust_score = 85.5
    profile_default.total_eligible_invocations = 40
    profile_default.total_violations = 2
    profile_default.violation_rate = 0.05
    profile_default.history_status = AgentHistoryStatus.VALID
    profile_default.last_assessed_at = datetime.now(UTC)
    await db_session.commit()
    await db_session.refresh(profile_default)

    stmt = select(AgentRiskProfile).where(AgentRiskProfile.agent_id == agent.id)
    res = await db_session.execute(stmt)
    fetched = res.scalar_one_or_none()

    assert fetched is not None
    assert fetched.calculated_trust_score == 85.5
    assert fetched.total_violations == 2
    assert fetched.history_status == AgentHistoryStatus.VALID


@pytest.mark.asyncio
async def test_risk_assessment_tool_request_relationship(db_session: AsyncSession) -> None:
    """Verify bidirectional link between ToolRequest and RiskAssessment in database."""
    uid = uuid.uuid4()
    org = Organization(name=f"Risk Flow {uid}", slug=f"risk-flow-{uid}")
    db_session.add(org)
    await db_session.commit()
    await db_session.refresh(org)

    user = User(
        organization_id=org.id,
        email=f"user-{uid}@example.com",
        password_hash="fake-hash",
        display_name="Test User",
        status=UserStatus.ACTIVE,
        role=Role.ADMIN,
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)

    agent = Agent(
        organization_id=org.id,
        owner_user_id=user.id,
        name=f"Agent Flow {uid}",
        slug=f"agent-flow-{uid}",
        model_provider="anthropic",
        model_name="claude-3-5-sonnet",
        status=AgentStatus.ACTIVE,
    )
    db_session.add(agent)

    tool = Tool(
        organization_id=org.id,
        owner_user_id=user.id,
        name="DB Query Tool",
        slug=f"db-query-{uid}",
        status=ToolStatus.ACTIVE,
    )
    db_session.add(tool)
    await db_session.commit()
    await db_session.refresh(agent)
    await db_session.refresh(tool)

    tool_version = ToolVersion(
        tool_id=tool.id,
        version="1.0.0",
        status=ToolVersionStatus.PUBLISHED,
        created_by=user.id,
        input_schema={"type": "object"},
    )
    db_session.add(tool_version)
    await db_session.commit()
    await db_session.refresh(tool_version)

    # 1. Create ToolRequest
    args = {"query": "SELECT count(*) FROM orders"}
    req = ToolRequest(
        organization_id=org.id,
        agent_id=agent.id,
        tool_id=tool.id,
        tool_version_id=tool_version.id,
        decision=GovernanceDecision.ALLOW,
        arguments=args,
        arguments_hash=compute_arguments_hash(tool_version.id, args),
        violation_codes=[],
        environment="PRODUCTION",
        evaluated_at=datetime.now(UTC),
    )
    db_session.add(req)
    await db_session.commit()
    await db_session.refresh(req)

    # 2. Create RiskAssessment referencing ToolRequest
    assessment = RiskAssessment(
        organization_id=org.id,
        tool_request_id=req.id,
        agent_id=agent.id,
        tool_id=tool.id,
        tool_version_id=tool_version.id,
        risk_score=15,
        risk_level=RiskLevel.LOW,
        subscore_tool=10.0,
        subscore_data=20.0,
        subscore_agent=10.0,
        subscore_context=20.0,
        factor_breakdown={},
        heuristics_matched=[],
        config_snapshot={},
        explanation="Low risk read query.",
        assessed_at=datetime.now(UTC),
    )
    db_session.add(assessment)
    await db_session.commit()
    await db_session.refresh(assessment)

    # 3. Link back ToolRequest.risk_assessment_id
    req.risk_assessment_id = assessment.id
    await db_session.commit()
    await db_session.refresh(req)

    # Verify relationships
    stmt = select(ToolRequest).where(ToolRequest.id == req.id)
    res = await db_session.execute(stmt)
    loaded_req = res.scalar_one()

    assert loaded_req.risk_assessment_id == assessment.id

    stmt_a = select(RiskAssessment).where(RiskAssessment.id == assessment.id)
    res_a = await db_session.execute(stmt_a)
    loaded_a = res_a.scalar_one()

    assert loaded_a.tool_request_id == req.id
    assert loaded_a.risk_level == RiskLevel.LOW
    assert loaded_a.risk_score == 15
