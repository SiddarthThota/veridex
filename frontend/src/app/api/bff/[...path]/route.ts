/**
 * Hardened Generic Next.js BFF Reverse Proxy Route Handler: /api/bff/[...path]
 *
 * Securely bridges client-side fetch calls to the FastAPI v0.8.0 backend:
 * - Checks CSRF origins on mutating requests (POST, PUT, PATCH, DELETE).
 * - Enforces an explicit allowlist for supported top-level API domains.
 * - Prevents path traversal and malformed path segments.
 * - Decrypts server-side session cookie and injects `Authorization: Bearer <token>`.
 * - Discards any client-supplied Authorization or Cookie headers.
 * - Forwards backend response without ever leaking JWTs to the browser.
 * - Automatically purges session cookie if FastAPI returns 401 Unauthorized.
 */

import { cookies } from "next/headers";
import { type NextRequest, NextResponse } from "next/server";
import { getFastApiBaseUrl } from "@/lib/bff-client";
import { validateCsrf } from "@/lib/csrf";
import { decryptSession, SESSION_COOKIE_NAME } from "@/lib/session";

interface RouteContext {
  params: Promise<{ path: string[] }>;
}

/**
 * Authoritative allowlist of supported top-level API domains registered on
 * the FastAPI v0.8.0 router. Any request targeting an unlisted domain is rejected.
 */
export const ALLOWED_API_DOMAINS = new Set([
  "analytics",
  "governance",
  "runs",
  "policies",
  "risk",
  "agents",
  "tools",
  "users",
  "organizations",
  "health",
  "ready",
]);

// Whitelist pattern for path segments: alphanumeric, dashes, underscores, dots, colons
const SAFE_SEGMENT_REGEX = /^[a-zA-Z0-9_\-.:]+$/;

async function handleProxy(request: NextRequest, context: RouteContext) {
  const method = request.method.toUpperCase();

  // 1. Strict CSRF Protection for state-mutating requests
  if (method !== "GET" && method !== "HEAD" && method !== "OPTIONS") {
    const csrfResult = validateCsrf(request);
    if (!csrfResult.valid) {
      return NextResponse.json(
        { error: `CSRF validation failed: ${csrfResult.reason}` },
        { status: 403 }
      );
    }
  }

  // 2. Validate session cookie
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME);

  if (!sessionCookie?.value) {
    return NextResponse.json(
      { error: "Unauthorized: No active session" },
      { status: 401 }
    );
  }

  const session = await decryptSession(sessionCookie.value);
  if (!session || !session.access_token) {
    cookieStore.delete(SESSION_COOKIE_NAME);
    return NextResponse.json(
      { error: "Unauthorized: Session expired or invalid" },
      { status: 401 }
    );
  }

  // 3. Resolve and validate target path
  const { path } = await context.params;

  if (!path || !Array.isArray(path) || path.length === 0) {
    return NextResponse.json(
      { error: "Bad Request: Missing API path parameters" },
      { status: 400 }
    );
  }

  // Path traversal and malformed segment defense
  for (const segment of path) {
    if (
      !segment ||
      segment === "." ||
      segment === ".." ||
      segment.includes("/") ||
      segment.includes("\\") ||
      segment.includes("%") ||
      !SAFE_SEGMENT_REGEX.test(segment)
    ) {
      return NextResponse.json(
        { error: "Forbidden: Malformed or disallowed path segment" },
        { status: 403 }
      );
    }
  }

  // Top-level API domain allowlist enforcement
  const topDomain = path[0].toLowerCase();
  if (!ALLOWED_API_DOMAINS.has(topDomain)) {
    return NextResponse.json(
      { error: `Forbidden: API domain '${topDomain}' is not supported by BFF proxy` },
      { status: 403 }
    );
  }

  const targetPath = path.join("/");
  const urlObj = new URL(request.url);
  const search = urlObj.search;
  const backendBase = getFastApiBaseUrl();
  const targetUrl = `${backendBase}/api/v1/${targetPath}${search}`;

  // 4. Construct outbound headers (ignoring browser-supplied Authorization and Cookies)
  const outboundHeaders = new Headers();
  outboundHeaders.set("Authorization", `Bearer ${session.access_token}`);
  outboundHeaders.set("Accept", "application/json");

  const contentType = request.headers.get("content-type");
  if (contentType) {
    outboundHeaders.set("Content-Type", contentType);
  }

  // 5. Read body if applicable
  let body: BodyInit | null = null;
  if (method !== "GET" && method !== "HEAD") {
    try {
      body = await request.text();
    } catch {
      body = null;
    }
  }

  // 6. Proxy request to FastAPI backend
  try {
    const backendResponse = await fetch(targetUrl, {
      method,
      headers: outboundHeaders,
      body,
    });

    // 7. Handle 401 by clearing session cookie
    if (backendResponse.status === 401) {
      cookieStore.delete(SESSION_COOKIE_NAME);
    }

    const responseBody = await backendResponse.text();
    const responseHeaders = new Headers();
    const respContentType = backendResponse.headers.get("content-type");
    if (respContentType) {
      responseHeaders.set("Content-Type", respContentType);
    }

    return new NextResponse(responseBody, {
      status: backendResponse.status,
      headers: responseHeaders,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Proxy communication error";
    return NextResponse.json(
      { error: `Backend service communication failed: ${message}` },
      { status: 503 }
    );
  }
}

export async function GET(request: NextRequest, context: RouteContext) {
  return handleProxy(request, context);
}

export async function POST(request: NextRequest, context: RouteContext) {
  return handleProxy(request, context);
}

export async function PUT(request: NextRequest, context: RouteContext) {
  return handleProxy(request, context);
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  return handleProxy(request, context);
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  return handleProxy(request, context);
}
