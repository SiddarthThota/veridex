"use client";

/**
 * Root Landing Route for VERIDEX (Phase 9.2).
 *
 * Automatically routes authenticated users to their canonical landing page
 * based on role, or redirects unauthenticated visitors to /login.
 */

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/auth-context";
import { getDefaultLandingRoute } from "@/lib/permissions";

export default function HomePage() {
  const router = useRouter();
  const { user, isLoading } = useAuth();

  useEffect(() => {
    if (!isLoading) {
      if (user?.role) {
        router.replace(getDefaultLandingRoute(user.role));
      } else {
        router.replace("/login");
      }
    }
  }, [user, isLoading, router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950 text-gray-400">
      <div className="flex items-center gap-3">
        <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        <span className="text-sm">Routing to VERIDEX SecOps Console...</span>
      </div>
    </div>
  );
}
