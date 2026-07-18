"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import type { AdminLevel } from "../adminClient";
import { useClientLocale } from "@/lib/i18n/client";
import LocaleCompactControl from "@/app/components/ui/LocaleCompactControl";
import PortalMobileNav, { type MobileNavItem } from "@/app/Portal/components/PortalMobileNav";
import {
  HomeIcon, ChartBarIcon, BriefcaseIcon, BuildingOffice2Icon,
  CloudArrowDownIcon, MegaphoneIcon, UsersIcon, ShieldCheckIcon,
  ShieldExclamationIcon, ClipboardDocumentListIcon, ArrowRightOnRectangleIcon, NewspaperIcon,
  RocketLaunchIcon, AdjustmentsHorizontalIcon, CheckBadgeIcon, CreditCardIcon, Cog6ToothIcon,
  DocumentTextIcon, ClockIcon, ChevronDownIcon,
} from "@heroicons/react/24/outline";

type Item = MobileNavItem & {
  hint: string;
  levels: AdminLevel[];
};

type Group = {
  key: string;
  label: string;
  items: Item[];
};

// Top-level entries stay outside any group — they're the two "home" views.
const TOP_ITEMS: Item[] = [
  { href: "/Portal/Admin",           label: "Dashboard", hint: "Resumo executivo", levels: ["super-admin", "moderator"], icon: <HomeIcon className="h-5 w-5" />,     pinned: true },
  { href: "/Portal/Admin/analytics", label: "Analytics", hint: "KPIs por período", levels: ["super-admin", "moderator"], icon: <ChartBarIcon className="h-5 w-5" />, pinned: false },
];

const GROUPS: Group[] = [
  {
    key: "moderacao",
    label: "Moderação",
    items: [
      { href: "/Portal/Admin/jobs",      label: "Vagas",        hint: "Moderação",       levels: ["super-admin", "moderator"], icon: <BriefcaseIcon className="h-5 w-5" />,        pinned: true },
      { href: "/Portal/Admin/companies", label: "Empresas",     hint: "Verificação",     levels: ["super-admin", "moderator"], icon: <BuildingOffice2Icon className="h-5 w-5" />,  pinned: true },
      { href: "/Portal/Admin/users",     label: "Utilizadores", hint: "Acesso e estado", levels: ["super-admin", "moderator"], icon: <UsersIcon className="h-5 w-5" />,            pinned: true },
      { href: "/Portal/Admin/scraped",   label: "Scraped Jobs", hint: "Curadoria",       levels: ["super-admin", "moderator"], icon: <CloudArrowDownIcon className="h-5 w-5" /> },
    ],
  },
  {
    key: "conteudo",
    label: "Conteúdo & Marketing",
    items: [
      { href: "/Portal/Admin/blog",             label: "Conteúdo",     hint: "Dicas de Carreira / Blog", levels: ["super-admin", "moderator"], icon: <NewspaperIcon className="h-5 w-5" /> },
      { href: "/Portal/Admin/ads",              label: "Campanhas",    hint: "Ads e placements",         levels: ["super-admin"],              icon: <MegaphoneIcon className="h-5 w-5" /> },
      { href: "/Portal/Admin/resume-templates", label: "Templates CV", hint: "Modelos de currículo",     levels: ["super-admin"],              icon: <DocumentTextIcon className="h-5 w-5" /> },
    ],
  },
  {
    key: "negocio",
    label: "Negócio",
    items: [
      { href: "/Portal/Admin/subscriptions", label: "Subscrições",     hint: "Planos e pagamentos", levels: ["super-admin"], icon: <CreditCardIcon className="h-5 w-5" /> },
      { href: "/Portal/Admin/exports",       label: "Exportações CSV", hint: "Dados operacionais",  levels: ["super-admin"], icon: <CloudArrowDownIcon className="h-5 w-5" /> },
    ],
  },
  {
    key: "seguranca",
    label: "Segurança & Acesso",
    items: [
      { href: "/Portal/Admin/security",     label: "Segurança",   hint: "Logins falhados e alertas", levels: ["super-admin"], icon: <ShieldExclamationIcon className="h-5 w-5" /> },
      { href: "/Portal/Admin/audit",        label: "Auditoria",   hint: "Ações privilegiadas",       levels: ["super-admin"], icon: <ClipboardDocumentListIcon className="h-5 w-5" /> },
      { href: "/Portal/Admin/admin-levels", label: "Super-admin", hint: "Admins e moderadores",      levels: ["super-admin"], icon: <ShieldCheckIcon className="h-5 w-5" /> },
    ],
  },
  {
    key: "operacoes",
    label: "Operações",
    items: [
      { href: "/Portal/Admin/scraper-config",   label: "Scraper Config",    hint: "Fontes e afinação",              levels: ["super-admin"], icon: <AdjustmentsHorizontalIcon className="h-5 w-5" /> },
      { href: "/Portal/Admin/task-runs",        label: "Tarefas Agendadas", hint: "Estado das tarefas periódicas",  levels: ["super-admin"], icon: <ClockIcon className="h-5 w-5" /> },
      { href: "/Portal/Admin/launch-readiness", label: "Launch Readiness",  hint: "Checklist de produção",          levels: ["super-admin"], icon: <CheckBadgeIcon className="h-5 w-5" /> },
      { href: "/Portal/Admin/deploy",           label: "Deploy",            hint: "Lançar para produção",           levels: ["super-admin"], icon: <RocketLaunchIcon className="h-5 w-5" /> },
      { href: "/Portal/Admin/settings",         label: "Definições",        hint: "Interruptores de negócio",       levels: ["super-admin"], icon: <Cog6ToothIcon className="h-5 w-5" /> },
    ],
  },
];

