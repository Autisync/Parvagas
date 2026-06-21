"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { AdminPermissions, fetchAdminMe, fetchOverview, fetchAnalytics, hasPermission, type AdminMe } from "./adminClient";
import { AdminPageHeader } from "./components/AdminUI";
import { useClientLocale } from "@/lib/i18n/client";
import InlineErrorState from "@/app/components/errors/InlineErrorState";
import { StatCard } from "@/app/components/motion";
import {
  UsersIcon,
  BuildingOffice2Icon,
  BriefcaseIcon,
  GlobeAltIcon,
  MegaphoneIcon,
  ClipboardDocumentCheckIcon,
  ShieldCheckIcon,
  ArrowRightIcon,
  ArrowDownTrayIcon,
  DocumentMagnifyingGlassIcon,
} from "@heroicons/react/24/outline";

type Overview = {
  users: number;
  companies: number;
  jobs: number;
  scraped: number;
  ads: number;
};

type Analytics = {
  pendingJobs: number;
  pendingCompanies: number;
  suspendedUsers: number;
  pendingScraped: number;
};

const quickLinks = [
  { href: "/Portal/Admin/jobs", title: "Fila de vagas", desc: "Modere vagas, aprove, rejeite ou arquive.", icon: BriefcaseIcon },
  { href: "/Portal/Admin/companies", title: "Verificação de empresas", desc: "Valide empresas e reduza risco operacional.", icon: BuildingOffice2Icon },
  { href: "/Portal/Admin/users", title: "Gestão de utilizadores", desc: "Suspenda, reative e audite acessos.", icon: UsersIcon },
  { href: "/Portal/Admin/ads", title: "Campanhas", desc: "Crie e mantenha campanhas e placements.", icon: MegaphoneIcon },
  { href: "/Portal/Admin/admin-levels", title: "Super-admin", desc: "Promova ou demova níveis administrativos com registo auditável.", icon: ShieldCheckIcon },
  { href: "/Portal/Admin/audit", title: "Auditoria", desc: "Inspecione ações privilegiadas e eventos sensíveis do sistema.", icon: DocumentMagnifyingGlassIcon },
  { href: "/Portal/Admin/exports", title: "Exportar CSV", desc: "Extraia dados de utilizadores, vagas e empresas.", icon: ArrowDownTrayIcon },
];

export default function AdminOverviewPage() {
  const { token } = useAuth("admin");
  const { dict } = useClientLocale();
  const [overview, setOverview] = useState<Overview | null>(null);
  const [ops, setOps] = useState<Analytics | null>(null);
  const [me, setMe] = useState<AdminMe | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!token) return;
    setError("");
    try {
      const [o, a, currentAdmin] = await Promise.all([fetchOverview(token), fetchAnalytics(token), fetchAdminMe(token)]);
      setOverview(o);
      setOps(a.operational);
      setMe(currentAdmin);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erro ao carregar dashboard.");
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div>
      <AdminPageHeader
        eyebrow="Admin Console"
        title={dict.portal.admin.dashboardTitle}
        description={dict.portal.admin.dashboardDescription}
      />

      {error && (
        <div className="mt-6">
          <InlineErrorState onAction={load} />
        </div>
      )}

      <section className="mt-6 grid gap-4 pv-stagger sm:grid-cols-2 xl:grid-cols-5">
        <StatCard label="Utilizadores" value={overview?.users ?? 0} tone="brand" icon={<UsersIcon className="h-5 w-5" />} />
        <StatCard label="Empresas" value={overview?.companies ?? 0} tone="info" icon={<BuildingOffice2Icon className="h-5 w-5" />} />
        <StatCard label="Vagas" value={overview?.jobs ?? 0} tone="brand" icon={<BriefcaseIcon className="h-5 w-5" />} />
        <StatCard label="Scraped" value={overview?.scraped ?? 0} tone="warning" icon={<GlobeAltIcon className="h-5 w-5" />} />
        <StatCard label="Campanhas" value={overview?.ads ?? 0} tone="success" icon={<MegaphoneIcon className="h-5 w-5" />} />
      </section>

      {/* Operational attention strip */}
      <section className="mt-4 grid gap-3 sm:grid-cols-3">
        {[
          { label: "Vagas pendentes", value: ops?.pendingJobs ?? 0, href: "/Portal/Admin/jobs", icon: ClipboardDocumentCheckIcon },
          { label: "Empresas por verificar", value: ops?.pendingCompanies ?? 0, href: "/Portal/Admin/companies", icon: BuildingOffice2Icon },
          { label: "Utilizadores suspensos", value: ops?.suspendedUsers ?? 0, href: "/Portal/Admin/users", icon: UsersIcon },
        ].map((item) => (
          <Link key={item.label} href={item.href} className="app-card app-card-interactive flex items-center gap-3 p-4">
            <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--brand-50)] text-[var(--brand-600)]">
              <item.icon className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="text-xl font-bold leading-tight text-[var(--text-strong)]">{item.value}</p>
              <p className="truncate text-xs text-[var(--text-muted)]">{item.label}</p>
            </div>
          </Link>
        ))}
      </section>

      <section className="mt-8">
        <h2 className="mb-3 text-sm font-semibold text-[var(--text-muted)]">Acesso rápido</h2>
        <div className="grid gap-4 pv-stagger md:grid-cols-2 xl:grid-cols-3">
          {quickLinks
            .filter((link) => {
              if (link.href === "/Portal/Admin/ads") return hasPermission(me, AdminPermissions.ADS_MANAGE);
              if (link.href === "/Portal/Admin/admin-levels") return hasPermission(me, AdminPermissions.ADMINS_PROMOTE);
              if (link.href === "/Portal/Admin/audit") return hasPermission(me, AdminPermissions.AUDIT_LOGS_VIEW);
              if (link.href === "/Portal/Admin/exports") return hasPermission(me, AdminPermissions.EXPORT_USERS);
              return true;
            })
            .map((link) => (
              <Link key={link.href} href={link.href} className="app-card app-card-interactive group flex items-start gap-4 p-5">
                <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--brand-50)] text-[var(--brand-600)] transition-colors group-hover:bg-[var(--brand-600)] group-hover:text-white">
                  <link.icon className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1 font-bold text-[var(--text-strong)]">
                    {link.title}
                    <ArrowRightIcon className="h-4 w-4 -translate-x-1 opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100 text-[var(--brand-600)]" />
                  </p>
                  <p className="mt-1 text-sm text-[var(--text-muted)]">{link.desc}</p>
                </div>
              </Link>
            ))}
        </div>
      </section>
    </div>
  );
}
