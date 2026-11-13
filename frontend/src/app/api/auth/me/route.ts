/**
 * BFF Route Handler: GET /api/auth/me
 *
 * Validates session cookie, queries FastAPI /api/v1/auth/me with Bearer token,
 * and returns the current user profile. If the token has expired on the backend,
 * the cookie is automatically invalidated.
 */

import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getFastApiBaseUrl } from "@/lib/bff-client";
import { decryptSession, SESSION_COOKIE_NAME } from "@/lib/session";
import type { User } from "@/types/auth";

export async function GET() {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME);

  if (!sessionCookie?.value) {
    return NextResponse.json(
      { error: "Not authenticated" },
      { status: 401 }
    );
  }

  const session = await decryptSession(sessionCookie.value);
  if (!session || !session.access_token) {
    cookieStore.delete(SESSION_COOKIE_NAME);
    return NextResponse.json(
      { error: "Session expired or invalid" },
      { status: 401 }
    );
  }

  // Validate with backend to confirm user is active and token has not expired
  const baseUrl = getFastApiBaseUrl();
  try {
    const meResponse = await fetch(`${baseUrl}/api/v1/auth/me`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        Accept: "application/json",
      },
    });

    if (!meResponse.ok) {
      if (meResponse.status === 401) {
        cookieStore.delete(SESSION_COOKIE_NAME);
      }
      return NextResponse.json(
        { error: "Session expired on server" },
        { status: meResponse.status }
      );
    }

    const user: User = await meResponse.json();

    return NextResponse.json({
      user,
      expires_at: session.expires_at,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Service error";
    return NextResponse.json(
      { error: `Backend unavailable: ${message}` },
      { status: 503 }
    );
  }
}

