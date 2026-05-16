"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { authFetch } from "@/lib/api";
import PageHeader from "@/app/components/PageHeader";
import DashboardCard from "@/app/components/DashboardCard";
import {
  BriefcaseIcon,
  ClipboardDocumentListIcon,
  UserGroupIcon,
  CalendarDaysIcon,
  CheckBadgeIcon,
  BuildingOfficeIcon,
  PlusCircleIcon,
} from "@heroicons/react/24/outline";
import { useClientLocale } from "@/lib/i18n/client";
import InlineErrorState from "@/app/components/errors/InlineErrorState";

const CompanySidebar = dynamic(() => import("../components/CompanySidebar"), {
  ssr: false,
  loading: () => <div className="h-80 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm" />,
});

type CompanyStats = {
  totalJobs?: number;
  activeJobs?: number;
  pendingJobs?: number;
  totalApplications?: number;
  newApplications?: number;
  shortlisted?: number;
  interviews?: number;
  hired?: number;
};

type CompanyProfile = {
  name?: string;
  status?: "inactive" | "pending_verification" | "active" | "rejected";
  completionScore?: number;
};

function CompanyCompletionCard({ completion }: { completion: number }) {
  const clamped = Math.min(100, Math.max(0, completion));
  return (
    <div className="rounded-2xl border border-red-100 bg-gradient-to-r from-red-50 to-red-100 p-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-widest text-red-600">Perfil da empresa</p>
          <p className="mt-1 text-3xl font-bold text-slate-900">{clamped}%</p>
          <p className="mt-0.5 text-sm text-slate-600">
            {clamped < 50
              ? "Complete o perfil para aumentar a atração de candidatos"
              : clamped < 80
              ? "Bom progresso — adicione logo e descrição detalhada"
              : "Perfil bem preenchido — excelente visibilidade"}
          </p>
        </div>
        <BuildingOfficeIcon className="h-12 w-12 text-red-300" />
      </div>
      <div className="mt-4 h-2.5 w-full rounded-full bg-red-200">
        <div
          className="h-2.5 rounded-full bg-red-600 transition-all duration-700"
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  );
}

