"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { AdminLevel } from "../adminClient";
import { useClientLocale } from "@/lib/i18n/client";
import LocaleCompactControl from "@/app/components/ui/LocaleCompactControl";
import {
  HomeIcon,
  ChartBarIcon,
  BriefcaseIcon,
  BuildingOffice2Icon,
  CloudArrowDownIcon,
  MegaphoneIcon,
  UsersIcon,
  ShieldCheckIcon,
  ClipboardDocumentListIcon,
  ArrowRightOnRectangleIcon,
} from "@heroicons/react/24/outline";

type Item = {
  href: string;
  label: string;
  hint: string;
  levels: AdminLevel[];
  icon: React.ReactNode;
};

const items: Item[] = [
  {
    href: "/Portal/Admin",
    label: "Dashboard",
    hint: "Resumo executivo",
    levels: ["super-admin", "moderator"],
    icon: <HomeIcon className="h-5 w-5" />,
  },
  {
    href: "/Portal/Admin/analytics",
    label: "Analytics",
    hint: "KPIs por período",
    levels: ["super-admin", "moderator"],
    icon: <ChartBarIcon className="h-5 w-5" />,
  },
  {
    href: "/Portal/Admin/jobs",
    label: "Vagas",
    hint: "Moderação",
    levels: ["super-admin", "moderator"],
    icon: <BriefcaseIcon className="h-5 w-5" />,
  },
  {
    href: "/Portal/Admin/companies",
    label: "Empresas",
    hint: "Verificação",
    levels: ["super-admin", "moderator"],
    icon: <BuildingOffice2Icon className="h-5 w-5" />,
  },
  {
    href: "/Portal/Admin/scraped",
    label: "Scraped Jobs",
    hint: "Curadoria",
    levels: ["super-admin", "moderator"],
    icon: <CloudArrowDownIcon className="h-5 w-5" />,
  },
  {
    href: "/Portal/Admin/users",
    label: "Utilizadores",
    hint: "Acesso e estado",
    levels: ["super-admin", "moderator"],
    icon: <UsersIcon className="h-5 w-5" />,
  },
  {
    href: "/Portal/Admin/ads",
    label: "Campanhas",
    hint: "Ads e placements",
    levels: ["super-admin"],
    icon: <MegaphoneIcon className="h-5 w-5" />,
  },
  {
    href: "/Portal/Admin/admin-levels",
    label: "Super-admin",
    hint: "Admins e moderadores",
    levels: ["super-admin"],
    icon: <ShieldCheckIcon className="h-5 w-5" />,
  },
  {
    href: "/Portal/Admin/audit",
    label: "Auditoria",
    hint: "Ações privilegiadas",
    levels: ["super-admin"],
    icon: <ClipboardDocumentListIcon className="h-5 w-5" />,
  },
  {
    href: "/Portal/Admin/exports",
    label: "Exportações CSV",
    hint: "Dados operacionais",
    levels: ["super-admin"],
    icon: <CloudArrowDownIcon className="h-5 w-5" />,
  },
];

export default function AdminSidebar({
  level,
  identity,
  open = false,
  onNavigate,
  onLogout,
}: {
  level: AdminLevel;
  identity?: { name?: string; email?: string };
  open?: boolean;
  onNavigate?: () => void;
  onLogout?: () => void;
}) {
  const pathname = usePathname();
  const { dict } = useClientLocale();
  const visibleItems = items.filter((item) => item.levels.includes(level));
  const initial = String(identity?.name || "A").trim().charAt(0).toUpperCase();
  const roleLabel = level === "super-admin" ? dict.portal.admin.superAdminConsole : dict.portal.admin.moderatorConsole;

  return (
    <aside
      id="admin-sidebar"
      className={[
        "h-fit app-card p-4",
        open ? "block" : "hidden",
        "lg:sticky lg:top-4 lg:block",
      ].join(" ")}
    >
      <div className="rounded-2xl bg-slate-950 p-4 text-white">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-red-300">{dict.portal.admin.roleLabel}</p>
        <p className="mt-2 text-lg font-bold">{level === "super-admin" ? dict.portal.admin.superAdminConsole : dict.portal.admin.moderatorConsole}</p>
        <p className="mt-1 text-xs leading-5 text-slate-300">{level === "super-admin" ? dict.portal.admin.superAdminDescription : dict.portal.admin.moderatorDescription}</p>
      </div>

      <div className="mt-4 flex items-center gap-2 px-2 py-2">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-50 text-sm font-bold text-red-700 ring-1 ring-red-100">
          {initial || "A"}
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-900">{identity?.name || "Admin"}</p>
          <p className="truncate text-xs text-slate-500">{identity?.email || roleLabel}</p>
        </div>
      </div>

      <nav className="mt-6 space-y-1">
        {visibleItems.map((item) => {
          const active = item.href === "/Portal/Admin" ? pathname === item.href : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
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
  );
}