// Flat list preserved for the mobile bottom-nav/drawer, which has its own
// layout and doesn't do grouping.
const ALL_ITEMS: Item[] = [...TOP_ITEMS, ...GROUPS.flatMap((group) => group.items)];

export default function AdminSidebar({
  level,
  identity,
  onLogout,
}: {
  level: AdminLevel;
  identity?: { name?: string; email?: string };
  onLogout?: () => void;
}) {
  const pathname = usePathname();
  const { dict } = useClientLocale();
  const [drawerOpen, setDrawerOpen] = useState(false);

  function isActive(href: string) {
    return href === "/Portal/Admin" ? pathname === href : pathname.startsWith(href);
  }

  const activeGroupKey = GROUPS.find((group) => group.items.some((item) => isActive(item.href)))?.key ?? null;

  // Every group starts closed — the effect below force-opens the one
  // holding the active route, so the user always lands with their current
  // section visible and just needs the chevron to explore the rest.
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(
    () => Object.fromEntries(GROUPS.map((group) => [group.key, false])),
  );

  useEffect(() => {
    if (activeGroupKey) {
      setOpenGroups((current) => (current[activeGroupKey] ? current : { ...current, [activeGroupKey]: true }));
    }
  }, [activeGroupKey]);

  const visibleItems = ALL_ITEMS.filter((item) => item.levels.includes(level));
  const initial = String(identity?.name || "A").trim().charAt(0).toUpperCase();
  const roleLabel = level === "super-admin" ? dict.portal.admin.superAdminConsole : dict.portal.admin.moderatorConsole;

  const renderItem = (item: Item) => {
    const active = isActive(item.href);
    return (
      <Link
        key={item.href}
        href={item.href}
        aria-current={active ? "page" : undefined}
        className={[
          "flex items-center gap-3 rounded-xl border px-3 py-2.5 text-sm font-medium transition",
          active
            ? "border-red-200 bg-red-50 text-red-800 shadow-sm"
            : "border-transparent text-slate-700 hover:border-slate-200 hover:bg-slate-100 hover:text-slate-900",
        ].join(" ")}
      >
        <span className={active ? "text-red-700" : "text-slate-500"}>{item.icon}</span>
        <span className="min-w-0">
          <span className="block font-semibold">{item.label}</span>
          <span className="mt-0.5 block text-xs opacity-75">{item.hint}</span>
        </span>
      </Link>
    );
  };

  return (
    <>
      {/* Desktop sidebar — hidden on mobile. max-h + overflow-y-auto so the
          nav list scrolls within itself once it's taller than the viewport
          (this list has grown past a dozen items), instead of relying on
          the whole page to scroll past a sticky element. */}
      <aside id="admin-sidebar" className="hidden h-fit max-h-[calc(100vh-2rem)] overflow-y-auto lg:block app-card p-4 lg:sticky lg:top-4">
        <div className="rounded-2xl bg-slate-950 p-4 text-white">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-red-300">{dict.portal.admin.roleLabel}</p>
          <p className="mt-2 text-lg font-bold">{roleLabel}</p>
          <p className="mt-1 text-xs leading-5 text-slate-300">
            {level === "super-admin" ? dict.portal.admin.superAdminDescription : dict.portal.admin.moderatorDescription}
          </p>
        </div>

        <div className="mt-4 flex items-center gap-2 px-2 py-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-50 text-sm font-bold text-red-700 ring-1 ring-red-100">
            {initial}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-900">{identity?.name || "Admin"}</p>
            <p className="truncate text-xs text-slate-500">{identity?.email || roleLabel}</p>
          </div>
        </div>

        <nav className="mt-6 space-y-1">
          {TOP_ITEMS.filter((item) => item.levels.includes(level)).map(renderItem)}

          {GROUPS.map((group) => {
            const groupItems = group.items.filter((item) => item.levels.includes(level));
            if (groupItems.length === 0) return null;
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
                {open ? <div className="mt-1 space-y-1">{groupItems.map(renderItem)}</div> : null}
              </div>
            );
          })}
        </nav>

        <div className="mt-8 border-t border-slate-200 pt-4">
          <LocaleCompactControl className="mb-3" />
          <button
            type="button"
            onClick={onLogout}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm font-semibold text-red-700 transition hover:bg-red-100"
          >
            <ArrowRightOnRectangleIcon className="h-4 w-4" />
            {dict.portal.admin.logout}
          </button>
        </div>
      </aside>

      {/* Mobile bottom nav + drawer */}
      <PortalMobileNav
        items={visibleItems}
        identity={{ name: identity?.name || "Admin", email: identity?.email, initial }}
        onLogout={onLogout ?? (() => {})}
        drawerOpen={drawerOpen}
        onDrawerOpen={() => setDrawerOpen(true)}
        onDrawerClose={() => setDrawerOpen(false)}
        extra={<LocaleCompactControl />}
      />
    </>
  );
}
