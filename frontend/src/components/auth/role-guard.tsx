"use client";

/**
 * RoleGuard Component for VERIDEX (Phase 9.2).
 *
 * Client-side UI safeguard for conditional rendering based on user role.
 * IMPORTANT: This component is a visual and UX safeguard only; the FastAPI
 * backend and Next.js BFF proxy remain the authoritative security boundaries.
 */

import React from "react";
import type { UserRole } from "@/types/auth";
import { useAuth } from "./auth-context";

export interface RoleGuardProps {
  /** Explicit list of roles authorized to view this element */
  allowedRoles?: readonly UserRole[];
  /** Optional custom permission check predicate */
  check?: (role: UserRole) => boolean;
  /** Content to display if authorized */
  children: React.ReactNode;
  /** Optional fallback content if unauthorized */
  fallback?: React.ReactNode;
  /**
   * If true, renders the children in a disabled state with a tooltip
   * instead of completely hiding the element (useful for compliance auditing).
   */
  disabled?: boolean;
  /** Custom explanation message for disabled state tooltip */
  disabledMessage?: string;
}

export function RoleGuard({
  allowedRoles,
  check,
  children,
  fallback = null,
  disabled = false,
  disabledMessage,
}: RoleGuardProps) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return null;
  }

  const role = user?.role;
  let isAuthorized = false;

  if (role) {
    if (check) {
      isAuthorized = check(role);
    } else if (allowedRoles) {
      isAuthorized = allowedRoles.includes(role);
    } else {
      isAuthorized = true;
    }
  }

  if (isAuthorized) {
    return <>{children}</>;
  }

  // If disabled mode is requested, render child with disabled overlay and tooltip
  if (disabled) {
    const defaultMsg = allowedRoles
      ? `Action requires ${allowedRoles.join(" or ")} privileges`
      : "You do not have permission to perform this action";
    const tooltip = disabledMessage || defaultMsg;

    return (
      <div
        className="relative inline-block cursor-not-allowed opacity-50"
        title={tooltip}
        aria-disabled="true"
      >
        <div className="pointer-events-none">{children}</div>
      </div>
    );
  }

  return <>{fallback}</>;
}

