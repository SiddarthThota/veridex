"use client";

/**
 * Access Denied (HTTP 403) Page for VERIDEX (Phase 9.2).
 *
 * Implements:
 * - Clear enterprise security warning when role lacks page permission.
 * - Current user identity and canonical RoleBadge display.
 * - Dynamic return button navigating to safe default landing route.
 * - Account switch / logout option.
 */

import React from "react";
import Link from "next/link";
import { useAuth } from "@/components/auth/auth-context";
import { RoleBadge } from "@/components/ui/role-badge";
import { ShieldAlertIcon, LogoutIcon } from "@/components/ui/icons";
import { getDefaultLandingRoute } from "@/lib/permissions";

export default function ForbiddenPage() {
  const { user, logout, isLoading } = useAuth();

  const safeRoute = getDefaultLandingRoute(user?.role);

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-radial from-gray-900 via-gray-950 to-black text-gray-100">
      <div className="w-full max-w-lg p-8 bg-gray-900/90 border border-gray-800 rounded-2xl shadow-2xl backdrop-blur-md text-center">
        {/* Shield Alert Icon */}
        <div className="w-16 h-16 mx-auto mb-5 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400">
          <ShieldAlertIcon className="w-8 h-8" />
        </div>

        {/* Header */}
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white mb-2">
          403 — Access Restricted
        </h1>
        <p className="text-sm text-gray-400 mb-6 max-w-sm mx-auto">
          Your assigned role does not possess the required permissions to view this resource under the
          VERIDEX governance policy.
        </p>

        {/* Role & Identity Context Card */}
        <div className="mb-8 p-4 rounded-xl bg-gray-950 border border-gray-800/80 text-left space-y-2.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-400">Current Role</span>
            {isLoading ? (
              <span className="text-gray-500">Checking...</span>
            ) : user?.role ? (
              <RoleBadge role={user.role} size="sm" />
            ) : (
              <span className="text-gray-500">Unauthenticated</span>
            )}
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-400">Account</span>
            <span className="font-mono text-gray-200 truncate max-w-[200px]">
              {user?.email || "No session"}
            </span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-400">Authorization Rule</span>
            <span className="font-mono text-indigo-400 text-[11px]">RBAC_STRICT_ENFORCE</span>
          </div>
        </div>

        {/* Navigation Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href={safeRoute}
            className="py-2.5 px-5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-sm transition-colors shadow-md shadow-indigo-600/20 text-center"
          >
            Return to Permitted View
          </Link>
          <button
            type="button"
            onClick={() => logout()}
            className="py-2.5 px-4 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 font-medium text-sm transition-colors flex items-center justify-center gap-2"
          >
            <LogoutIcon className="w-4 h-4 text-gray-400" />
            <span>Switch Account</span>
          </button>
        </div>

        {/* Security Audit Notice */}
        <div className="mt-8 pt-6 border-t border-gray-800/80 text-center">
          <p className="text-[11px] text-gray-500">
            Unauthorized navigation attempts are recorded in the security audit trail.
          </p>
        </div>
      </div>
    </div>
  );
}

