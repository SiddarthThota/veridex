/**
 * Execution Forensics Formatters, Sanitization & Redaction Engine (Phase 9.6).
 *
 * Implements:
 * - sanitizeExecutionError: Deep scrubbing of filesystem paths, URIs, and secrets.
 * - maskSensitiveData: Recursive object/array sensitive data masking.
 * - Presentation formatters for RunStatus, ExecutionStatus, and GovernanceDecision.
 */

import type {
  ApprovalStatus,
  ExecutionStatus,
  GovernanceDecision,
  RunStatus,
} from "@/types/runs";

// =========================================================================
// 1. Error Sanitization Engine
// =========================================================================

export function sanitizeExecutionError(errorMessage: string | null | undefined): string | null {
  if (!errorMessage || typeof errorMessage !== "string") return null;

  let sanitized = errorMessage;

  // 1. Scrub Windows absolute file paths (e.g. C:\Users\... or D:\app\...)
  sanitized = sanitized.replace(/[A-Za-z]:\\[\w.-]+(?:\\[\w.-]+)*/g, "[INTERNAL_PATH]");

  // 2. Scrub POSIX absolute file paths (e.g. /app/backend/..., /var/run/...)
  sanitized = sanitized.replace(/(?:\/[a-zA-Z0-9_.-]+){2,}/g, "[INTERNAL_PATH]");

  // 3. Scrub database URIs (e.g. postgresql+asyncpg://user:pass@host:5432/db)
  sanitized = sanitized.replace(
    /[a-zA-Z0-9+.-]+:\/\/[^\s@]+@[^\s/:]+(?::\d+)?\/[^\s]*/g,
    "[DATABASE_URI_REDACTED]"
  );

  // 4. Scrub embedded API keys and tokens
  sanitized = sanitized.replace(/sk-[A-Za-z0-9-_]{20,}/g, "sk-***[REDACTED]***");
  sanitized = sanitized.replace(/gh[pousr][-_][A-Za-z0-9_]{36,}/g, "gh***[REDACTED]***");
  // Robust JWT scrubbing: matches standard RFC 7519 3-segment JWTs and mock/truncated signatures
  sanitized = sanitized.replace(
    /\bey[A-Za-z0-9_-]{4,}\.(?:ey[A-Za-z0-9_-]{3,}|[A-Za-z0-9_-]{8,})\.[A-Za-z0-9_-]+/g,
    "ey***[REDACTED_JWT]***"
  );

  // 5. Trim and bound length
  return sanitized.trim().slice(0, 1000);
}

// =========================================================================
// 2. Recursive Sensitive-Data Redaction Engine
// =========================================================================

// Key patterns indicating sensitive data
export const SENSITIVE_KEY_PATTERNS = [
  /passw(or)?d/i,
  /secret/i,
  /token/i,
  /api[_-]?key/i,
  /auth/i,
  /bearer/i,
  /credential/i,
  /private[_-]?key/i,
  /session/i,
  /cookie/i,
  /ssn|social[_-]?security/i,
  /card[_-]?number|cvv|cvc|pan/i,
  /pin/i,
];

// Value patterns indicating sensitive strings regardless of key name
export const SENSITIVE_VALUE_PATTERNS = [
  // JWT tokens
  /^ey[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/,
  // OpenAI API keys
  /^sk-[A-Za-z0-9-_]{20,}$/,
  // GitHub Personal Access Tokens
  /^gh[pousr][-_][A-Za-z0-9_]{36,}$/,
  // AWS Access Key ID
  /^AKIA[0-9A-Z]{16}$/,
  // Private Key PEM headers
  /-----BEGIN[ A-Z0-9_-]+PRIVATE KEY-----/,
  // Database connection URIs
  /^[a-zA-Z0-9+.-]+:\/\/[^:]+:[^@]+@/,
];

export function maskSensitiveData(data: unknown, revealPlaintext = false): unknown {
  if (revealPlaintext) return data;
  if (data === null || data === undefined) return data;

  // Handle primitives
  if (typeof data === "string") {
    for (const pattern of SENSITIVE_VALUE_PATTERNS) {
      if (pattern.test(data)) {
        return "******** [REDACTED_SECRET]";
      }
    }
    return data;
  }

  if (typeof data !== "object") {
    return data;
  }

  // Handle arrays
  if (Array.isArray(data)) {
    return data.map((item) => maskSensitiveData(item, revealPlaintext));
  }

  // Handle objects
  const masked: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
    const isSensitiveKey = SENSITIVE_KEY_PATTERNS.some((pattern) => pattern.test(key));
    if (isSensitiveKey) {
      masked[key] = "******** [REDACTED]";
    } else {
      masked[key] = maskSensitiveData(value, revealPlaintext);
    }
  }

  return masked;
}

