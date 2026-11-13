/**
 * Server-side Backend-for-Frontend (BFF) HTTP client for VERIDEX (Phase 9.1).
 *
 * Forwards requests from Next.js server components and route handlers to the
 * FastAPI backend with server-side Bearer token injection.
 * Never logs access tokens, credentials, or session secrets.
 */

import { cookies } from "next/headers";
import { decryptSession, SESSION_COOKIE_NAME } from "./session";

export function getFastApiBaseUrl(): string {
  return (
    process.env.FASTAPI_BACKEND_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    "http://localhost:8000"
  ).replace(/\/+$/, "");
}

export interface BackendFetchOptions extends RequestInit {
  requireAuth?: boolean;
}

/**
 * Execute an authenticated server-to-server request to the FastAPI backend.
 * Injects `Authorization: Bearer <token>` from the encrypted session cookie.
 */
export async function fetchBackend(
  path: string,
  options: BackendFetchOptions = {}
): Promise<Response> {
  const { requireAuth = true, headers: customHeaders, ...restOptions } = options;
  const baseUrl = getFastApiBaseUrl();
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const url = `${baseUrl}${normalizedPath}`;

  const headers = new Headers(customHeaders);
  headers.set("Accept", "application/json");

  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME);

  if (requireAuth) {
    if (!sessionCookie?.value) {
      return new Response(JSON.stringify({ detail: "Unauthorized: No active session" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const session = await decryptSession(sessionCookie.value);
    if (!session || !session.access_token) {
      // Invalidate expired or corrupt cookie
      cookieStore.delete(SESSION_COOKIE_NAME);
      return new Response(JSON.stringify({ detail: "Unauthorized: Session expired or invalid" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    headers.set("Authorization", `Bearer ${session.access_token}`);
  }

  try {
    const response = await fetch(url, {
      ...restOptions,
      headers,
    });

    // If backend returns 401, clear local session cookie immediately
    if (response.status === 401 && requireAuth) {
      cookieStore.delete(SESSION_COOKIE_NAME);
    }

    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Backend unreachable";
    return new Response(
      JSON.stringify({
        detail: `Backend connection error: ${message}`,
      }),
      {
        status: 503,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}

