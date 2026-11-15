/**
 * Governed Tool Catalog Types for VERIDEX (Phase 9.6).
 *
 * Aligned strictly with FastAPI v0.8.0 schemas in backend/app/tools/schemas.py.
 */

export type ToolStatus = "DRAFT" | "ACTIVE" | "SUSPENDED" | "DEACTIVATED";

export type ToolAccessType = "READ" | "WRITE";

export type ToolReversibility = "REVERSIBLE" | "IRREVERSIBLE";

export type ToolRiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export type ToolDataClassification = "PUBLIC" | "INTERNAL" | "CONFIDENTIAL" | "RESTRICTED";

export type ToolApprovalRequirement = "NOT_REQUIRED" | "OPTIONAL" | "REQUIRED";

export type ToolVersionStatus = "DRAFT" | "PUBLISHED" | "RETIRED";

export interface ToolBase {
  name: string;
  description?: string | null;
  risk_level: ToolRiskLevel;
  access_type: ToolAccessType;
  reversibility: ToolReversibility;
  data_classification: ToolDataClassification;
  approval_requirement: ToolApprovalRequirement;
  timeout_seconds?: number | null;
  rate_limit?: number | null;
}

export type ToolCreate = ToolBase;

export interface ToolUpdate {
  description?: string | null;
  timeout_seconds?: number | null;
  rate_limit?: number | null;
}

export interface ToolResponse extends ToolBase {
  id: string; // UUID
  organization_id: string; // UUID
  slug: string;
  owner_user_id: string; // UUID
  status: ToolStatus;
  created_at: string; // ISO datetime
  updated_at: string; // ISO datetime
}

export interface ToolListResponse {
  items: ToolResponse[];
  total: number;
}

export interface ToolVersionBase {
  version: string;
  description?: string | null;
  input_schema?: Record<string, unknown> | null;
  output_schema?: Record<string, unknown> | null;
  configuration_metadata?: Record<string, unknown> | null;
}

export type ToolVersionCreate = ToolVersionBase;

export interface ToolVersionResponse extends ToolVersionBase {
  id: string; // UUID
  tool_id: string; // UUID
  created_by: string; // UUID
  status: ToolVersionStatus;
  created_at: string; // ISO datetime
  updated_at: string; // ISO datetime
}