// =========================================================================
// 3. Presentation Status Badges & Formatters
// =========================================================================

export interface StatusBadgeConfig {
  label: string;
  badgeClass: string;
  dotClass: string;
}

export function formatRunStatus(status: RunStatus): StatusBadgeConfig {
  switch (status) {
    case "RUNNING":
      return {
        label: "Running",
        badgeClass: "bg-blue-500/10 text-blue-400 border-blue-500/20",
        dotClass: "bg-blue-400 animate-pulse",
      };
    case "COMPLETED":
      return {
        label: "Completed",
        badgeClass: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
        dotClass: "bg-emerald-400",
      };
    case "FAILED":
      return {
        label: "Failed",
        badgeClass: "bg-rose-500/10 text-rose-400 border-rose-500/20",
        dotClass: "bg-rose-400",
      };
    case "CANCELLED":
      return {
        label: "Cancelled",
        badgeClass: "bg-amber-500/10 text-amber-400 border-amber-500/20",
        dotClass: "bg-amber-400",
      };
    case "PENDING":
    default:
      return {
        label: "Pending",
        badgeClass: "bg-gray-500/10 text-gray-400 border-gray-500/20",
        dotClass: "bg-gray-400",
      };
  }
}

export function formatExecutionStatus(status: ExecutionStatus): StatusBadgeConfig {
  switch (status) {
    case "SUCCESS":
      return {
        label: "Success",
        badgeClass: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
        dotClass: "bg-emerald-400",
      };
    case "FAILED":
      return {
        label: "Execution Failed",
        badgeClass: "bg-rose-500/10 text-rose-400 border-rose-500/20",
        dotClass: "bg-rose-400",
      };
    case "TIMED_OUT":
      return {
        label: "Timed Out",
        badgeClass: "bg-amber-500/10 text-amber-400 border-amber-500/20",
        dotClass: "bg-amber-400",
      };
    case "RUNNING":
      return {
        label: "Executing",
        badgeClass: "bg-blue-500/10 text-blue-400 border-blue-500/20",
        dotClass: "bg-blue-400 animate-pulse",
      };
    case "PENDING":
    default:
      return {
        label: "Pending Execution",
        badgeClass: "bg-gray-500/10 text-gray-400 border-gray-500/20",
        dotClass: "bg-gray-400",
      };
  }
}

export function formatGovernanceDecision(decision: GovernanceDecision): {
  label: string;
  badgeClass: string;
  iconType: "allow" | "deny" | "approval";
} {
  switch (decision) {
    case "ALLOW":
      return {
        label: "ALLOW",
        badgeClass: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
        iconType: "allow",
      };
    case "DENY":
      return {
        label: "DENY",
        badgeClass: "bg-rose-500/15 text-rose-400 border-rose-500/30",
        iconType: "deny",
      };
    case "REQUIRE_APPROVAL":
    default:
      return {
        label: "REQUIRE APPROVAL",
        badgeClass: "bg-amber-500/15 text-amber-400 border-amber-500/30",
        iconType: "approval",
      };
  }
}

export function formatApprovalStatus(status: ApprovalStatus): StatusBadgeConfig {
  switch (status) {
    case "APPROVED":
      return {
        label: "Approved",
        badgeClass: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
        dotClass: "bg-emerald-400",
      };
    case "REJECTED":
      return {
        label: "Rejected",
        badgeClass: "bg-rose-500/10 text-rose-400 border-rose-500/20",
        dotClass: "bg-rose-400",
      };
    case "EXPIRED":
      return {
        label: "Expired",
        badgeClass: "bg-gray-500/10 text-gray-400 border-gray-500/20",
        dotClass: "bg-gray-400",
      };
    case "PENDING":
    default:
      return {
        label: "Pending Review",
        badgeClass: "bg-amber-500/10 text-amber-400 border-amber-500/20",
        dotClass: "bg-amber-400 animate-pulse",
      };
  }
}

export function formatDurationMs(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || ms < 0) return "—";
  if (ms < 1000) return `${ms} ms`;
  const seconds = (ms / 1000).toFixed(2);
  return `${seconds} s`;
}

export function formatLatency(latencyMs: number | null | undefined): string {
  if (latencyMs === null || latencyMs === undefined || latencyMs < 0) return "—";
  if (latencyMs < 1) return "< 1 ms";
  if (latencyMs < 1000) return `${latencyMs.toFixed(1)} ms`;
  return `${(latencyMs / 1000).toFixed(2)} s`;
}

export function formatDate(isoString: string | null | undefined): string {
  if (!isoString) return "—";
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return "—";
    return d.toLocaleString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
  } catch {
    return "—";
  }
}
