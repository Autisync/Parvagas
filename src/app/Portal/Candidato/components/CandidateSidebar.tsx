"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { logoutCurrentSession, authFetch } from "@/lib/api";
import { useClientLocale } from "@/lib/i18n/client";
import LocaleCompactControl from "@/app/components/ui/LocaleCompactControl";
import NotificationBell from "@/app/Portal/components/NotificationBell";
import PortalMobileNav, { type MobileNavItem } from "@/app/Portal/components/PortalMobileNav";
import {
  HomeIcon, UserIcon, DocumentIcon, HeartIcon, SparklesIcon,
  BriefcaseIcon, CheckCircleIcon, BellIcon, CogIcon, RocketLaunchIcon,
  PencilSquareIcon, ChevronLeftIcon, ArrowRightOnRectangleIcon,
} from "@heroicons/react/24/outline";
import { useEffect, useRef, useState, type ReactNode } from "react";

const SIDEBAR_COLLAPSED_STORAGE_KEY = "candidateSidebarCollapsed";
const COLLAPSED_WIDTH = 76;
const EXPANDED_WIDTH = 260;
const BUILDER_ROUTE = "/Portal/Candidato/Construtor-CV";

/**
 * Owns the sidebar's collapse state AND the content offset, so the two
 * can never drift out of sync (the previous version reserved a fixed
 * 260px grid track regardless of collapse state, leaving a dead gap).
 * The <aside> docks to the true viewport edge via `fixed`; `children`
 * gets a matching left padding that only reacts to `collapsed`, never
 * to hover, so hover-to-reveal stays a non-reflowing overlay.
 */
