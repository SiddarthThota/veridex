/**
 * Agent Fleet Registry Types for VERIDEX (Phase 9.6).
 *
 * Aligned strictly with FastAPI v0.8.0 schemas in backend/app/agents/schemas.py.
 */

export type AgentStatus = "DRAFT" | "ACTIVE" | "SUSPENDED" | "DEACTIVATED";

export type AgentEnvironment = "DEVELOPMENT" | "STAGING" | "PRODUCTION";

export type AgentRiskTier = "TIER_1" | "TIER_2" | "TIER_3" | "TIER_4";

export type AgentVersionStatus = "DRAFT" | "PUBLISHED" | "RETIRED";

export interface AgentBase {
  name: string;
  description?: string | null;
  environment: AgentEnvironment;
  risk_tier: AgentRiskTier;
  model_provider: string;
  model_name: string;
}

export type AgentCreate = AgentBase;

export interface AgentUpdate {
  description?: string | null;
  environment?: AgentEnvironment | null;
  owner_user_id?: string | null;
}

export interface AgentResponse extends AgentBase {
  id: string; // UUID
  organization_id: string; // UUID
  slug: string;
  owner_user_id: string; // UUID
  status: AgentStatus;
  created_at: string; // ISO datetime
  updated_at: string; // ISO datetime
}

export interface AgentListResponse {
  items: AgentResponse[];
  total: number;
}

export interface AgentVersionBase {
  system_configuration?: Record<string, unknown> | null;
  model_provider: string;
  model_name: string;
  configuration_metadata?: Record<string, unknown> | null;
}

export type AgentVersionCreate = AgentVersionBase;

export interface AgentVersionResponse extends AgentVersionBase {
  id: string; // UUID
  agent_id: string; // UUID
  version: string;
  created_by: string; // UUID
  status: AgentVersionStatus;
  created_at: string; // ISO datetime
  updated_at: string; // ISO datetime
}

export interface AgentToolPermission {
  tool_id: string; // UUID
  allowed: boolean;
  created_at: string; // ISO datetime
}
