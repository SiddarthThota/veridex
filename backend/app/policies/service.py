"""Policy Engine service implementing declarative governance, version immutability,
scoping, and deterministic conflict resolution (Phase 6).
"""

import re
import uuid
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.agents.models import Agent
from app.policies.evaluator import (
    build_evaluation_context,
    evaluate_condition_tree,
    validate_condition_tree,
)
from app.policies.models import (
    Policy,
    PolicyAction,
    PolicyRule,
    PolicyStatus,
    PolicyType,
    PolicyVersion,
    PolicyVersionStatus,
)
from app.policies.schemas import (
    MatchedPolicyTrace,
    MatchedRuleTrace,
    PolicyCreate,
    PolicyRuleCreate,
    PolicyRuleUpdate,
    PolicySimulateRequest,
    PolicySimulateResponse,
    PolicyUpdate,
)
from app.tools.models import Tool, ToolVersion


def _slugify(name: str) -> str:
    """Generate a URL-safe lowercase slug from a name."""
    slug = re.sub(r"[^a-zA-Z0-9]+", "-", name.strip().lower()).strip("-")
    return slug or "policy"


class PolicyService:
    """Core domain service for policy authoring, lifecycle transitions, and evaluation."""

    # --- Policy CRUD & Lifecycle ---

    async def create_policy(
        self,
        db: AsyncSession,
        organization_id: uuid.UUID,
        user_id: uuid.UUID,
        payload: PolicyCreate,
    ) -> Policy:
        """Create a new Policy container with an initial DRAFT v1 version."""
        slug = payload.slug or _slugify(payload.name)

        # Check unique slug per organization
        existing_query = select(Policy).where(
            Policy.organization_id == organization_id,
            Policy.slug == slug,
        )
        existing = (await db.execute(existing_query)).scalar_one_or_none()
        if existing:
            raise ValueError(f"Policy with slug '{slug}' already exists in this organization")

        policy = Policy(
            organization_id=organization_id,
            created_by_user_id=user_id,
            name=payload.name,
            slug=slug,
            description=payload.description,
            policy_type=payload.policy_type,
            status=PolicyStatus.DRAFT,
            priority=payload.priority,
            default_action=payload.default_action,
        )
        db.add(policy)
        await db.flush()

        # Create initial v1 DRAFT version
        version = PolicyVersion(
            policy_id=policy.id,
            version_number=1,
            status=PolicyVersionStatus.DRAFT,
            changelog="Initial draft version",
        )
        db.add(version)
        await db.flush()

        # Attach initial rules if provided
        for rule_in in payload.initial_rules:
            validate_condition_tree(rule_in.condition_tree)
            rule = PolicyRule(
                policy_version_id=version.id,
                rule_name=rule_in.rule_name,
                description=rule_in.description,
                rule_order=rule_in.rule_order,
                action=rule_in.action,
                violation_code=rule_in.violation_code,
                remediation_message=rule_in.remediation_message,
                target_scope=rule_in.target_scope.model_dump(),
                condition_tree=rule_in.condition_tree,
                is_enabled=rule_in.is_enabled,
            )
            db.add(rule)

        await db.commit()
        return await self.get_policy(db, organization_id, policy.id)  # type: ignore[return-value]

    async def get_policy(
        self,
        db: AsyncSession,
        organization_id: uuid.UUID,
        policy_id: uuid.UUID,
    ) -> Policy | None:
        """Retrieve a Policy by ID strictly scoped to organization."""
        query = (
            select(Policy)
            .where(
                Policy.id == policy_id,
                Policy.organization_id == organization_id,
            )
            .options(
                selectinload(Policy.current_version).selectinload(PolicyVersion.rules),
                selectinload(Policy.versions),
            )
        )
        return (await db.execute(query)).scalar_one_or_none()

    async def get_policy_by_slug(
        self,
        db: AsyncSession,
        organization_id: uuid.UUID,
        slug: str,
    ) -> Policy | None:
        """Retrieve a Policy by slug strictly scoped to organization."""
        query = (
            select(Policy)
            .where(
                Policy.organization_id == organization_id,
                Policy.slug == slug,
            )
            .options(
                selectinload(Policy.current_version).selectinload(PolicyVersion.rules),
                selectinload(Policy.versions),
            )
        )
        return (await db.execute(query)).scalar_one_or_none()

    async def list_policies(
        self,
        db: AsyncSession,
        organization_id: uuid.UUID,
        policy_type: PolicyType | None = None,
        status: PolicyStatus | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> tuple[list[Policy], int]:
        """List policies with pagination and filtering."""
        base_filter = [Policy.organization_id == organization_id]
        if policy_type is not None:
            base_filter.append(Policy.policy_type == policy_type)
        if status is not None:
            base_filter.append(Policy.status == status)

        count_query = select(func.count(Policy.id)).where(*base_filter)
        total = (await db.execute(count_query)).scalar_one()

        query = (
            select(Policy)
            .where(*base_filter)
            .order_by(Policy.priority.asc(), Policy.created_at.desc())
            .limit(limit)
            .offset(offset)
            .options(
                selectinload(Policy.current_version).selectinload(PolicyVersion.rules),
            )
        )
        items = list((await db.execute(query)).scalars().all())
        return items, total

    async def update_policy(
        self,
        db: AsyncSession,
        organization_id: uuid.UUID,
        policy_id: uuid.UUID,
        payload: PolicyUpdate,
    ) -> Policy | None:
        """Update policy container metadata and priority."""
        policy = await self.get_policy(db, organization_id, policy_id)
        if not policy:
            return None

        if policy.status == PolicyStatus.ARCHIVED:
            raise ValueError("Cannot update an archived policy")

        if payload.name is not None:
            policy.name = payload.name
        if payload.description is not None:
            policy.description = payload.description
        if payload.policy_type is not None:
            policy.policy_type = payload.policy_type
        if payload.priority is not None:
            policy.priority = payload.priority
        if payload.default_action is not None:
            policy.default_action = payload.default_action

        await db.commit()
        return await self.get_policy(db, organization_id, policy_id)

    async def update_policy_status(
        self,
        db: AsyncSession,
        organization_id: uuid.UUID,
        policy_id: uuid.UUID,
        new_status: PolicyStatus,
    ) -> Policy | None:
        """Transition lifecycle status of a Policy container."""
        policy = await self.get_policy(db, organization_id, policy_id)
        if not policy:
            return None

        if policy.status == PolicyStatus.ARCHIVED and new_status != PolicyStatus.ARCHIVED:
            raise ValueError("Archived policies cannot be transitioned to another state")

        if new_status == PolicyStatus.ACTIVE and not policy.current_version_id:
            raise ValueError("Cannot activate a policy without a published version")

        policy.status = new_status
        await db.commit()
        return await self.get_policy(db, organization_id, policy_id)

    # --- Policy Versioning & Immutability ---

    async def create_policy_version(
        self,
        db: AsyncSession,
        organization_id: uuid.UUID,
        policy_id: uuid.UUID,
        user_id: uuid.UUID,
        changelog: str | None = None,
    ) -> PolicyVersion:
        """Branch a new DRAFT version from the policy, cloning rules from current version if exists."""
        policy = await self.get_policy(db, organization_id, policy_id)
        if not policy:
            raise ValueError(f"Policy '{policy_id}' not found")

        if policy.status == PolicyStatus.ARCHIVED:
            raise ValueError("Cannot branch versions for an archived policy")

        # Determine next version number
        num_query = select(func.coalesce(func.max(PolicyVersion.version_number), 0)).where(
            PolicyVersion.policy_id == policy.id
        )
        max_num = (await db.execute(num_query)).scalar_one()
        next_version_num = max_num + 1

        new_version = PolicyVersion(
            policy_id=policy.id,
            version_number=next_version_num,
            status=PolicyVersionStatus.DRAFT,
            changelog=changelog,
        )
        db.add(new_version)
        await db.flush()

        # Clone rules from current version if available
        if policy.current_version and policy.current_version.rules:
            for rule in policy.current_version.rules:
                cloned_rule = PolicyRule(
                    policy_version_id=new_version.id,
                    rule_name=rule.rule_name,
                    description=rule.description,
                    rule_order=rule.rule_order,
                    action=rule.action,
                    violation_code=rule.violation_code,
                    remediation_message=rule.remediation_message,
                    target_scope=dict(rule.target_scope),
                    condition_tree=dict(rule.condition_tree),
                    is_enabled=rule.is_enabled,
                )
                db.add(cloned_rule)

        await db.commit()
        return await self.get_policy_version(db, organization_id, policy.id, new_version.id)  # type: ignore[return-value]

    async def get_policy_version(
        self,
        db: AsyncSession,
        organization_id: uuid.UUID,
        policy_id: uuid.UUID,
        version_id: uuid.UUID,
    ) -> PolicyVersion | None:
        """Retrieve a specific PolicyVersion strictly scoped to policy and organization."""
        query = (
            select(PolicyVersion)
            .join(Policy, Policy.id == PolicyVersion.policy_id)
            .where(
                PolicyVersion.id == version_id,
                PolicyVersion.policy_id == policy_id,
                Policy.organization_id == organization_id,
            )
            .options(selectinload(PolicyVersion.rules))
        )
        return (await db.execute(query)).scalar_one_or_none()

    async def list_policy_versions(
        self,
        db: AsyncSession,
        organization_id: uuid.UUID,
        policy_id: uuid.UUID,
    ) -> list[PolicyVersion]:
        """List all historical versions of a policy."""
        policy = await self.get_policy(db, organization_id, policy_id)
        if not policy:
            raise ValueError(f"Policy '{policy_id}' not found")

        query = (
            select(PolicyVersion)
            .where(PolicyVersion.policy_id == policy_id)
            .order_by(PolicyVersion.version_number.desc())
            .options(selectinload(PolicyVersion.rules))
        )
        return list((await db.execute(query)).scalars().all())

    async def publish_policy_version(
        self,
        db: AsyncSession,
        organization_id: uuid.UUID,
        policy_id: uuid.UUID,
        version_id: uuid.UUID,
        user_id: uuid.UUID,
    ) -> PolicyVersion:
        """Publish a DRAFT version: validate all rules, freeze as PUBLISHED, and activate atomically."""
        version = await self.get_policy_version(db, organization_id, policy_id, version_id)
        if not version:
            raise ValueError(f"PolicyVersion '{version_id}' not found")

        if version.status == PolicyVersionStatus.PUBLISHED:
            return version

        if version.status == PolicyVersionStatus.RETIRED:
            raise ValueError("Cannot publish a RETIRED policy version")

        # Validate all rule ASTs before publishing
        for rule in version.rules:
            validate_condition_tree(rule.condition_tree)

        # Retire previously published versions for this policy
        retire_stmt = select(PolicyVersion).where(
            PolicyVersion.policy_id == policy_id,
            PolicyVersion.status == PolicyVersionStatus.PUBLISHED,
            PolicyVersion.id != version.id,
        )
        prev_published = (await db.execute(retire_stmt)).scalars().all()
        for p in prev_published:
            p.status = PolicyVersionStatus.RETIRED

        # Freeze this version
        version.status = PolicyVersionStatus.PUBLISHED
        version.published_by_user_id = user_id
        version.published_at = datetime.now(UTC)

        # Atomically update policy current_version_id
        policy = await self.get_policy(db, organization_id, policy_id)
        assert policy is not None
        policy.current_version_id = version.id
        if policy.status == PolicyStatus.DRAFT:
            policy.status = PolicyStatus.ACTIVE

        await db.commit()
        return await self.get_policy_version(db, organization_id, policy_id, version_id)  # type: ignore[return-value]

    # --- Rule Management (Allowed ONLY on DRAFT Versions) ---

    async def create_policy_rule(
        self,
        db: AsyncSession,
        organization_id: uuid.UUID,
        policy_id: uuid.UUID,
        version_id: uuid.UUID,
        payload: PolicyRuleCreate,
    ) -> PolicyRule:
        """Add a rule to a DRAFT policy version. Fails with ValueError if version is published."""
        version = await self.get_policy_version(db, organization_id, policy_id, version_id)
        if not version:
            raise ValueError(f"PolicyVersion '{version_id}' not found")

        if version.status != PolicyVersionStatus.DRAFT:
            raise ValueError("Published policy versions are immutable; rules cannot be added")

        validate_condition_tree(payload.condition_tree)

        rule = PolicyRule(
            policy_version_id=version.id,
            rule_name=payload.rule_name,
            description=payload.description,
            rule_order=payload.rule_order,
            action=payload.action,
            violation_code=payload.violation_code,
            remediation_message=payload.remediation_message,
            target_scope=payload.target_scope.model_dump(),
            condition_tree=payload.condition_tree,
            is_enabled=payload.is_enabled,
        )
        db.add(rule)
        await db.commit()
        await db.refresh(rule)
        return rule

    async def update_policy_rule(
        self,
        db: AsyncSession,
        organization_id: uuid.UUID,
        policy_id: uuid.UUID,
        version_id: uuid.UUID,
        rule_id: uuid.UUID,
        payload: PolicyRuleUpdate,
    ) -> PolicyRule:
        """Update a rule in a DRAFT version. Fails with ValueError if version is published."""
        version = await self.get_policy_version(db, organization_id, policy_id, version_id)
        if not version:
            raise ValueError(f"PolicyVersion '{version_id}' not found")

        if version.status != PolicyVersionStatus.DRAFT:
            raise ValueError("Published policy versions are immutable; rules cannot be modified")

        rule_query = select(PolicyRule).where(
            PolicyRule.id == rule_id,
            PolicyRule.policy_version_id == version.id,
        )
        rule = (await db.execute(rule_query)).scalar_one_or_none()
        if not rule:
            raise ValueError(f"PolicyRule '{rule_id}' not found")

        if payload.condition_tree is not None:
            validate_condition_tree(payload.condition_tree)
            rule.condition_tree = payload.condition_tree

        if payload.rule_name is not None:
            rule.rule_name = payload.rule_name
        if payload.description is not None:
            rule.description = payload.description
        if payload.rule_order is not None:
            rule.rule_order = payload.rule_order
        if payload.action is not None:
            rule.action = payload.action
        if payload.violation_code is not None:
            rule.violation_code = payload.violation_code
        if payload.remediation_message is not None:
            rule.remediation_message = payload.remediation_message
        if payload.target_scope is not None:
            rule.target_scope = payload.target_scope.model_dump()
        if payload.is_enabled is not None:
            rule.is_enabled = payload.is_enabled

        await db.commit()
        await db.refresh(rule)
        return rule

    async def delete_policy_rule(
        self,
        db: AsyncSession,
        organization_id: uuid.UUID,
        policy_id: uuid.UUID,
        version_id: uuid.UUID,
        rule_id: uuid.UUID,
    ) -> None:
        """Delete a rule from a DRAFT version. Fails with ValueError if version is published."""
        version = await self.get_policy_version(db, organization_id, policy_id, version_id)
        if not version:
            raise ValueError(f"PolicyVersion '{version_id}' not found")

        if version.status != PolicyVersionStatus.DRAFT:
            raise ValueError("Published policy versions are immutable; rules cannot be deleted")

        rule_query = select(PolicyRule).where(
            PolicyRule.id == rule_id,
            PolicyRule.policy_version_id == version.id,
        )
        rule = (await db.execute(rule_query)).scalar_one_or_none()
        if not rule:
            raise ValueError(f"PolicyRule '{rule_id}' not found")

        await db.delete(rule)
        await db.commit()

    # --- Policy Evaluation Engine ---

    def match_target_scope(
        self,
        target_scope: dict[str, Any],
        agent: Agent,
        tool: Tool,
        run_environment: str = "DEVELOPMENT",
    ) -> bool:
        """Evaluate if an invocation matches a rule's target scoping dimensions."""
        if not target_scope:
            return True

        agent_ids = target_scope.get("agent_ids")
        if agent_ids and str(agent.id) not in agent_ids:
            return False

        agent_envs = target_scope.get("agent_environments")
        if agent_envs and str(agent.environment) not in agent_envs:
            return False

        agent_risks = target_scope.get("agent_risk_tiers")
        if agent_risks and str(agent.risk_tier) not in agent_risks:
            return False

        tool_ids = target_scope.get("tool_ids")
        if tool_ids and str(tool.id) not in tool_ids:
            return False

        tool_risks = target_scope.get("tool_risk_levels")
        if tool_risks and str(tool.risk_level) not in tool_risks:
            return False

        tool_access = target_scope.get("tool_access_types")
        if tool_access and str(tool.access_type) not in tool_access:
            return False

        tool_data = target_scope.get("tool_data_classifications")
        return not (tool_data and str(tool.data_classification) not in tool_data)

    async def evaluate_policies(
        self,
        db: AsyncSession,
        organization_id: uuid.UUID,
        agent: Agent,
        tool: Tool,
        tool_version: ToolVersion,
        arguments: dict[str, Any],
        run_environment: str = "DEVELOPMENT",
    ) -> tuple[
        PolicyAction,
        list[str],
        list[str],
        list[dict[str, Any]],
    ]:
        """Evaluate all active organization policies against a tool invocation.

        Implements strict decision precedence:
        1. If ANY matching rule evaluates to DENY -> final decision is DENY.
        2. Else if ANY matching rule evaluates to REQUIRE_APPROVAL -> decision is REQUIRE_APPROVAL.
        3. Else if ANY matching rule evaluates to ALLOW -> decision is ALLOW.
        4. If no rules match -> returns ALLOW (baseline checks will act as safety net).
        """
        # Fetch active policies ordered by priority ASC (1 is evaluated before 100)
        query = (
            select(Policy)
            .where(
                Policy.organization_id == organization_id,
                Policy.status == PolicyStatus.ACTIVE,
                Policy.current_version_id.is_not(None),
            )
            .order_by(Policy.priority.asc(), Policy.created_at.asc())
            .options(
                selectinload(Policy.current_version).selectinload(PolicyVersion.rules),
            )
        )
        active_policies = list((await db.execute(query)).scalars().all())

        context = build_evaluation_context(
            arguments=arguments,
            agent=agent,
            tool=tool,
            tool_version=tool_version,
            run_environment=run_environment,
        )

        matched_policies_trace: list[dict[str, Any]] = []
        deny_violations: list[str] = []
        deny_remediations: list[str] = []
        approval_violations: list[str] = []
        approval_remediations: list[str] = []
        allow_matched = False

        for policy in active_policies:
            version = policy.current_version
            if not version or version.status != PolicyVersionStatus.PUBLISHED:
                continue

            policy_matched_rules: list[dict[str, Any]] = []

            for rule in version.rules:
                if not rule.is_enabled:
                    continue

                if not self.match_target_scope(rule.target_scope, agent, tool, run_environment):
                    continue

                # Evaluate AST conditions
                if evaluate_condition_tree(rule.condition_tree, context):
                    rule_trace = {
                        "rule_id": str(rule.id),
                        "rule_name": rule.rule_name,
                        "action": rule.action.value,
                        "violation_code": rule.violation_code,
                        "remediation_message": rule.remediation_message,
                    }
                    policy_matched_rules.append(rule_trace)

                    if rule.action == PolicyAction.DENY:
                        deny_violations.append(rule.violation_code)
                        if rule.remediation_message:
                            deny_remediations.append(rule.remediation_message)
                    elif rule.action == PolicyAction.REQUIRE_APPROVAL:
                        approval_violations.append(rule.violation_code)
                        if rule.remediation_message:
                            approval_remediations.append(rule.remediation_message)
                    elif rule.action == PolicyAction.ALLOW:
                        allow_matched = True

            if policy_matched_rules:
                matched_policies_trace.append(
                    {
                        "policy_id": str(policy.id),
                        "policy_slug": policy.slug,
                        "policy_version_id": str(version.id),
                        "version_number": version.version_number,
                        "matched_rules": policy_matched_rules,
                    }
                )

        # Precedence 1: DENY always wins
        if deny_violations:
            return (
                PolicyAction.DENY,
                deny_violations,
                deny_remediations,
                matched_policies_trace,
            )

        # Precedence 2: REQUIRE_APPROVAL wins over ALLOW
        if approval_violations:
            return (
                PolicyAction.REQUIRE_APPROVAL,
                approval_violations,
                approval_remediations,
                matched_policies_trace,
            )

        # Precedence 3: ALLOW
        if allow_matched:
            return (
                PolicyAction.ALLOW,
                [],
                [],
                matched_policies_trace,
            )

        # No matching rule: default allow (Gateway Tier 3 baseline will enforce fallback)
        return (
            PolicyAction.ALLOW,
            [],
            [],
            matched_policies_trace,
        )

    # --- Simulation Endpoint Service ---

    async def simulate(
        self,
        db: AsyncSession,
        organization_id: uuid.UUID,
        request: PolicySimulateRequest,
    ) -> PolicySimulateResponse:
        """Simulate policy evaluation against a hypothetical invocation without side effects."""
        agent_query = select(Agent).where(
            Agent.id == request.agent_id,
            Agent.organization_id == organization_id,
        )
        agent = (await db.execute(agent_query)).scalar_one_or_none()
        if not agent:
            raise ValueError(f"Agent '{request.agent_id}' not found in organization")

        tool_query = select(Tool).where(
            Tool.id == request.tool_id,
            Tool.organization_id == organization_id,
        )
        tool = (await db.execute(tool_query)).scalar_one_or_none()
        if not tool:
            raise ValueError(f"Tool '{request.tool_id}' not found in organization")

        version_query = select(ToolVersion).where(
            ToolVersion.id == request.tool_version_id,
            ToolVersion.tool_id == tool.id,
        )
        tool_version = (await db.execute(version_query)).scalar_one_or_none()
        if not tool_version:
            raise ValueError(f"ToolVersion '{request.tool_version_id}' not found for tool '{tool.id}'")

        decision, violations, remediations, traces = await self.evaluate_policies(
            db=db,
            organization_id=organization_id,
            agent=agent,
            tool=tool,
            tool_version=tool_version,
            arguments=request.arguments,
            run_environment=request.environment,
        )

        matched_traces: list[MatchedPolicyTrace] = []
        for p in traces:
            matched_rules = [
                MatchedRuleTrace(
                    rule_id=uuid.UUID(r["rule_id"]),
                    rule_name=r["rule_name"],
                    action=PolicyAction(r["action"]),
                    violation_code=r["violation_code"],
                    remediation_message=r["remediation_message"],
                )
                for r in p["matched_rules"]
            ]
            matched_traces.append(
                MatchedPolicyTrace(
                    policy_id=uuid.UUID(p["policy_id"]),
                    policy_slug=p["policy_slug"],
                    policy_version_id=uuid.UUID(p["policy_version_id"]),
                    version_number=p["version_number"],
                    matched_rules=matched_rules,
                )
            )

        return PolicySimulateResponse(
            decision=decision,
            violation_codes=violations,
            remediation_messages=remediations,
            matched_policies=matched_traces,
            simulated_at=datetime.now(UTC),
        )


policy_service = PolicyService()
