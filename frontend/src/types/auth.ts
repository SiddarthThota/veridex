/**
 * Authentication and authorization types for VERIDEX (Phase 9.1).
 * Aligned with backend FastAPI v0.8.0 schemas.
 */

export type UserRole = "ADMIN" | "SECURITY_ANALYST" | "AUDITOR" | "AGENT_OPERATOR" | "VIEWER";

export type UserStatus = "active" | "inactive" | "suspended";

export interface User {
  id: string; // UUID
  organization_id: string; // UUID
  email: string;
  display_name: string;
  role: UserRole;
  status: string;
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  status: string;
}

export interface TokenResponse {
  access_token: string;
  token_type: "bearer";
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface SessionData {
  access_token: string;
  user: User;
  expires_at: number; // Unix timestamp in milliseconds
}

export interface SessionCookiePayload {
  data: string; // Base64url encoded IV + ciphertext + auth tag
}

export interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

