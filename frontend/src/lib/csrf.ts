/**
 * Strict CSRF protection utilities for VERIDEX BFF Route Handlers (Phase 9.1 Hardening).
 *
 * Enforces mandatory Origin/Referer verification against the Host header and validates
 * Fetch Metadata (Sec-Fetch-Site) on all state-mutating requests (POST, PUT, PATCH, DELETE).
 * Does not allow custom headers alone to substitute for Origin/Referer verification.
 */

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export interface CsrfValidationResult {
  valid: boolean;
  reason?: string;
}

/**
 * Validates request origin and fetch metadata for state-mutating requests.
 */
export function validateCsrf(request: Request): CsrfValidationResult {
  const method = request.method.toUpperCase();

  // Safe HTTP methods do not mutate state and are exempt from CSRF checks
  if (SAFE_METHODS.has(method)) {
    return { valid: true };
  }

  // 1. Fetch Metadata check (Sec-Fetch-Site)
  // Cross-site requests initiated from third-party sites are strictly blocked
  const secFetchSite = request.headers.get("sec-fetch-site");
  if (secFetchSite && secFetchSite === "cross-site") {
    return {
      valid: false,
      reason: `Blocked cross-site request with Sec-Fetch-Site: ${secFetchSite}`,
    };
  }

  // 2. Host header validation
  const host = request.headers.get("host");
  if (!host) {
    return {
      valid: false,
      reason: "Missing Host header in request",
    };
  }

  const expectedHost = host.toLowerCase();

  // 3. Mandatory Origin / Referer verification
  // Browser-originated state-mutating requests MUST supply a matching Origin or Referer.
  // Custom headers (such as X-Veridex-Request) cannot substitute for missing or mismatched origins.
  const origin = request.headers.get("origin");
  const referer = request.headers.get("referer");

  if (!origin && !referer) {
    return {
      valid: false,
      reason: "State-mutating request rejected: missing both Origin and Referer headers",
    };
  }

  if (origin) {
    try {
      const originUrl = new URL(origin);
      if (originUrl.host.toLowerCase() !== expectedHost) {
        return {
          valid: false,
          reason: `Origin mismatch: expected ${expectedHost}, received ${originUrl.host}`,
        };
      }
    } catch {
      return {
        valid: false,
        reason: "Invalid Origin header URL",
      };
    }
  } else if (referer) {
    try {
      const refererUrl = new URL(referer);
      if (refererUrl.host.toLowerCase() !== expectedHost) {
        return {
          valid: false,
          reason: `Referer mismatch: expected ${expectedHost}, received ${refererUrl.host}`,
        };
      }
    } catch {
      return {
        valid: false,
        reason: "Invalid Referer header URL",
      };
    }
  }

  return { valid: true };
}
