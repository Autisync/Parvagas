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
};

type UseAuthOptions = {
  allowAdmin?: boolean;
};

export function useAuth(requiredRole?: string, options: UseAuthOptions = {}) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const allowAdmin = options.allowAdmin ?? true;

  useEffect(() => {
    const t = getToken();
    const u = getUser() as User | null;
    if (!t || !u) {
      router.replace("/Login");
      return;
    }
    if (requiredRole && u.role !== requiredRole && !(allowAdmin && u.role === "admin")) {
      router.replace("/Portal");
      return;
    }
    setToken(t);
    setUser(u);
    setLoading(false);
  }, [router, requiredRole, allowAdmin]);

  return { user, token, loading };
}
