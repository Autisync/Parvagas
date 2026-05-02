"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { AdminPermissions, fetchAdminMe, fetchOverview, fetchAnalytics, hasPermission, type AdminMe } from "./adminClient";
import { AdminPageHeader } from "./components/AdminUI";
import { useAppNotifier } from "@/app/components/AppNotifier";
import { useClientLocale } from "@/lib/i18n/client";

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
  { href: "/Portal/Admin/jobs", title: "Fila de vagas", desc: "Modere vagas, aprove, rejeite ou arquive." },
  { href: "/Portal/Admin/companies", title: "Verificação de empresas", desc: "Valide empresas e reduza risco operacional." },
  { href: "/Portal/Admin/users", title: "Gestão de utilizadores", desc: "Suspenda, reative e audite acessos." },
  { href: "/Portal/Admin/ads", title: "Campanhas", desc: "Crie e mantenha campanhas e placements." },
  { href: "/Portal/Admin/admin-levels", title: "Super-admin", desc: "Promova ou demova níveis administrativos com registo auditável." },
  { href: "/Portal/Admin/audit", title: "Auditoria", desc: "Inspecione ações privilegiadas e eventos sensíveis do sistema." },
  { href: "/Portal/Admin/exports", title: "Exportar CSV", desc: "Extraia dados de utilizadores, vagas e empresas." },
];

export default function AdminOverviewPage() {
  const { token } = useAuth("admin");
  const { dict } = useClientLocale();
  const [overview, setOverview] = useState<Overview | null>(null);
  const [ops, setOps] = useState<Analytics | null>(null);
  const [me, setMe] = useState<AdminMe | null>(null);
  const [error, setError] = useState("");
  const { notify } = useAppNotifier();

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

  useEffect(() => {
    if (!error) return;
    notify(error, "error");
  }, [error, notify]);

  return (
    <div>
      <AdminPageHeader
        eyebrow="Admin Console"
        title={dict.portal.admin.dashboardTitle}
        description={dict.portal.admin.dashboardDescription}
      />

      <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {[
          { key: "Utilizadores", value: overview?.users ?? 0, sub: `${ops?.suspendedUsers ?? 0} suspensos` },
          { key: "Empresas", value: overview?.companies ?? 0, sub: `${ops?.pendingCompanies ?? 0} pendentes` },
          { key: "Vagas", value: overview?.jobs ?? 0, sub: `${ops?.pendingJobs ?? 0} pendentes` },
          { key: "Scraped", value: overview?.scraped ?? 0, sub: `${ops?.pendingScraped ?? 0} em revisão` },
          { key: "Campanhas", value: overview?.ads ?? 0, sub: "gestão de anúncios" },
        ].map((item) => (
          <div key={item.key} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs uppercase tracking-wide text-slate-500">{item.key}</p>
            <p className="mt-2 text-3xl font-bold text-slate-900">{item.value}</p>
            <p className="mt-1 text-xs text-slate-500">{item.sub}</p>
          </div>
        ))}
      </section>

      <section className="mt-6 grid gap-4 md:grid-cols-2">
        {quickLinks
          .filter((link) => {
            if (link.href === "/Portal/Admin/ads") return hasPermission(me, AdminPermissions.ADS_MANAGE);
            if (link.href === "/Portal/Admin/admin-levels") return hasPermission(me, AdminPermissions.ADMINS_PROMOTE);
            if (link.href === "/Portal/Admin/audit") return hasPermission(me, AdminPermissions.AUDIT_LOGS_VIEW);
            if (link.href === "/Portal/Admin/exports") return hasPermission(me, AdminPermissions.EXPORT_USERS);
            return true;
          })
          .map((link) => (
          <Link key={link.href} href={link.href} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-red-200 hover:bg-red-50/40">
            <p className="text-lg font-bold text-slate-900">{link.title}</p>
            <p className="mt-2 text-sm text-slate-600">{link.desc}</p>
          </Link>
          ))}
      </section>
    </div>
  );
}
