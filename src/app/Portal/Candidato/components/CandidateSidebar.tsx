"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { logoutCurrentSession, authFetch } from "@/lib/api";
import { useClientLocale } from "@/lib/i18n/client";
import LocaleCompactControl from "@/app/components/ui/LocaleCompactControl";
import PortalMobileNav, { type MobileNavItem } from "@/app/Portal/components/PortalMobileNav";
import {
  useCollapsibleSidebarShell,
  SIDEBAR_COLLAPSED_WIDTH,
  SIDEBAR_EXPANDED_WIDTH,
} from "@/app/Portal/components/useCollapsibleSidebarShell";
import {
  HomeIcon, UserIcon, DocumentIcon, HeartIcon, SparklesIcon,
  BriefcaseIcon, CheckCircleIcon, BellIcon, CogIcon, RocketLaunchIcon,
  PencilSquareIcon, ChevronLeftIcon, ArrowRightOnRectangleIcon, ChevronDownIcon,
} from "@heroicons/react/24/outline";
import { useEffect, useState, type ReactNode } from "react";

const SIDEBAR_COLLAPSED_STORAGE_KEY = "candidateSidebarCollapsed";
const BUILDER_ROUTE = "/Portal/Candidato/Construtor-CV";

type NavGroup = { key: string; label: string; items: MobileNavItem[] };

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

  const isBuilderRoute = pathname?.startsWith(BUILDER_ROUTE) ?? false;
  // isBuilderRoute is known synchronously from the URL, so it can force the
  // collapse before hydration without a flash of the expanded sidebar.
  const {
    asideRef, manualCollapsed, collapsed, showExpanded, setHovering,
    topOffset, toggleManualCollapsed, labelClass,
  } = useCollapsibleSidebarShell(SIDEBAR_COLLAPSED_STORAGE_KEY, isBuilderRoute);

  useEffect(() => {
    if (!token) return;
    authFetch<{ profile?: { completionScore?: number } }>("/candidates/profile", token, { suppressGlobalErrors: true })
      .then((d) => setProfileCompletion(d.profile?.completionScore ?? null))
      .catch(() => {});
  }, [token]);

  // Top-level entries stay outside any group — the two "home" views a
  // candidate returns to most.
  const topItems: MobileNavItem[] = [
    { href: "/Portal/Candidato/Dashboard",    label: dict.portal.candidate.dashboard,    icon: <HomeIcon className="h-5 w-5" />,        pinned: true },
    { href: "/Portal/Candidato/Candidaturas", label: dict.portal.candidate.applications, icon: <CheckCircleIcon className="h-5 w-5" />, pinned: true },
  ];

  const groups: NavGroup[] = [
    {
      key: "vagas",
      label: "Vagas",
      items: [
        { href: "/Portal/Candidato/Vagas-Disponiveis",  label: dict.portal.candidate.jobs,        icon: <BriefcaseIcon className="h-5 w-5" /> },
        { href: "/Portal/Candidato/Vagas-Recomendadas", label: dict.portal.candidate.recommended, icon: <SparklesIcon className="h-5 w-5" /> },
        { href: "/Portal/Candidato/Vagas-Guardadas",    label: dict.portal.candidate.saved,       icon: <HeartIcon className="h-5 w-5" /> },
        { href: "/Portal/Candidato/Alertas",            label: dict.portal.candidate.alerts,      icon: <BellIcon className="h-5 w-5" /> },
      ],
    },
    {
      key: "perfil-cv",
      label: "Perfil & CV",
      items: [
        { href: "/Portal/Candidato/Meu-Perfil",      label: dict.portal.candidate.profile, icon: <UserIcon className="h-5 w-5" /> },
        { href: "/Portal/Candidato/Onboarding",      label: "Configurar Perfil",           icon: <RocketLaunchIcon className="h-5 w-5" /> },
        { href: "/Portal/Candidato/CV-e-Documentos", label: dict.portal.candidate.cvDocs,  icon: <DocumentIcon className="h-5 w-5" /> },
        { href: "/Portal/Candidato/Construtor-CV",   label: dict.portal.candidate.cvBuilder, icon: <PencilSquareIcon className="h-5 w-5" /> },
      ],
    },
    {
      key: "conta",
      label: "Conta",
      items: [
        { href: "/Portal/Candidato/Definicoes", label: dict.portal.candidate.settings, icon: <CogIcon className="h-5 w-5" /> },
      ],
    },
  ];

  // Flat list for the mobile bottom-nav/drawer, which has its own layout
  // and doesn't do grouping.
  const navItems: MobileNavItem[] = [...topItems, ...groups.flatMap((group) => group.items)];

  const handleSignout = () => logoutCurrentSession(token);

  function isActive(href: string) {
    return pathname === href || pathname.startsWith(href);
  }

  const activeGroupKey = groups.find((group) => group.items.some((item) => isActive(item.href)))?.key ?? null;

  // Every group starts closed — the effect below force-opens the one
  // holding the active route, so the user always lands with their current
  // section visible and just needs the chevron to explore the rest.
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(
    () => Object.fromEntries(groups.map((group) => [group.key, false])),
  );

  useEffect(() => {
    if (activeGroupKey) {
      setOpenGroups((current) => (current[activeGroupKey] ? current : { ...current, [activeGroupKey]: true }));
    }
  }, [activeGroupKey]);

  const renderNavItem = (item: MobileNavItem) => {
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
  };

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
          width: showExpanded ? SIDEBAR_EXPANDED_WIDTH : SIDEBAR_COLLAPSED_WIDTH,
        }}
      >
          {!isBuilderRoute && (
            <div className="mb-2 flex items-center justify-end">
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
          )}

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
            {showExpanded ? (
              <>
                {topItems.map(renderNavItem)}
                {groups.map((group) => {
                  const open = Boolean(openGroups[group.key]);
                  const containsActive = group.key === activeGroupKey;
                  return (
                    <div key={group.key} className="pt-2">
                      <button
                        type="button"
                        onClick={() => setOpenGroups((current) => ({ ...current, [group.key]: !open }))}
                        aria-expanded={open}
                        className={[
                          "flex w-full items-center justify-between rounded-lg px-3 py-1.5 text-xs font-semibold uppercase tracking-wide transition",
                          containsActive ? "text-red-700" : "text-slate-500 hover:text-slate-800",
                        ].join(" ")}
                      >
                        <span>{group.label}</span>
                        <ChevronDownIcon className={`h-4 w-4 transition-transform ${open ? "" : "-rotate-90"}`} />
                      </button>
                      {open ? <div className="mt-1 space-y-1">{group.items.map(renderNavItem)}</div> : null}
                    </div>
                  );
                })}
              </>
            ) : (
              navItems.map(renderNavItem)
            )}
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
      />
    </>
  );
}
