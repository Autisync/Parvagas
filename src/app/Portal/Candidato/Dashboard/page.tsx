"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/hooks/useAuth";
import { authFetch } from "@/lib/api";
import PageHeader from "@/app/components/PageHeader";
import DashboardCard from "@/app/components/DashboardCard";
import EmptyState from "@/app/components/EmptyState";
import ProfileCompletionCard from "@/app/components/ProfileCompletionCard";
import { useClientLocale } from "@/lib/i18n/client";
import {
  SparklesIcon,
  BriefcaseIcon,
  HeartIcon,
  CheckCircleIcon,
  BellIcon,
  DocumentIcon,
  CogIcon,
} from "@heroicons/react/24/outline";

type DashboardStats = {
  recommendedJobs?: number;
  savedJobs?: number;
  applications?: number;
  jobAlerts?: number;
  profileCompletion?: number;
  cvDocuments?: number;
};

type Profile = {
  fullName?: string;
  completionScore?: number;
};

export default function CandidatoDashboard() {
  const { token, loading } = useAuth("candidate", { allowAdmin: false });
  const { dict } = useClientLocale();
  const [stats, setStats] = useState<DashboardStats>({});
  const [profile, setProfile] = useState<Profile>({});
  const [fetching, setFetching] = useState(true);

  useEffect(() => {
    if (!token) return;

    const fetchStats = async () => {
      try {
        setFetching(true);
        const [profileRes, recommendedRes, savedRes, applicationsRes, alertsRes, docsRes] = await Promise.allSettled([
          authFetch("/candidates/profile", token),
          authFetch("/candidates/jobs/recommended?limit=1&page=1", token),
          authFetch("/candidates/jobs/saved?limit=1&page=1", token),
          authFetch("/candidates/applications?limit=1&page=1", token),
          authFetch("/candidates/alerts?limit=1&page=1", token),
          authFetch("/candidates/cv/documents", token),
        ]);

        if (profileRes.status === "fulfilled") {
          const data = profileRes.value as any;
          setProfile(data?.profile || {});
        }

        setStats({
          recommendedJobs: 0,
          savedJobs: savedRes.status === "fulfilled" ? (savedRes.value as any)?.total || 0 : 0,
          applications: applicationsRes.status === "fulfilled" ? (applicationsRes.value as any)?.total || 0 : 0,
          jobAlerts: alertsRes.status === "fulfilled" ? (alertsRes.value as any)?.total || 0 : 0,
          profileCompletion: profileRes.status === "fulfilled" ? (profileRes.value as any)?.profile?.completionScore || 0 : 0,
          cvDocuments: docsRes.status === "fulfilled" ? ((docsRes.value as any)?.length || 0) : 0,
        });
      } catch (error) {
        console.error("Failed to fetch dashboard stats", error);
      } finally {
        setFetching(false);
      }
    };

    fetchStats();
  }, [token]);

  if (loading || fetching) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title={dict.portal.candidate.welcome(profile.fullName ? profile.fullName.split(" ")[0] : undefined)}
        description={dict.portal.candidate.welcomeDescription}
        badge={dict.portal.candidate.dashboard}
      />

      {/* Profile Completion */}
      <ProfileCompletionCard completion={stats.profileCompletion || 0} />

      {/* Main Actions Grid */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <DashboardCard
          href="/Portal/Candidato/Vagas-Recomendadas"
          icon={<SparklesIcon className="h-6 w-6" />}
          title={dict.portal.candidate.recommended}
          description="Ofertas personalizadas para ti"
          badge={stats.recommendedJobs}
          badgeColor="blue"
        />

        <DashboardCard
          href="/Portal/Candidato/Vagas-Disponíveis"
          icon={<BriefcaseIcon className="h-6 w-6" />}
          title={dict.portal.candidate.jobs}
          description="Todas as oportunidades abertas"
        />

        <DashboardCard
          href="/Portal/Candidato/Vagas-Guardadas"
          icon={<HeartIcon className="h-6 w-6" />}
          title={dict.portal.candidate.saved}
          description={`${stats.savedJobs || 0} vaga${stats.savedJobs !== 1 ? "s" : ""} guardada${stats.savedJobs !== 1 ? "s" : ""}`}
          badge={stats.savedJobs}
          badgeColor="red"
        />

        <DashboardCard
          href="/Portal/Candidato/Candidaturas"
          icon={<CheckCircleIcon className="h-6 w-6" />}
          title={dict.portal.candidate.applications}
          description={`${stats.applications || 0} candidatura${stats.applications !== 1 ? "s" : ""}`}
          badge={stats.applications}
          badgeColor="green"
        />

        <DashboardCard
          href="/Portal/Candidato/Alertas"
          icon={<BellIcon className="h-6 w-6" />}
          title={dict.portal.candidate.alerts}
          description={`${stats.jobAlerts || 0} alerta${stats.jobAlerts !== 1 ? "s" : ""} ativo${stats.jobAlerts !== 1 ? "s" : ""}`}
          badge={stats.jobAlerts}
          badgeColor="amber"
        />

        <DashboardCard
          href="/Portal/Candidato/CV-e-Documentos"
          icon={<DocumentIcon className="h-6 w-6" />}
          title={dict.portal.candidate.cvDocs}
          description={`${stats.cvDocuments || 0} documento${stats.cvDocuments !== 1 ? "s" : ""}`}
          badge={stats.cvDocuments}
          badgeColor="purple"
        />
      </div>

      {/* Settings Card */}
      <div className="pt-4">
        <DashboardCard
          href="/Portal/Candidato/Definicoes"
          icon={<CogIcon className="h-6 w-6" />}
          title={dict.portal.candidate.settings}
          description="Gerencie preferências de notificações e privacidade"
        />
      </div>
    </div>
  );
}
