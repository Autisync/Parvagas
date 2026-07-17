"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { authFetch, logoutCurrentSession } from "@/lib/api";
import { useClientLocale } from "@/lib/i18n/client";
import LocaleCompactControl from "@/app/components/ui/LocaleCompactControl";
import NotificationBell from "@/app/Portal/components/NotificationBell";
import CompanyTutorialModal from "./CompanyTutorialModal";
import PortalMobileNav, { type MobileNavItem } from "@/app/Portal/components/PortalMobileNav";
import {
  useCollapsibleSidebarShell,
  SIDEBAR_COLLAPSED_WIDTH,
  SIDEBAR_EXPANDED_WIDTH,
} from "@/app/Portal/components/useCollapsibleSidebarShell";
import {
  HomeIcon, BriefcaseIcon, ClipboardDocumentListIcon, BuildingOfficeIcon,
  UserGroupIcon, PlusCircleIcon, Cog6ToothIcon, CreditCardIcon, ChevronLeftIcon,
} from "@heroicons/react/24/outline";
import type { ReactNode } from "react";

const SIDEBAR_COLLAPSED_STORAGE_KEY = "companySidebarCollapsed";

/**
 * Owns the fixed left dock AND the matching content offset, mirroring
 * CandidatePortalShell — see that component for why the two must live
 * together and can't be split across separate components.
 */
