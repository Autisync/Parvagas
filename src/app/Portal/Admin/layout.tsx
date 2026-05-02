"use client";

import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { clearToken } from "@/lib/api";
import AdminSidebar from "./components/AdminSidebar";
import { fetchAdminMe } from "./adminClient";
import { useClientLocale } from "@/lib/i18n/client";

export default function AdminLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { token, user, loading } = useAuth("admin");
  const pathname = usePathname();
  const fallbackLevel = useMemo(
    () => (user?.adminLevel === "moderator" ? "moderator" : "super-admin"),
    [user?.adminLevel]
  );
  const [level, setLevel] = useState<"super-admin" | "moderator">(fallbackLevel);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { dict } = useClientLocale();

  const breadcrumb = useMemo(() => {
    const parts = String(pathname || "/Portal/Admin")
      .split("/")
      .filter(Boolean)
      .slice(1);
    return parts.map((part) => part.replace(/-/g, " ").replace(/\b\w/g, (m) => m.toUpperCase()));
  }, [pathname]);

  useEffect(() => {
    setLevel(fallbackLevel);
  }, [fallbackLevel]);

  useEffect(() => {
    if (!token) return;
    fetchAdminMe(token)
      .then((me) => setLevel(me.adminLevel))
      .catch(() => {
        // Keep fallback level from local session if /admin/me fails.
      });
  }, [token]);

  const handleLogout = () => {
    clearToken();
    router.replace("/Admin/Login");
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-4 border-red-600 border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-red-600">Parvagas Admin</p>
            <p className="text-sm font-semibold text-slate-900">{level === "super-admin" ? dict.portal.admin.superAdminConsole : dict.portal.admin.moderatorConsole}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-red-200 hover:text-red-700 lg:hidden"
              onClick={() => setSidebarOpen((prev) => !prev)}
              aria-expanded={sidebarOpen}
              aria-controls="admin-sidebar"
            >
              {sidebarOpen ? dict.portal.admin.menuClose : dict.portal.admin.menuOpen}
            </button>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700">
              {level}
            </span>
            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-red-200 hover:text-red-700"
              aria-label={dict.portal.admin.logout}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                className="h-4 w-4"
                aria-hidden="true"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6A2.25 2.25 0 005.25 5.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M18 12H9m0 0l3-3m-3 3l3 3" />
              </svg>
              {dict.portal.admin.logout}
            </button>
            <Link href="/Login" className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-red-200 hover:text-red-700">
              {dict.portal.admin.publicLogin}
            </Link>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-4 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs text-slate-500 shadow-sm" aria-label="Breadcrumb">
          {dict.portal.admin.breadcrumbRoot}
          {breadcrumb.length ? ` / ${breadcrumb.join(" / ")}` : ` / ${dict.portal.admin.dashboardTitle}`}
        </div>
        <div className="grid gap-6 lg:grid-cols-[280px,1fr]">
          <AdminSidebar level={level} open={sidebarOpen} onNavigate={() => setSidebarOpen(false)} />
          <section className="min-w-0">{children}</section>
        </div>
      </main>
    </div>
  );
}
