"use client";

/**
 * Authentication and Organization Context for VERIDEX (Phase 9.2).
 *
 * Provides reactive access to current user identity, role, and organization
 * across client components. Supports server-side initial state hydration.
 */

import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import type { User, Organization } from "@/types/auth";

interface AuthContextValue {
  user: User | null;
  organization: Organization | null;
  isLoading: boolean;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

interface AuthProviderProps {
  children: React.ReactNode;
  initialUser?: User | null;
  initialOrganization?: Organization | null;
}

export function AuthProvider({
  children,
  initialUser = null,
  initialOrganization = null,
}: AuthProviderProps) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(initialUser);
  const [organization, setOrganization] = useState<Organization | null>(initialOrganization);
  const [isLoading, setIsLoading] = useState(!initialUser);

  const fetchIdentity = useCallback(async () => {
    try {
      // 1. Fetch authenticated user profile through BFF
      const meRes = await fetch("/api/auth/me", {
        headers: { Accept: "application/json" },
        cache: "no-store",
      });

      if (!meRes.ok) {
        setUser(null);
        setOrganization(null);
        setIsLoading(false);
        return;
      }

      const meData = await meRes.json();
      setUser(meData.user || null);

      // 2. Fetch user's organization profile through BFF reverse proxy
      const orgRes = await fetch("/api/bff/organizations/my", {
        headers: { Accept: "application/json" },
        cache: "no-store",
      });

      if (orgRes.ok) {
        const orgData = await orgRes.json();
        setOrganization(orgData);
      }
    } catch {
      setUser(null);
      setOrganization(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;

    if (!initialUser) {
      (async () => {
        try {
          const meRes = await fetch("/api/auth/me", {
            headers: { Accept: "application/json" },
            cache: "no-store",
          });

          if (!isMounted) return;

          if (!meRes.ok) {
            setUser(null);
            setOrganization(null);
            setIsLoading(false);
            return;
          }

          const meData = await meRes.json();
          if (!isMounted) return;
          setUser(meData.user || null);

          const orgRes = await fetch("/api/bff/organizations/my", {
            headers: { Accept: "application/json" },
            cache: "no-store",
          });

          if (!isMounted) return;
          if (orgRes.ok) {
            const orgData = await orgRes.json();
            if (isMounted) setOrganization(orgData);
          }
        } catch {
          if (isMounted) {
            setUser(null);
            setOrganization(null);
          }
        } finally {
          if (isMounted) {
            setIsLoading(false);
          }
        }
      })();
    }

    return () => {
      isMounted = false;
    };
  }, [initialUser]);

  const logout = useCallback(async () => {
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Veridex-Request": "1",
        },
      });
    } finally {
      setUser(null);
      setOrganization(null);
      router.push("/login");
    }
  }, [router]);

  return (
    <AuthContext.Provider
      value={{
        user,
        organization,
        isLoading,
        logout,
        refresh: fetchIdentity,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
