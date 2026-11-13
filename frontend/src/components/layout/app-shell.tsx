"use client";

/**
 * AppShell Layout Component for VERIDEX SecOps Dashboard (Phase 9.2).
 *
 * Provides the unified, dark-first application chrome:
 * - Desktop collapsible sidebar and mobile slide-out navigation drawer.
 * - Sticky top header with contextual page title and user profile.
 * - Scrollable main content viewport with responsive padding.
 */

import React, { useState } from "react";
import { Sidebar } from "./sidebar";
import { Header } from "./header";

interface AppShellProps {
  children: React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);

  return (
    <div className="flex h-screen w-full overflow-hidden bg-gray-950 text-gray-100">
      {/* Navigation Sidebar */}
      <Sidebar
        isMobileOpen={isMobileOpen}
        onMobileClose={() => setIsMobileOpen(false)}
        isCollapsed={isCollapsed}
        onToggleCollapse={() => setIsCollapsed((prev) => !prev)}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
        <Header onOpenMobileNav={() => setIsMobileOpen(true)} />
        <main
          className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 focus:outline-hidden"
          id="main-content"
          tabIndex={-1}
        >
          <div className="max-w-7xl mx-auto space-y-6">{children}</div>
        </main>
      </div>
    </div>
  );
}

