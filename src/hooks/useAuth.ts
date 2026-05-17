"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getToken, getUser } from "@/lib/api";

type User = {
  id: string;
  email: string;
  role: string;
  name?: string;
  adminLevel?: "super-admin" | "moderator";
  companyTeamRole?: "owner" | "manager" | "recruiter" | "viewer";
  hasCompletedOnboarding?: boolean;
  hasSeenTutorial?: boolean;
  hasSeenEmpresaTutorial?: boolean;
  companyStatus?: "inactive" | "pending_verification" | "active" | "rejected";
};

type UseAuthOptions = {
  allowAdmin?: boolean;
};

function getLoginRoute(requiredRole?: string) {
  return requiredRole === "admin" ? "/Admin/Login" : "/Login";
}

function normalizeUserRole(role: string | undefined | null): string {
  const value = String(role || "").trim().toLowerCase();
  if (value === "admin" || value === "super-admin" || value === "moderator") {
    return "admin";
  }
  return value;
}

export function useAuth(requiredRole?: string, options: UseAuthOptions = {}) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const allowAdmin = options.allowAdmin ?? true;

  useEffect(() => {
    const t = getToken();
    const raw = getUser() as (User & { _id?: string; fullName?: string }) | null;
    const u = raw
      ? {
          ...raw,
          id: String(raw.id || raw._id || "").trim(),
          role: normalizeUserRole(raw.role),
          name: String(raw.name || raw.fullName || "").trim(),
        }
      : null;

    if (!t || !u || !u.role) {
      setLoading(false);
      router.replace(getLoginRoute(requiredRole));
      return;
    }

    const roleMatches = !requiredRole || u.role === requiredRole || (allowAdmin && u.role === "admin");
    if (!roleMatches) {
      setLoading(false);
      if (requiredRole === "admin") {
        router.replace("/Admin/Login");
        return;
      }
      router.replace("/Portal");
      return;
    }

    setToken(t);
    setUser(u);
    setLoading(false);
  }, [router, requiredRole, allowAdmin]);

  return { user, token, loading };
}