export default function CandidatePortalShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { user, token } = useAuth("candidate");
  const { dict } = useClientLocale();
  const candidateName = (user as { fullName?: string; name?: string } | null)?.fullName || user?.name || "Candidato";
  const initial = candidateName[0]?.toUpperCase() || "C";

  const [profileCompletion, setProfileCompletion] = useState<number | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Manual minimize (persisted) and the CV builder's own forced-minimize —
  // independent signals, combined below. Hover only ever affects the visual
  // overlay, never these two.
  const [manualCollapsed, setManualCollapsed] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [hovering, setHovering] = useState(false);

  // The sticky top bar's real rendered height (it wraps to a taller row on
  // some widths) — measured rather than hardcoded so the dock always sits
  // flush beneath it instead of overlapping or leaving a gap.
  const [topOffset, setTopOffset] = useState(0);
  const asideRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const saved = window.localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY);
    if (saved === "1") setManualCollapsed(true);
    setHydrated(true);

    const header = document.querySelector("header");
    if (!header) return;
    const update = () => setTopOffset(header.getBoundingClientRect().height);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(header);
    return () => observer.disconnect();
  }, []);

  const isBuilderRoute = pathname?.startsWith(BUILDER_ROUTE) ?? false;
  // isBuilderRoute is known synchronously from the URL — applying it before
  // hydration avoids a flash of the expanded sidebar on first paint.
  // manualCollapsed comes from localStorage, so it can only apply once
  // mounted (the pre-hydration server render can't know it).
  const collapsed = isBuilderRoute || (hydrated && manualCollapsed);
  // Hover always reveals a collapsed rail in full — on the CV builder route
  // just as much as anywhere else. Only the collapse SOURCE differs
  // (forced by route vs. the user's own manual toggle); once collapsed,
  // hover-to-reveal behaves identically everywhere.
  const showExpanded = !collapsed || hovering;

  const toggleManualCollapsed = () => {
    setManualCollapsed((prev) => {
      const next = !prev;
      window.localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, next ? "1" : "0");
      return next;
    });
  };

  useEffect(() => {
    if (!token) return;
    authFetch<{ profile?: { completionScore?: number } }>("/candidates/profile", token, { suppressGlobalErrors: true })
      .then((d) => setProfileCompletion(d.profile?.completionScore ?? null))
      .catch(() => {});
  }, [token]);

  const navItems: MobileNavItem[] = [
    { href: "/Portal/Candidato/Dashboard",         label: dict.portal.candidate.dashboard,    icon: <HomeIcon className="h-5 w-5" />,          pinned: true },
    { href: "/Portal/Candidato/Candidaturas",      label: dict.portal.candidate.applications, icon: <CheckCircleIcon className="h-5 w-5" />,   pinned: true },
    { href: "/Portal/Candidato/Vagas-Disponiveis", label: dict.portal.candidate.jobs,         icon: <BriefcaseIcon className="h-5 w-5" />,     pinned: true },
    { href: "/Portal/Candidato/Meu-Perfil",        label: dict.portal.candidate.profile,      icon: <UserIcon className="h-5 w-5" />,          pinned: true },
    { href: "/Portal/Candidato/Onboarding",        label: "Configurar Perfil",                icon: <RocketLaunchIcon className="h-5 w-5" /> },
    { href: "/Portal/Candidato/CV-e-Documentos",   label: dict.portal.candidate.cvDocs,       icon: <DocumentIcon className="h-5 w-5" /> },
    { href: "/Portal/Candidato/Construtor-CV",     label: dict.portal.candidate.cvBuilder,    icon: <PencilSquareIcon className="h-5 w-5" /> },
    { href: "/Portal/Candidato/Vagas-Recomendadas",label: dict.portal.candidate.recommended,  icon: <SparklesIcon className="h-5 w-5" /> },
    { href: "/Portal/Candidato/Vagas-Guardadas",   label: dict.portal.candidate.saved,        icon: <HeartIcon className="h-5 w-5" /> },
    { href: "/Portal/Candidato/Alertas",           label: dict.portal.candidate.alerts,       icon: <BellIcon className="h-5 w-5" /> },
    { href: "/Portal/Candidato/Definicoes",        label: dict.portal.candidate.settings,     icon: <CogIcon className="h-5 w-5" /> },
  ];

  const handleSignout = () => logoutCurrentSession(token);

  function isActive(href: string) {
    return pathname === href || pathname.startsWith(href);
  }

  const labelClass = (extra = "") =>
    [
      "overflow-hidden whitespace-nowrap transition-[max-width,opacity,margin] duration-300 ease-out",
      showExpanded ? "max-w-[180px] opacity-100 delay-100" : "max-w-0 opacity-0 delay-0",
      extra,
    ].join(" ");

  return (
    <>
      {/* Desktop sidebar — docked flush to the true viewport left edge (not
          inside the centered max-w-7xl content column), full height below
          the sticky top bar. `fixed` takes it out of flow entirely, so
          hover-to-expand is a free overlay that never reflows `children` —
          only `collapsed` (never `hovering`) drives the content offset
          below, and the two can't drift apart since one component owns
          both. Hidden below lg; PortalMobileNav covers narrower widths. */}
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
          width: showExpanded ? EXPANDED_WIDTH : COLLAPSED_WIDTH,
        }}
      >
          <div className={`flex items-center justify-between gap-1 ${showExpanded || !isBuilderRoute ? "mb-2" : ""}`}>
            <div className={labelClass()}>
              {token && <NotificationBell token={token} role="candidate" align="left" />}
            </div>
            {!isBuilderRoute && (
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
            )}
          </div>

          <div className="flex items-center gap-2 px-2 py-2">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-red-50 text-sm font-bold text-red-700 ring-1 ring-red-100">
              {initial}
            </div>
            <div className={`min-w-0 ${labelClass()}`}>
              <p className="text-sm font-semibold text-slate-900 truncate">{candidateName}</p>
              <p className="text-xs text-slate-500 truncate">{user?.email}</p>
            </div>
          </div>

          <nav className="mt-6 space-y-1">
            {navItems.map((item) => {
              const active = isActive(item.href);
              const showDot = item.href === "/Portal/Candidato/Meu-Perfil" && profileCompletion !== null && profileCompletion < 100;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  title={showExpanded ? undefined : item.label}
                  className={[
                    "flex items-center gap-3 rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors",
                    active
                      ? "border-red-200 bg-red-50 text-red-800 shadow-sm"
                      : "border-transparent text-slate-700 hover:border-slate-200 hover:bg-slate-100 hover:text-slate-900",
                  ].join(" ")}
                >
                  <span className={`shrink-0 relative ${active ? "text-red-700" : "text-slate-500"}`}>
                    {item.icon}
                    {showDot && !showExpanded && (
                      <span className="absolute -right-0.5 -top-0.5 flex h-2 w-2">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
                        <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-500" />
                      </span>
                    )}
                  </span>
                  <span className={labelClass("flex-1")}>{item.label}</span>
                  {showDot && showExpanded && (
                    <span className="relative flex h-2.5 w-2.5 shrink-0" title={`Perfil ${profileCompletion}% completo`}>
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
                      <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-amber-500" />
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>

          <div className="mt-8 border-t border-slate-200 pt-4">
            <div className={labelClass("mb-3")}>
              <LocaleCompactControl />
            </div>
            <button
              type="button"
              onClick={handleSignout}
              title={showExpanded ? undefined : dict.portal.candidate.logout}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm font-semibold text-red-700 transition hover:bg-red-100"
            >
              <ArrowRightOnRectangleIcon className="h-4 w-4 shrink-0" />
              <span className={labelClass()}>{dict.portal.candidate.logout}</span>
            </button>
          </div>
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
        identity={{ name: candidateName, email: user?.email, initial }}
        onLogout={handleSignout}
        drawerOpen={drawerOpen}
        onDrawerOpen={() => setDrawerOpen(true)}
        onDrawerClose={() => setDrawerOpen(false)}
        extra={<LocaleCompactControl />}
        headerAction={token ? <NotificationBell token={token} role="candidate" align="left" /> : undefined}
      />
    </>
  );
}
