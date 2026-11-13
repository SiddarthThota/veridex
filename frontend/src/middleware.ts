/**
 * Next.js Edge Middleware for VERIDEX (Phase 9.2).
 *
 * Enforces server-side authentication and five-role route authorization guards:
 * - Redirects unauthenticated requests on protected routes to /login.
 * - Redirects authenticated users away from /login to their default role landing view.
 * - Enforces role-based route access, redirecting unauthorized users to /403.
 * - Preserves public routes and API route handling.
 */

import { NextResponse, type NextRequest } from "next/server";
import { canAccessPage, getDefaultLandingRoute } from "@/lib/permissions";
import { decryptSession, SESSION_COOKIE_NAME } from "@/lib/session";

// Public routes accessible without authentication
const PUBLIC_PATHS = new Set(["/login", "/403"]);

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 1. Skip static assets, next internal routes, and API endpoints
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api") ||
    pathname === "/favicon.ico"
  ) {
    return NextResponse.next();
  }

  // 2. Read session cookie
  const sessionCookie = request.cookies.get(SESSION_COOKIE_NAME);
  const session = sessionCookie?.value ? await decryptSession(sessionCookie.value) : null;
  const isAuthenticated = !!(session && session.access_token && session.user);

  // 3. Handle public routes
  if (PUBLIC_PATHS.has(pathname)) {
    // If authenticated user visits /login, redirect to their role landing route
    if (isAuthenticated && pathname === "/login") {
      const target = getDefaultLandingRoute(session.user.role);
      return NextResponse.redirect(new URL(target, request.url));
    }
    return NextResponse.next();
  }

  // 4. Handle unauthenticated access to protected routes
  if (!isAuthenticated) {
    const loginUrl = new URL("/login", request.url);
    if (pathname !== "/") {
      loginUrl.searchParams.set("next", pathname);
    }
    return NextResponse.redirect(loginUrl);
  }

  // 5. Handle root path redirect
  if (pathname === "/") {
    const landing = getDefaultLandingRoute(session.user.role);
    return NextResponse.redirect(new URL(landing, request.url));
  }

  // 6. Five-role route access enforcement
  const isAllowed = canAccessPage(session.user.role, pathname);
  if (!isAllowed) {
    const forbiddenUrl = new URL("/403", request.url);
    forbiddenUrl.searchParams.set("path", pathname);
    return NextResponse.redirect(forbiddenUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    "/((?!api|_next/static|_next/image|favicon.ico).*)",
  ],
};

