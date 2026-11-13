/**
 * BFF Route Handler: POST /api/auth/logout
 *
 * Terminates user session by invalidating and deleting the encrypted
 * veridex_session cookie.
 */

import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { validateCsrf } from "@/lib/csrf";
import { SESSION_COOKIE_NAME } from "@/lib/session";

export async function POST(request: Request) {
  const csrfResult = validateCsrf(request);
  if (!csrfResult.valid) {
    return NextResponse.json(
      { error: `CSRF validation failed: ${csrfResult.reason}` },
      { status: 403 }
    );
  }

  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);

  return NextResponse.json({ success: true });
}

