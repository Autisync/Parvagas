"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { AdminLevel } from "../adminClient";
import { useClientLocale } from "@/lib/i18n/client";
import LocaleCompactControl from "@/app/components/ui/LocaleCompactControl";

type Item = {
  href: string;
  label: string;
  hint: string;
  levels: AdminLevel[];
};

const items: Item[] = [
  { href: "/Portal/Admin", label: "Dashboard", hint: "Resumo executivo", levels: ["super-admin", "moderator"] },
  { href: "/Portal/Admin/analytics", label: "Analytics", hint: "KPIs por período", levels: ["super-admin", "moderator"] },
  { href: "/Portal/Admin/jobs", label: "Vagas", hint: "Moderação", levels: ["super-admin", "moderator"] },
  { href: "/Portal/Admin/companies", label: "Empresas", hint: "Verificação", levels: ["super-admin", "moderator"] },
  { href: "/Portal/Admin/scraped", label: "Scraped Jobs", hint: "Curadoria", levels: ["super-admin", "moderator"] },
  { href: "/Portal/Admin/users", label: "Utilizadores", hint: "Acesso e estado", levels: ["super-admin", "moderator"] },
  { href: "/Portal/Admin/ads", label: "Campanhas", hint: "Ads e placements", levels: ["super-admin"] },
  { href: "/Portal/Admin/admin-levels", label: "Super-admin", hint: "Admins e moderadores", levels: ["super-admin"] },
  { href: "/Portal/Admin/audit", label: "Auditoria", hint: "Ações privilegiadas", levels: ["super-admin"] },
  { href: "/Portal/Admin/exports", label: "Exportações CSV", hint: "Dados operacionais", levels: ["super-admin"] },
];

export default function AdminSidebar({
  level,
  open = false,
  onNavigate,
}: {
  level: AdminLevel;
  open?: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const { dict } = useClientLocale();
  const visibleItems = items.filter((item) => item.levels.includes(level));

  return (
    <aside
      id="admin-sidebar"
      className={[
        "h-fit rounded-3xl border border-slate-200 bg-white p-4 shadow-sm",
        open ? "block" : "hidden",
        "lg:sticky lg:top-24 lg:block",
      ].join(" ")}
    >
      <div className="rounded-2xl bg-slate-950 p-4 text-white">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-red-300">{dict.portal.admin.roleLabel}</p>
        <p className="mt-2 text-lg font-bold">{level === "super-admin" ? dict.portal.admin.superAdminConsole : dict.portal.admin.moderatorConsole}</p>
        <p className="mt-1 text-xs leading-5 text-slate-300">
          {level === "super-admin" ? dict.portal.admin.superAdminDescription : dict.portal.admin.moderatorDescription}
        </p>
      </div>

      <LocaleCompactControl className="mt-3" />

      <nav className="mt-4 grid gap-1.5">
        {visibleItems.map((item) => {
          const active = item.href === "/Portal/Admin" ? pathname === item.href : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={[
                "rounded-2xl border px-3 py-3 text-sm transition",
                active
                  ? "border-red-200 bg-red-50 text-red-800 shadow-sm"
                  : "border-transparent text-slate-700 hover:border-slate-200 hover:bg-slate-50 hover:text-slate-950",
              ].join(" ")}
            >
              <span className="block font-semibold">{item.label}</span>
              <span className="mt-0.5 block text-xs opacity-75">{item.hint}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
