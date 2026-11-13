/**
 * Formatters and Protection Utilities for VERIDEX Approvals & Governance (Phase 9.4).
 *
 * Provides status styles, violation code descriptions, date/duration formatters,
 * and recursive sensitive argument masking with role-gated reveal capability.
 */

import type { ApprovalStatus, ExecutionStatus } from "@/types/approvals";

/** Sensitive key pattern for recursive arguments masking */
export const SENSITIVE_KEY_REGEX = /password|secret|token|key|credential|auth|private/i;

/** Status styling classes for approval states */
export function getApprovalStatusStyle(status: ApprovalStatus): {
  badge: string;
  dot: string;
  label: string;
} {
  switch (status) {
    case "PENDING":
      return {
        badge: "bg-amber-500/10 text-amber-400 border-amber-500/25",
        dot: "bg-amber-400 animate-pulse",
        label: "Pending Review",
      };
    case "APPROVED":
      return {
        badge: "bg-emerald-500/10 text-emerald-400 border-emerald-500/25",
        dot: "bg-emerald-400",
        label: "Approved",
      };
    case "REJECTED":
      return {
        badge: "bg-rose-500/10 text-rose-400 border-rose-500/25",
        dot: "bg-rose-400",
        label: "Rejected",
      };
    case "EXPIRED":
      return {
        badge: "bg-gray-500/10 text-gray-400 border-gray-500/25",
        dot: "bg-gray-500",
        label: "Expired",
      };
    default:
      return {
        badge: "bg-gray-800 text-gray-300 border-gray-700",
        dot: "bg-gray-400",
        label: status,
      };
  }
}

/** Execution status styling classes for tool execution records */
export function getExecutionStatusStyle(status: ExecutionStatus): {
  badge: string;
  dot: string;
  label: string;
} {
  switch (status) {
    case "SUCCESS":
      return {
        badge: "bg-emerald-500/10 text-emerald-400 border-emerald-500/25",
        dot: "bg-emerald-400",
        label: "Execution Success",
      };
    case "FAILED":
      return {
        badge: "bg-rose-500/10 text-rose-400 border-rose-500/25",
        dot: "bg-rose-400",
        label: "Execution Failed",
      };
    case "TIMED_OUT":
      return {
        badge: "bg-amber-500/10 text-amber-400 border-amber-500/25",
        dot: "bg-amber-400",
        label: "Execution Timed Out",
      };
    case "RUNNING":
      return {
        badge: "bg-sky-500/10 text-sky-400 border-sky-500/25",
        dot: "bg-sky-400 animate-pulse",
        label: "Executing",
      };
    case "PENDING":
    default:
      return {
        badge: "bg-gray-500/10 text-gray-400 border-gray-500/25",
        dot: "bg-gray-400",
        label: "Execution Pending",
      };
  }
}

/** Humanizes governance violation codes for visual badges */
export function humanizeViolationCode(code: string): string {
  const map: Record<string, string> = {
    APPROVAL_REQUIRED: "Approval Required",
    HIGH_RISK_RESTRICTION: "High-Risk Restriction",
    IRREVERSIBLE_WRITE_RESTRICTION: "Irreversible Write",
    RESTRICTED_DATA_ACCESS: "Restricted Data",
    RATE_LIMIT_EXCEEDED: "Rate Limit Exceeded",
    CRITICAL_RISK_THRESHOLD_EXCEEDED: "Critical Risk Threshold",
    RISK_EVALUATION_FAILED: "Risk Evaluation Failed",
    ARGUMENTS_HASH_MISMATCH: "Arguments Tampered",
    PERMISSION_DENIED: "Permission Denied",
    INACTIVE_AGENT: "Inactive Agent",
    INACTIVE_TOOL: "Inactive Tool",
  };
  if (map[code]) return map[code];
  return code
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

/** Truncates UUID for concise display */
export function truncateId(id: string | null | undefined, chars = 8): string {
  if (!id) return "—";
  return id.length > chars ? `${id.slice(0, chars)}…` : id;
}

/** Formats ISO timestamp to short relative time or UTC timestamp */
export function formatRelativeTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHour = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHour / 24);

    if (diffSec < 60) return "just now";
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffHour < 24) return `${diffHour}h ago`;
    if (diffDay < 7) return `${diffDay}d ago`;

    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "UTC",
    }).format(d);
  } catch {
    return iso;
  }
}

/** Formats ISO date to explicit UTC string */
export function formatDateTimeUtc(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return new Intl.DateTimeFormat("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      timeZone: "UTC",
      timeZoneName: "short",
    }).format(d);
  } catch {
    return iso;
  }
}

/** Formats duration in ms or s */
export function formatDurationMs(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || isNaN(ms)) return "—";
  if (ms >= 1000) return `${(ms / 1000).toFixed(2)}s`;
  return `${ms.toFixed(1)}ms`;
}

/**
 * Recursively masks sensitive arguments matching the SENSITIVE_KEY_REGEX.
 * If reveal is false, any key matching the pattern is replaced by "••••••••".
 * Never mutates input data.
 */
export function maskSensitiveArguments(val: unknown, reveal = false): unknown {
  if (val === null || val === undefined) return val;

  if (Array.isArray(val)) {
    return val.map((item) => maskSensitiveArguments(item, reveal));
  }

  if (typeof val === "object") {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
      const isSensitiveKey = SENSITIVE_KEY_REGEX.test(k);

      if (!reveal && isSensitiveKey && (typeof v !== "object" || v === null)) {
        // Sensitive primitive value (string, number, boolean)
        result[k] = "••••••••";
      } else if (
        !reveal &&
        isSensitiveKey &&
        Array.isArray(v) &&
        v.every((el) => typeof el !== "object" || el === null)
      ) {
        // Sensitive array of primitives (e.g. tokens: ["a", "b"])
        result[k] = v.map(() => "••••••••");
      } else if (typeof v === "object" && v !== null) {
        // Nested object or array: traverse recursively
        result[k] = maskSensitiveArguments(v, reveal);
      } else {
        result[k] = v;
      }
    }
    return result;
  }

  return val;
}

/**
 * Sanitizes approval decision rationale:
 * - Strips control characters (except standard newlines and tabs)
 * - Trims extra whitespace
 */
export function sanitizeRationale(text: string): string {
  if (!text) return "";
  // Strip non-printable ASCII control characters (\x00-\x08, \x0B, \x0C, \x0E-\x1F, \x7F)
  // preserve \t (\x09) and \n (\x0A), \r (\x0D)
  return text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "").trim();
}

