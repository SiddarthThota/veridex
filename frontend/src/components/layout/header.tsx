"use client";

/**
 * Top Header Component for VERIDEX SecOps Dashboard (Phase 9.2).
 *
 * Implements:
 * - Current section title / context breadcrumb based on pathname.
 * - Mobile hamburger trigger.
 * - Active tenant / organization badge.
 * - Authenticated user identity display with canonical RoleBadge.
 * - User profile menu with accessible logout action.
 */

import React, { useState, useRef, useEffect } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/components/auth/auth-context";
import { RoleBadge } from "@/components/ui/role-badge";
import { MenuIcon, LogoutIcon, ChevronDownIcon } from "@/components/ui/icons";

interface HeaderProps {
  onOpenMobileNav: () => void;
}

const ROUTE_TITLES: Record<string, string> = {
  "/": "Overview",
  "/dashboard": "Security Dashboard",
  "/approvals": "Approvals Review Queue",
  "/runs": "Agent Runs & Audit Log",
  "/agents": "Registered Agents",
  "/tools": "Governed Tools",
  "/policies": "Governance Policies",
  "/risk": "Risk Assessment Engine",
  "/organization": "Organization & User Directory",
};

export function Header({ onOpenMobileNav }: HeaderProps) {
  const pathname = usePathname();
  const { user, organization, isLoading, logout } = useAuth();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click or ESC key
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setDropdownOpen(false);
      }
    }

    if (dropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleKeyDown);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [dropdownOpen]);

  // Determine current page title
  const currentTitle =
    ROUTE_TITLES[pathname] ||
    Object.entries(ROUTE_TITLES).find(([route]) => route !== "/" && pathname.startsWith(route))?.[1] ||
    "Security Operations";

  const handleLogout = async () => {
    try {
      setLoggingOut(true);
      await logout();
    } catch {
      setLoggingOut(false);
    }
  };

  const userInitial = (user?.display_name?.charAt(0) || user?.email?.charAt(0) || "U").toUpperCase();

  return (
    <header className="h-16 bg-gray-950/80 backdrop-blur-md border-b border-gray-800/80 flex items-center justify-between px-4 sm:px-6 sticky top-0 z-20">
      {/* Left: Mobile hamburger & Page Title */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onOpenMobileNav}
          className="md:hidden p-2 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800/60 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
          aria-label="Open navigation menu"
        >
          <MenuIcon className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2.5">
          <h1 className="text-base sm:text-lg font-semibold text-gray-100 tracking-tight">
            {currentTitle}
          </h1>
          {organization && (
            <span className="hidden lg:inline-flex items-center px-2 py-0.5 rounded-sm text-[11px] font-mono text-gray-400 bg-gray-900 border border-gray-800">
              {organization.name}
            </span>
          )}
        </div>
      </div>

      {/* Right: Tenant info, Role badge & User profile menu */}
      <div className="flex items-center gap-3">
        {user?.role && (
          <div className="hidden sm:block">
            <RoleBadge role={user.role} size="sm" />
          </div>
        )}

        {/* User Profile Dropdown */}
        <div className="relative" ref={dropdownRef}>
          <button
            type="button"
            onClick={() => setDropdownOpen((prev) => !prev)}
            aria-expanded={dropdownOpen}
            aria-haspopup="true"
            className="flex items-center gap-2.5 p-1.5 rounded-lg hover:bg-gray-900 border border-transparent hover:border-gray-800 transition-colors focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
          >
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-xs font-semibold shadow-xs">
              {userInitial}
            </div>
            <div className="hidden md:flex flex-col text-left">
              <span className="text-xs font-medium text-gray-200 truncate max-w-[140px]">
                {isLoading ? "Loading..." : user?.display_name || user?.email || "Authenticated User"}
              </span>
              <span className="text-[10px] text-gray-500 font-mono truncate max-w-[140px]">
                {user?.email || ""}
              </span>
            </div>
            <ChevronDownIcon
              className={`w-3.5 h-3.5 text-gray-400 transition-transform duration-200 hidden md:block ${
                dropdownOpen ? "rotate-180" : ""
              }`}
            />
          </button>

          {/* Dropdown Menu */}
          {dropdownOpen && (
            <div
              className="absolute right-0 mt-2 w-64 bg-gray-900 border border-gray-800 rounded-xl shadow-xl py-2 z-50 animate-in fade-in slide-in-from-top-1 duration-150"
              role="menu"
              aria-orientation="vertical"
            >
              {/* Identity summary */}
              <div className="px-4 py-2.5 border-b border-gray-800/80">
                <p className="text-xs font-semibold text-gray-200 truncate">
                  {user?.display_name || "Signed in"}
                </p>
                <p className="text-xs text-gray-400 font-mono truncate mt-0.5">
                  {user?.email || "No email available"}
                </p>
                {user?.role && (
                  <div className="mt-2 sm:hidden">
                    <RoleBadge role={user.role} size="sm" />
                  </div>
                )}
                {organization && (
                  <div className="mt-2 pt-2 border-t border-gray-800/50 flex items-center justify-between text-[11px] text-gray-400">
                    <span>Organization</span>
                    <span className="font-mono text-gray-300">{organization.name}</span>
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="px-2 pt-1.5">
                <button
                  type="button"
                  onClick={handleLogout}
                  disabled={loggingOut}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 transition-colors text-left disabled:opacity-50"
                  role="menuitem"
                >
                  <LogoutIcon className="w-4 h-4" />
                  <span>{loggingOut ? "Signing out..." : "Sign Out"}</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
