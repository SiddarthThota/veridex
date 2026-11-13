"use client";

/**
 * Responsive Sidebar Component for VERIDEX SecOps Dashboard (Phase 9.2).
 *
 * Implements:
 * - Role-aware navigation visibility based on five-role permissions.
 * - Active route styling and accessible aria-current states.
 * - Collapsible desktop sidebar (expanded / compact icon-only).
 * - Mobile drawer overlay with backdrop.
 * - Platform branding and system release metadata.
 */

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/components/auth/auth-context";
import { NavIcon, CloseIcon, ChevronLeftIcon, ChevronRightIcon } from "@/components/ui/icons";
import { getPermittedNavItems } from "@/lib/permissions";

interface SidebarProps {
  isMobileOpen: boolean;
  onMobileClose: () => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
}

export function Sidebar({
  isMobileOpen,
  onMobileClose,
  isCollapsed,
  onToggleCollapse,
}: SidebarProps) {
  const pathname = usePathname();
  const { user } = useAuth();

  const permittedNavItems = getPermittedNavItems(user?.role);

  const isActive = (href: string) => {
    if (href === "/dashboard") {
      return pathname === "/" || pathname === "/dashboard" || pathname.startsWith("/dashboard/");
    }
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  const navContent = (
    <div className="flex flex-col h-full bg-gray-950 border-r border-gray-800/80 select-none">
      {/* Brand Header */}
      <div className="h-16 flex items-center justify-between px-4 border-b border-gray-800/80">
        <Link
          href="/"
          className={`flex items-center gap-2.5 transition-opacity ${
            isCollapsed ? "justify-center w-full" : ""
          }`}
          title="VERIDEX AI Agent Governance"
        >
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 via-purple-600 to-cyan-500 flex items-center justify-center text-white font-bold text-sm shadow-md shadow-indigo-500/20 flex-shrink-0">
            V
          </div>
          {!isCollapsed && (
            <div className="flex flex-col overflow-hidden">
              <span className="text-base font-bold tracking-wider bg-gradient-to-r from-indigo-400 via-purple-300 to-cyan-400 bg-clip-text text-transparent truncate">
                VERIDEX
              </span>
              <span className="text-[10px] text-gray-500 font-mono tracking-tight uppercase -mt-0.5">
                SecOps Governance
              </span>
            </div>
          )}
        </Link>

        {/* Mobile close trigger */}
        <button
          type="button"
          onClick={onMobileClose}
          className="md:hidden p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800/60"
          aria-label="Close navigation drawer"
        >
          <CloseIcon className="w-5 h-5" />
        </button>
      </div>

      {/* Navigation List */}
      <nav
        className="flex-1 py-4 px-3 space-y-1 overflow-y-auto"
        aria-label="Main Security Operations Navigation"
      >
        {permittedNavItems.map((item) => {
          const active = isActive(item.href);
          return (
            <Link
              key={item.id}
              href={item.href}
              onClick={onMobileClose}
              aria-current={active ? "page" : undefined}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors group relative ${
                active
                  ? "bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 shadow-sm shadow-indigo-500/10"
                  : "text-gray-400 hover:text-gray-200 hover:bg-gray-900 border border-transparent"
              } ${isCollapsed ? "justify-center px-2" : ""}`}
              title={isCollapsed ? item.name : undefined}
            >
              <div
                className={`flex-shrink-0 transition-colors ${
                  active ? "text-indigo-400" : "text-gray-500 group-hover:text-gray-300"
                }`}
              >
                <NavIcon name={item.icon} className="w-5 h-5" />
              </div>

              {!isCollapsed && <span className="truncate">{item.name}</span>}

              {/* Active accent pill */}
              {active && !isCollapsed && (
                <span className="ml-auto w-1.5 h-1.5 rounded-full bg-indigo-400 shadow-sm shadow-indigo-400/80" />
              )}
            </Link>
          );
        })}
      </nav>

      {/* Footer / Desktop Collapse Toggle */}
      <div className="p-3 border-t border-gray-800/80 flex items-center justify-between">
        {!isCollapsed && (
          <div className="flex flex-col px-2">
            <span className="text-[11px] text-gray-500 font-mono">Platform v0.8.0</span>
            <span className="text-[10px] text-emerald-500 flex items-center gap-1.5 mt-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Gateway Active
            </span>
          </div>
        )}
        <button
          type="button"
          onClick={onToggleCollapse}
          className={`hidden md:flex p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800/60 transition-colors ${
            isCollapsed ? "w-full justify-center" : ""
          }`}
          aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {isCollapsed ? (
            <ChevronRightIcon className="w-4 h-4" />
          ) : (
            <ChevronLeftIcon className="w-4 h-4" />
          )}
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Fixed Sidebar */}
      <aside
        className={`hidden md:block flex-shrink-0 h-screen transition-all duration-200 z-30 ${
          isCollapsed ? "w-18" : "w-64"
        }`}
      >
        {navContent}
      </aside>

      {/* Mobile Drawer Backdrop and Overlay */}
      {isMobileOpen && (
        <div
          className="fixed inset-0 bg-black/70 backdrop-blur-xs z-40 md:hidden"
          onClick={onMobileClose}
          aria-hidden="true"
        />
      )}
      <div
        className={`fixed inset-y-0 left-0 w-72 max-w-[85vw] z-50 md:hidden transform transition-transform duration-200 ease-in-out ${
          isMobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {navContent}
      </div>
    </>
  );
}

