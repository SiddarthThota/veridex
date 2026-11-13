/**
 * Shared Entity Types for Agent and Tool selectors in Simulation and Workbenches.
 */

export interface AgentSummary {
  id: string;
  name: string;
  slug: string;
  risk_tier: string;
  environment: string;
  model_provider: string;
  model_name: string;
}

export interface AgentListResponse {
  items: AgentSummary[];
  total: number;
}

export interface ToolSummary {
  id: string;
  name: string;
  slug: string;
  risk_level: string;
  access_type: string;
  data_classification: string;
  approval_requirement: string;
}

export interface ToolListResponse {
  items: ToolSummary[];
  total: number;
}

export interface ToolVersionSummary {
  id: string;
  tool_id: string;
  version: string;
  status: string;
  description?: string | null;
  input_schema?: Record<string, unknown> | null;
  output_schema?: Record<string, unknown> | null;
}