export default function CompanyPortalShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { token, user } = useAuth("company");
  const { dict } = useClientLocale();
  const [doubleLogged, setDoubleLogged] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const {
    asideRef, manualCollapsed, collapsed, showExpanded, setHovering,
    topOffset, toggleManualCollapsed, labelClass,
  } = useCollapsibleSidebarShell(SIDEBAR_COLLAPSED_STORAGE_KEY);

  const role = String(user?.companyTeamRole || "").toLowerCase();
  const isApprover = role === "owner" || role === "manager" || user?.role === "admin";
  const canManageUsers = role === "owner";
  const companyName = (user as { fullName?: string; name?: string } | null)?.fullName || user?.name || "Empresa";
  const initial = companyName[0]?.toUpperCase() || "E";

  const baseItems: MobileNavItem[] = [
    { href: "/Portal/Empresa/Dashboard",     label: dict.portal.company.dashboard,    icon: <HomeIcon className="h-5 w-5" />,                  pinned: true },
    { href: "/Portal/Empresa/Minhas-Vagas",  label: dict.portal.company.jobs,         icon: <BriefcaseIcon className="h-5 w-5" />,             pinned: true },
    { href: "/Portal/Empresa/Candidaturas",  label: dict.portal.company.applications, icon: <ClipboardDocumentListIcon className="h-5 w-5" />, pinned: true },
    { href: "/Portal/Empresa/Perfil",        label: dict.portal.company.profile,      icon: <BuildingOfficeIcon className="h-5 w-5" />,        pinned: true },
    { href: "/Portal/Empresa/Nova-Vaga",     label: dict.portal.company.newJob,       icon: <PlusCircleIcon className="h-5 w-5" /> },
    { href: "/Portal/Empresa/Planos",        label: "Planos",                         icon: <CreditCardIcon className="h-5 w-5" /> },
    { href: "/Portal/Empresa/Definicoes",    label: dict.portal.company.settings,     icon: <Cog6ToothIcon className="h-5 w-5" /> },
  ];

  const navItems: MobileNavItem[] = [
    ...baseItems,
    ...(isApprover ? [{ href: "/Portal/Empresa/Aprovacoes", label: dict.portal.company.approvals, icon: <ClipboardDocumentListIcon className="h-5 w-5" /> }] : []),
    ...(canManageUsers ? [{ href: "/Portal/Empresa/Utilizadores", label: dict.portal.company.users, icon: <UserGroupIcon className="h-5 w-5" /> }] : []),
  ];

  const handleSignout = () => logoutCurrentSession(token);

  function isActive(href: string) {
    return pathname === href || pathname.startsWith(href + "/");
  }

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    let timer: number | undefined;
    const tick = async () => {
      try {
        await authFetch("/companies/presence/heartbeat", token, { method: "POST", suppressGlobalErrors: true });
        const status = await authFetch<{ isDoubleLogged: boolean }>("/companies/presence/status", token, { suppressGlobalErrors: true });
        if (!cancelled) setDoubleLogged(Boolean(status.isDoubleLogged));
      } catch {
        if (!cancelled) setDoubleLogged(false);
      }
    };
    tick();
    timer = window.setInterval(tick, 20000);
    return () => { cancelled = true; if (timer !== undefined) window.clearInterval(timer); };
  }, [token]);

  return (
    <>
      {/* Desktop sidebar — docked flush to the true viewport left edge,
          full height below the sticky top bar, matching the candidate
          portal's collapsible rail. Hidden below lg; PortalMobileNav
          covers narrower widths. */}
      <aside
        ref={asideRef}
        onMouseEnter={() => setHovering(true)}
        onMouseLeave={() => setHovering(false)}
        className={[
          "fixed left-0 z-20 hidden flex-col overflow-y-auto overflow-x-hidden border-r border-slate-200 bg-white p-4 transition-[width,box-shadow] duration-300 ease-in-out lg:flex",
          showExpanded && collapsed ? "shadow-xl" : "shadow-sm",
        ].join(" ")}
        style={{
          top: topOffset,
          height: `calc(100vh - ${topOffset}px)`,
          width: showExpanded ? SIDEBAR_EXPANDED_WIDTH : SIDEBAR_COLLAPSED_WIDTH,
        }}
      >
        <div className="mb-2 flex items-center justify-between">
          {token && <NotificationBell token={token} role="company" teamRole={role} align="left" />}
          <button
            type="button"
            onClick={toggleManualCollapsed}
            title={manualCollapsed ? "Expandir menu" : "Minimizar menu"}
            aria-label={manualCollapsed ? "Expandir menu" : "Minimizar menu"}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
          >
            <ChevronLeftIcon
              className={`h-4 w-4 transition-transform duration-300 ease-in-out ${manualCollapsed ? "rotate-180" : ""}`}
            />
          </button>
        </div>
        <p className={`px-2 text-xs uppercase tracking-[0.18em] text-slate-500 ${labelClass()}`}>{dict.portal.company.role}</p>
        <nav className="mt-4 space-y-1">
          {navItems.map((item) => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                title={showExpanded ? undefined : item.label}
                className={[
                  "flex items-center gap-3 rounded-xl border px-3 py-2.5 text-sm font-medium transition",
                  active
                    ? "border-red-200 bg-red-50 text-red-800 shadow-sm"
                    : "border-transparent text-slate-700 hover:border-slate-200 hover:bg-slate-100 hover:text-slate-900",
                ].join(" ")}
              >
                <span className={`shrink-0 ${active ? "text-red-700" : "text-slate-500"}`}>{item.icon}</span>
                <span className={labelClass("flex-1")}>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="mt-8 border-t border-slate-200 pt-4">
          <div className={labelClass("mb-3")}>
            <LocaleCompactControl />
          </div>
          <div className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs font-semibold text-slate-700 ${collapsed && !showExpanded ? "justify-center" : ""}`}>
            <span
              className={`h-2.5 w-2.5 shrink-0 rounded-full ${doubleLogged ? "bg-amber-500" : "bg-green-400"}`}
              title={!showExpanded ? (doubleLogged ? dict.portal.company.doubleSession : dict.portal.company.singleSession) : undefined}
            />
            <span className={labelClass()}>{doubleLogged ? dict.portal.company.doubleSession : dict.portal.company.singleSession}</span>
          </div>
          <button
            type="button"
            onClick={handleSignout}
            title={showExpanded ? undefined : dict.portal.company.logout}
            className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm font-semibold text-red-700 hover:bg-red-100"
          >
            <span className={labelClass()}>{dict.portal.company.logout}</span>
          </button>
        </div>

        {token && user?.id ? (
          <CompanyTutorialModal token={token} userId={user.id} hasSeenTutorial={Boolean(user?.hasSeenEmpresaTutorial)} />
        ) : null}
      </aside>

      {/* Content offset — only tracks `collapsed`, so hovering the
          collapsed rail never shifts the page underneath it. */}
      <div
        className={collapsed ? "lg:pl-[76px]" : "lg:pl-[260px]"}
        style={{ transition: "padding-left 300ms ease-in-out" }}
      >
        {children}
      </div>

      {/* Mobile bottom nav + drawer */}
      <PortalMobileNav
        items={navItems}
        identity={{ name: companyName, email: user?.email, initial }}
        onLogout={handleSignout}
        drawerOpen={drawerOpen}
        onDrawerOpen={() => setDrawerOpen(true)}
        onDrawerClose={() => setDrawerOpen(false)}
        extra={<LocaleCompactControl />}
        headerAction={token ? <NotificationBell token={token} role="company" teamRole={role} align="left" /> : undefined}
      />
    </>
  );
}
