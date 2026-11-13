/**
 * BFF Route Handler: POST /api/auth/login
 *
 * Receives credentials from browser, proxies to FastAPI OAuth2 token endpoint,
 * retrieves user profile, seals access token inside an HttpOnly encrypted cookie,
 * and returns sanitized user metadata without exposing the JWT to JavaScript.
 */

import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getFastApiBaseUrl } from "@/lib/bff-client";
import { validateCsrf } from "@/lib/csrf";
import {
  encryptSession,
  getSessionCookieOptions,
  SESSION_MAX_AGE_SECONDS,
} from "@/lib/session";
import type { LoginCredentials, SessionData, TokenResponse, User } from "@/types/auth";

export async function POST(request: Request) {
  // 1. CSRF validation
  const csrfResult = validateCsrf(request);
  if (!csrfResult.valid) {
    return NextResponse.json(
      { error: `CSRF validation failed: ${csrfResult.reason}` },
      { status: 403 }
    );
  }

  // 2. Parse request body
  let body: LoginCredentials;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON request body" },
      { status: 400 }
    );
  }

  const { email, password } = body;
  if (!email || !password) {
    return NextResponse.json(
      { error: "Email and password are required" },
      { status: 400 }
    );
  }

  // 3. Authenticate with FastAPI backend using OAuth2PasswordRequestForm format
  const baseUrl = getFastApiBaseUrl();
  const formBody = new URLSearchParams();
  formBody.append("username", email);
  formBody.append("password", password);

  try {
    const tokenResponse = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: formBody.toString(),
    });

    if (!tokenResponse.ok) {
      const errData = await tokenResponse.json().catch(() => ({}));
      return NextResponse.json(
        { error: errData.detail || "Invalid email or password" },
        { status: tokenResponse.status === 401 ? 401 : tokenResponse.status }
      );
    }

    const tokenData: TokenResponse = await tokenResponse.json();

    // 4. Retrieve user profile from FastAPI using the new access token
    const meResponse = await fetch(`${baseUrl}/api/v1/auth/me`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
        Accept: "application/json",
      },
    });

    if (!meResponse.ok) {
      return NextResponse.json(
        { error: "Failed to retrieve user profile after authentication" },
        { status: 401 }
      );
    }

    const user: User = await meResponse.json();

    // 5. Seal session data into AES-256-GCM encrypted payload
    const sessionData: SessionData = {
      access_token: tokenData.access_token,
      user,
      expires_at: Date.now() + SESSION_MAX_AGE_SECONDS * 1000,
    };

    const encryptedToken = await encryptSession(sessionData);

    // 6. Set HttpOnly, Secure, SameSite=Strict cookie
    const cookieStore = await cookies();
    cookieStore.set({
      ...getSessionCookieOptions(),
      value: encryptedToken,
    });

    // 7. Return user metadata to client (JWT IS NEVER EXPOSED)
    return NextResponse.json({
      user,
      expires_at: sessionData.expires_at,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Authentication service error";
    return NextResponse.json(
      { error: `Authentication service unavailable: ${message}` },
      { status: 503 }
    );
  }
}

