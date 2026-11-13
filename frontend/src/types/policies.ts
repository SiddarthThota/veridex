/**
 * Authoritative TypeScript Type Definitions for Policy Engine (Phase 9.5).
 *
 * Mapped directly to FastAPI v0.8.0 Pydantic models in `backend/app/policies/schemas.py`.
 */

export type PolicyType = "SECURITY" | "OPERATIONAL" | "COMPLIANCE" | "FINANCIAL";
export type PolicyStatus = "DRAFT" | "ACTIVE" | "INACTIVE" | "ARCHIVED";
export type PolicyAction = "ALLOW" | "DENY" | "REQUIRE_APPROVAL";
export type PolicyVersionStatus = "DRAFT" | "PUBLISHED" | "RETIRED";

export type ConditionCombinator = "AND" | "OR" | "NOT";

export type PolicyOperator =
  | "EQUALS"
  | "NOT_EQUALS"
  | "GREATER_THAN"
  | "GREATER_THAN_OR_EQUAL"
  | "LESS_THAN"
  | "LESS_THAN_OR_EQUAL"
  | "CONTAINS"
  | "STARTS_WITH"
  | "ENDS_WITH"
  | "MATCHES_REGEX"
  | "IN"
  | "NOT_IN"
  | "IS_NULL"
  | "IS_NOT_NULL";

/**
 * Scoping criteria defining when a rule applies.
 * Exact 7 fields matching backend `TargetScopeSchema`.
 */
export interface TargetScopeSchema {
  agent_ids: string[];
  agent_environments: string[];
  agent_risk_tiers: string[];
  tool_ids: string[];
  tool_risk_levels: string[];
  tool_access_types: string[];
  tool_data_classifications: string[];
}

/**
 * Recursive AST condition tree node.
 */
export interface ConditionNode {
  combinator?: ConditionCombinator;
  conditions?: ConditionNode[];
  field?: string;
  operator?: PolicyOperator;
  value?: unknown;
}

/** Payload to create a new rule inside a DRAFT PolicyVersion */
export interface PolicyRuleCreate {
  rule_name: string;
  description?: string | null;
  rule_order?: number;
  action?: PolicyAction;
  violation_code?: string;
  remediation_message?: string | null;
  target_scope?: TargetScopeSchema;
  condition_tree?: Record<string, unknown>;
  is_enabled?: boolean;
}

/** Payload to update an existing rule in a DRAFT PolicyVersion */
export interface PolicyRuleUpdate {
  rule_name?: string | null;
  description?: string | null;
  rule_order?: number | null;
  action?: PolicyAction | null;
  violation_code?: string | null;
  remediation_message?: string | null;
  target_scope?: TargetScopeSchema | null;
  condition_tree?: Record<string, unknown> | null;
  is_enabled?: boolean | null;
}

/** Full detail of a PolicyRule */
export interface PolicyRuleResponse {
  id: string;
  policy_version_id: string;
  rule_name: string;
  description: string | null;
  rule_order: number;
  action: PolicyAction;
  violation_code: string;
  remediation_message: string | null;
  target_scope: TargetScopeSchema;
  condition_tree: Record<string, unknown>;
  is_enabled: boolean;
  created_at: string;
  updated_at: string;
}

/** Payload to branch a new DRAFT version from an existing policy */
export interface PolicyVersionCreate {
  changelog?: string | null;
}

/** Full detail of a PolicyVersion snapshot and its immutable rules */
export interface PolicyVersionResponse {
  id: string;
  policy_id: string;
  version_number: number;
  status: PolicyVersionStatus;
  changelog: string | null;
  published_by_user_id: string | null;
  published_at: string | null;
  created_at: string;
  rules: PolicyRuleResponse[];
}

/** Payload to create a new Policy container with initial DRAFT v1 version */
export interface PolicyCreate {
  name: string;
  slug?: string | null;
  description?: string | null;
  policy_type?: PolicyType;
  priority?: number;
  default_action?: PolicyAction;
  initial_rules?: PolicyRuleCreate[];
}

/** Payload to update metadata and priority of a Policy container */
export interface PolicyUpdate {
  name?: string | null;
  description?: string | null;
  policy_type?: PolicyType | null;
  priority?: number | null;
  default_action?: PolicyAction | null;
}

/** Full representation of a Policy container */
export interface PolicyResponse {
  id: string;
  organization_id: string;
  name: string;
  slug: string;
  description: string | null;
  policy_type: PolicyType;
  status: PolicyStatus;
  priority: number;
  default_action: PolicyAction;
  current_version_id: string | null;
  created_at: string;
  updated_at: string;
  current_version?: PolicyVersionResponse | null;
}

/** Paginated list of Policy records */
export interface PolicyListResponse {
  items: PolicyResponse[];
  total: number;
}

/** Query parameters for listing policies */
export interface PolicyListQueryParams {
  policy_type?: PolicyType;
  status?: PolicyStatus;
  limit?: number;
  offset?: number;
}

/** Payload to dry-run evaluate policies against a hypothetical tool invocation */
export interface PolicySimulateRequest {
  agent_id: string;
  tool_id: string;
  tool_version_id: string;
  arguments?: Record<string, unknown>;
  environment?: string;
}

/** Telemetry trace for a matched rule during evaluation or simulation */
export interface MatchedRuleTrace {
  rule_id: string;
  rule_name: string;
  action: PolicyAction;
  violation_code: string;
  remediation_message: string | null;
}

/** Telemetry trace for a matched policy during evaluation or simulation */
export interface MatchedPolicyTrace {
  policy_id: string;
  policy_slug: string;
  policy_version_id: string;
  version_number: number;
  matched_rules: MatchedRuleTrace[];
}

/** Outcome of a policy simulation */
export interface PolicySimulateResponse {
  decision: PolicyAction;
  violation_codes: string[];
  remediation_messages: string[];
  matched_policies: MatchedPolicyTrace[];
  simulated_at: string;
}

/** Client-side structural version comparison item */
export interface VersionRuleDiff {
  type: "ADDED" | "REMOVED" | "MODIFIED" | "UNCHANGED";
  ruleName: string;
  details: string;
  vA?: PolicyRuleResponse;
  vB?: PolicyRuleResponse;
}

