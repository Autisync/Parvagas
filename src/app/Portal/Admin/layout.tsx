"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { logoutCurrentSession } from "@/lib/api";
import { fetchAdminMe } from "./adminClient";
import { useClientLocale } from "@/lib/i18n/client";
import { ArrowRightOnRectangleIcon } from "@heroicons/react/24/outline";

const AdminSidebar = dynamic(() => import("./components/AdminSidebar"), {
  ssr: false,
  loading: () => <div className="h-80 app-card p-4 hidden lg:block" />,
});

const NotificationBell = dynamic(() => import("@/app/Portal/components/NotificationBell"), {
  ssr: false,
});

export default function AdminLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { token, user, loading } = useAuth("admin");
  const fallbackLevel = useMemo(
    () => (user?.adminLevel === "moderator" ? "moderator" : "super-admin"),
    [user?.adminLevel]
  );
  const [level, setLevel] = useState<"super-admin" | "moderator">(fallbackLevel);
  const { dict } = useClientLocale();

  useEffect(() => {
    setLevel(fallbackLevel);
  }, [fallbackLevel]);

  useEffect(() => {
    if (!token) return;
    fetchAdminMe(token)
      .then((me) => setLevel(me.adminLevel))
      .catch(() => {});
  }, [token]);

  const handleLogout = () => {
    logoutCurrentSession(token).finally(() => router.replace("/Admin/Login"));
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-4 border-red-600 border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white text-slate-900">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3">
          <span className="text-sm font-semibold uppercase tracking-[0.18em] text-red-600">Parvagas Admin</span>
          <div className="flex items-center gap-2">
            {token && <NotificationBell token={token} role="admin" />}
            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-1 text-sm font-semibold text-red-700 transition hover:bg-red-100"
            >
              <ArrowRightOnRectangleIcon className="h-4 w-4" />
              <span className="hidden sm:inline">{dict.portal.admin.logout}</span>
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 pb-16 pt-8 pb-24 lg:pb-16">
        <div className="grid gap-6 lg:grid-cols-[260px,1fr] lg:items-start">
          <AdminSidebar
            level={level}
            identity={{
              name: (user as { fullName?: string; name?: string } | null)?.fullName || user?.name || "Admin",
              email: user?.email,
            }}
            onLogout={handleLogout}
          />
          <section className="min-w-0">{children}</section>
        </div>
      </main>
    </div>
  );
}
