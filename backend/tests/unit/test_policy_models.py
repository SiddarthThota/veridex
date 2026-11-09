"""Unit tests for Policy domain models (Phase 6)."""

import uuid
from datetime import UTC, datetime

from app.policies.models import (
    ConditionCombinator,
    Policy,
    PolicyAction,
    PolicyOperator,
    PolicyRule,
    PolicyStatus,
    PolicyType,
    PolicyVersion,
    PolicyVersionStatus,
)


def test_policy_enums() -> None:
    """Verify all Policy enum values are correct and predictable."""
    assert PolicyType.SECURITY == "SECURITY"
    assert PolicyType.OPERATIONAL == "OPERATIONAL"
    assert PolicyType.COMPLIANCE == "COMPLIANCE"
    assert PolicyType.FINANCIAL == "FINANCIAL"

    assert PolicyStatus.DRAFT == "DRAFT"
    assert PolicyStatus.ACTIVE == "ACTIVE"
    assert PolicyStatus.INACTIVE == "INACTIVE"
    assert PolicyStatus.ARCHIVED == "ARCHIVED"

    assert PolicyVersionStatus.DRAFT == "DRAFT"
    assert PolicyVersionStatus.PUBLISHED == "PUBLISHED"
    assert PolicyVersionStatus.RETIRED == "RETIRED"

    assert PolicyAction.ALLOW == "ALLOW"
    assert PolicyAction.DENY == "DENY"
    assert PolicyAction.REQUIRE_APPROVAL == "REQUIRE_APPROVAL"

    assert PolicyOperator.EQUALS == "EQUALS"
    assert PolicyOperator.GREATER_THAN == "GREATER_THAN"
    assert PolicyOperator.MATCHES_REGEX == "MATCHES_REGEX"

    assert ConditionCombinator.AND == "AND"
    assert ConditionCombinator.OR == "OR"
    assert ConditionCombinator.NOT == "NOT"


def test_policy_model_instantiation() -> None:
    """Verify Policy model attributes, defaults, and relationships."""
    org_id = uuid.uuid4()
    user_id = uuid.uuid4()

    policy = Policy(
        organization_id=org_id,
        created_by_user_id=user_id,
        name="Production Database Governance",
        slug="prod-db-governance",
        description="Restricts mutations on production databases",
        policy_type=PolicyType.SECURITY,
        status=PolicyStatus.DRAFT,
        priority=10,
        default_action=PolicyAction.DENY,
    )

    assert policy.organization_id == org_id
    assert policy.created_by_user_id == user_id
    assert policy.name == "Production Database Governance"
    assert policy.slug == "prod-db-governance"
    assert policy.policy_type == PolicyType.SECURITY
    assert policy.status == PolicyStatus.DRAFT
    assert policy.priority == 10
    assert policy.default_action == PolicyAction.DENY
    assert policy.current_version_id is None


def test_policy_version_model_instantiation() -> None:
    """Verify PolicyVersion model attributes and immutability attributes."""
    policy_id = uuid.uuid4()
    publisher_id = uuid.uuid4()
    now = datetime.now(UTC)

    version = PolicyVersion(
        policy_id=policy_id,
        version_number=1,
        status=PolicyVersionStatus.PUBLISHED,
        changelog="Initial baseline rules",
        published_by_user_id=publisher_id,
        published_at=now,
    )

    assert version.policy_id == policy_id
    assert version.version_number == 1
    assert version.status == PolicyVersionStatus.PUBLISHED
    assert version.changelog == "Initial baseline rules"
    assert version.published_by_user_id == publisher_id
    assert version.published_at == now


def test_policy_rule_model_instantiation() -> None:
    """Verify PolicyRule model attributes and target scope/condition representations."""
    version_id = uuid.uuid4()
    agent_id = uuid.uuid4()

    rule = PolicyRule(
        policy_version_id=version_id,
        rule_name="restrict-high-value-transfer",
        description="Requires approval for transactions > $10,000",
        rule_order=1,
        action=PolicyAction.REQUIRE_APPROVAL,
        violation_code="TRANSACTION_LIMIT_EXCEEDED",
        remediation_message="Transactions above $10,000 require human review.",
        target_scope={
            "agent_ids": [str(agent_id)],
            "agent_environments": ["PRODUCTION"],
            "tool_risk_levels": ["HIGH", "CRITICAL"],
        },
        condition_tree={
            "combinator": "AND",
            "conditions": [
                {
                    "field": "arguments.amount",
                    "operator": "GREATER_THAN",
                    "value": 10000,
                }
            ],
        },
        is_enabled=True,
    )

    assert rule.policy_version_id == version_id
    assert rule.rule_name == "restrict-high-value-transfer"
    assert rule.rule_order == 1
    assert rule.action == PolicyAction.REQUIRE_APPROVAL
    assert rule.violation_code == "TRANSACTION_LIMIT_EXCEEDED"
    assert rule.target_scope["agent_environments"] == ["PRODUCTION"]
    assert rule.condition_tree["combinator"] == "AND"
    assert rule.is_enabled is True
