"use client";

/**
 * Authentication / Login Page for VERIDEX (Phase 9.2).
 *
 * Implements:
 * - Enterprise SecOps dark-first login form.
 * - Same-origin POST to /api/auth/login with CSRF header.
 * - Session expiration alert when query string contains ?expired=true.
 * - Automatic role-aware post-login redirect via getDefaultLandingRoute().
 * - Suspense boundary for Next.js App Router client parameter hydration.
 */

import React, { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getDefaultLandingRoute, canAccessPage, normalizePath } from "@/lib/permissions";
import type { UserRole } from "@/types/auth";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isExpired = searchParams.get("expired") === "true";
  const redirectParam = searchParams.get("next") || searchParams.get("redirect");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Veridex-Request": "1",
        },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setError(data.error?.message || "Invalid credentials or authentication failure.");
        setLoading(false);
        return;
      }

      // Successful login - retrieve assigned role
      const userRole = data.user?.role as UserRole | undefined;

      // Determine appropriate post-login route
      let targetRoute = getDefaultLandingRoute(userRole);

      // If a specific redirect target was requested, validate and normalize safely
      if (redirectParam) {
        const normalizedRedirect = normalizePath(redirectParam);
        if (
          normalizedRedirect &&
          normalizedRedirect !== "/" &&
          canAccessPage(userRole, normalizedRedirect)
        ) {
          targetRoute = normalizedRedirect;
        }
      }

      router.push(targetRoute);
      router.refresh();
    } catch {
      setError("Unable to connect to authentication service. Please try again.");
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md p-8 bg-gray-900/90 border border-gray-800 rounded-2xl shadow-2xl backdrop-blur-md">
      {/* Brand Header */}
      <div className="text-center mb-8">
        <div className="inline-flex w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500 via-purple-600 to-cyan-500 items-center justify-center text-white font-bold text-xl shadow-lg shadow-indigo-500/30 mb-3">
          V
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-gray-100">VERIDEX</h1>
        <p className="text-xs text-gray-400 mt-1 uppercase tracking-wider font-mono">
          AI Agent Governance Platform
        </p>
      </div>

      {/* Session Expired Banner */}
      {isExpired && (
        <div
          role="alert"
          className="mb-6 p-3.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs flex items-start gap-2.5"
        >
          <span className="text-amber-400 text-sm leading-none mt-0.5">⚠️</span>
          <span>Your session has expired for security. Please authenticate to continue.</span>
        </div>
      )}

      {/* Error Alert */}
      {error && (
        <div
          role="alert"
          className="mb-6 p-3.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-start gap-2.5"
        >
          <span className="text-rose-400 text-sm leading-none mt-0.5">⚠️</span>
          <span>{error}</span>
        </div>
      )}

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="email" className="block text-xs font-medium text-gray-300 mb-1.5">
            Work Email
          </label>
          <input
            id="email"
            type="email"
            required
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="analyst@enterprise.internal"
            className="w-full px-3.5 py-2.5 bg-gray-950 border border-gray-800 rounded-lg text-sm text-gray-100 placeholder-gray-500 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors"
          />
        </div>

        <div>
          <label htmlFor="password" className="block text-xs font-medium text-gray-300 mb-1.5">
            Password
          </label>
          <input
            id="password"
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••••••"
            className="w-full px-3.5 py-2.5 bg-gray-950 border border-gray-800 rounded-lg text-sm text-gray-100 placeholder-gray-500 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full mt-6 py-2.5 px-4 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-sm transition-colors shadow-md shadow-indigo-600/20 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-gray-950 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {loading ? (
            <>
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              <span>Authenticating...</span>
            </>
          ) : (
            <span>Sign In to Console</span>
          )}
        </button>
      </form>

      {/* Security notice footer */}
      <div className="mt-8 pt-6 border-t border-gray-800/80 text-center">
        <p className="text-[11px] text-gray-500">
          Governed by VERIDEX AI Policy Engine. All authentication events and session tokens are
          cryptographically audited.
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-radial from-gray-900 via-gray-950 to-black">
      <Suspense
        fallback={
          <div className="w-full max-w-md p-8 bg-gray-900 border border-gray-800 rounded-2xl text-center text-gray-400 text-sm">
            Loading authentication portal...
          </div>
        }
      >
        <LoginForm />
      </Suspense>
    </div>
  );
}