export default function EmpresaDashboard() {
  const { token, loading, user } = useAuth("company");
  const { dict } = useClientLocale();
  const [stats, setStats] = useState<CompanyStats>({});
  const [profile, setProfile] = useState<CompanyProfile>({});
  const [fetching, setFetching] = useState(true);
  const [pageError, setPageError] = useState(false);

  useEffect(() => {
    if (!token) return;

    const fetchStats = async () => {
      try {
        setFetching(true);
        setPageError(false);
        const [profileRes, jobsRes, appsRes] = await Promise.allSettled([
          authFetch("/companies/profile", token, { suppressGlobalErrors: true }),
          authFetch("/companies/jobs?page=1&limit=1", token, { suppressGlobalErrors: true }),
          authFetch("/applications?page=1&limit=100", token, { suppressGlobalErrors: true }),
        ]);

        const failedCount = [profileRes, jobsRes, appsRes].filter((r) => r.status === "rejected").length;
        if (failedCount > 0) {
          setPageError(true);
        }

        if (profileRes.status === "fulfilled") {
          const data = profileRes.value as any;
          setProfile(data?.company || data?.profile || {});
        }

        const jobsData = jobsRes.status === "fulfilled" ? (jobsRes.value as any) : null;
        const appsData = appsRes.status === "fulfilled" ? (appsRes.value as any) : null;
        const appsArray: any[] = appsData?.applications || [];

        setStats({
          totalJobs: jobsData?.total ?? 0,
          activeJobs: jobsData?.jobs?.filter((j: any) => j.status === "approved").length ?? 0,
          pendingJobs: jobsData?.jobs?.filter((j: any) => j.status === "pending").length ?? 0,
          totalApplications: appsData?.total ?? 0,
          newApplications: appsArray.filter((a) => a.status === "submitted").length,
          shortlisted: appsArray.filter((a) => a.status === "shortlisted").length,
          interviews: appsArray.filter((a) => a.status === "interview").length,
          hired: appsArray.filter((a) => a.status === "hired").length,
        });
      } catch (err) {
        console.error("Failed to load company dashboard stats", err);
      } finally {
        setFetching(false);
      }
    };

    fetchStats();
  }, [token]);

  const companyName =
    profile.name ||
    (user as any)?.companyName ||
    (user as any)?.name ||
    "";

  if (loading || fetching) {
    return (
      <div className="min-h-screen bg-white">
        <main className="max-w-7xl mx-auto px-6 pt-8 pb-16">
          <div className="grid gap-6 lg:grid-cols-[260px,1fr]">
            <CompanySidebar />
            <div className="flex items-center justify-center py-24">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-red-600 border-t-transparent" />
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      <main className="max-w-7xl mx-auto px-6 pt-8 pb-16">
        <div className="grid gap-6 lg:grid-cols-[260px,1fr]">
          <CompanySidebar />

          <div className="space-y-8">
            <PageHeader
              title={dict.portal.company.welcome(companyName || undefined)}
              description={dict.portal.company.welcomeDescription}
              badge={dict.portal.company.dashboard}
              action={
                <a
                  href="/Portal/Empresa/Nova-Vaga"
                  className="app-btn-primary inline-flex items-center gap-2 px-5 py-2.5 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300"
                >
                  <PlusCircleIcon className="h-4 w-4" />
                  {dict.portal.company.newJob}
                </a>
              }
            />

            {(profile.status === "pending_verification" || profile.status === "rejected") && (
              <section className={`rounded-2xl border p-4 ${profile.status === "pending_verification" ? "border-amber-200 bg-amber-50" : "border-red-200 bg-red-50"}`}>
                <p className={`text-sm font-semibold ${profile.status === "pending_verification" ? "text-amber-900" : "text-red-900"}`}>
                  {profile.status === "pending_verification"
                    ? "A sua empresa está em validação. Publicação de vagas indisponível até aprovação."
                    : "A conta da empresa está rejeitada ou inativa. Contacte o suporte para regularização."}
                </p>
              </section>
            )}

            {pageError && <InlineErrorState onAction={() => window.location.reload()} />}

            {/* Profile Completion */}
            <CompanyCompletionCard completion={profile.completionScore ?? 0} />

            {/* Pipeline Metrics */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {[
                {
                  label: "Vagas Publicadas",
                  value: stats.totalJobs ?? 0,
                  sub: `${stats.activeJobs ?? 0} aprovadas`,
                  color: "text-red-600",
                  bg: "bg-red-50",
                },
                {
                  label: "Candidaturas",
                  value: stats.totalApplications ?? 0,
                  sub: `${stats.newApplications ?? 0} novas`,
                  color: "text-amber-600",
                  bg: "bg-amber-50",
                },
                {
                  label: "Em Entrevista",
                  value: stats.interviews ?? 0,
                  sub: `${stats.shortlisted ?? 0} pré-selec.`,
                  color: "text-blue-600",
                  bg: "bg-blue-50",
                },
                {
                  label: "Contratados",
                  value: stats.hired ?? 0,
                  sub: "este período",
                  color: "text-green-600",
                  bg: "bg-green-50",
                },
              ].map((metric) => (
                <div key={metric.label} className={`rounded-2xl border border-slate-200 ${metric.bg} p-5`}>
                  <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">{metric.label}</p>
                  <p className={`mt-2 text-3xl font-bold ${metric.color}`}>{metric.value}</p>
                  <p className="mt-0.5 text-xs text-slate-500">{metric.sub}</p>
                </div>
              ))}
            </div>

            {/* Quick Actions */}
            <div>
              <p className="mb-4 text-sm font-semibold uppercase tracking-widest text-slate-500">Ações rápidas</p>
              <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
                <DashboardCard
                  href="/Portal/Empresa/Minhas-Vagas"
                  icon={<BriefcaseIcon className="h-6 w-6" />}
                  title="Minhas Vagas"
                  description={`${stats.totalJobs ?? 0} vaga${(stats.totalJobs ?? 0) !== 1 ? "s" : ""} publicada${(stats.totalJobs ?? 0) !== 1 ? "s" : ""}`}
                  badge={stats.pendingJobs}
                  badgeColor="amber"
                />

                <DashboardCard
                  href="/Portal/Empresa/Candidaturas"
                  icon={<ClipboardDocumentListIcon className="h-6 w-6" />}
                  title="Candidaturas"
                  description={`${stats.totalApplications ?? 0} candidatura${(stats.totalApplications ?? 0) !== 1 ? "s" : ""} recebida${(stats.totalApplications ?? 0) !== 1 ? "s" : ""}`}
                  badge={stats.newApplications}
                  badgeColor="red"
                />

                <DashboardCard
                  href="/Portal/Empresa/Candidaturas"
                  icon={<UserGroupIcon className="h-6 w-6" />}
                  title="Pré-Selecionados"
                  description={`${stats.shortlisted ?? 0} candidato${(stats.shortlisted ?? 0) !== 1 ? "s" : ""} em análise`}
                  badge={stats.shortlisted}
                  badgeColor="blue"
                />

                <DashboardCard
                  href="/Portal/Empresa/Candidaturas"
                  icon={<CalendarDaysIcon className="h-6 w-6" />}
                  title="Entrevistas"
                  description={`${stats.interviews ?? 0} em curso`}
                  badge={stats.interviews}
                  badgeColor="purple"
                />

                <DashboardCard
                  href="/Portal/Empresa/Candidaturas"
                  icon={<CheckBadgeIcon className="h-6 w-6" />}
                  title="Contratações"
                  description={`${stats.hired ?? 0} contratado${(stats.hired ?? 0) !== 1 ? "s" : ""}`}
                  badge={stats.hired}
                  badgeColor="green"
                />

                <DashboardCard
                  href="/Portal/Empresa/Perfil"
                  icon={<BuildingOfficeIcon className="h-6 w-6" />}
                  title={dict.portal.company.profile}
                  description="Actualize dados e logotipo da empresa"
                />
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
