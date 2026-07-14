"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/hooks/useAuth";
import { authFetch } from "@/lib/api";
import PageHeader from "@/app/components/PageHeader";
import DashboardCard from "@/app/components/DashboardCard";
import EmptyState from "@/app/components/EmptyState";
import ProfileCompletionCard from "@/app/components/ProfileCompletionCard";
import FirstStepsChecklist, { type FirstStepItem } from "@/app/components/FirstStepsChecklist";
import { useClientLocale } from "@/lib/i18n/client";
import InlineErrorState from "@/app/components/errors/InlineErrorState";
import { MilestoneCelebration } from "@/app/components/motion";
import LottieBlock from "@/app/components/LottieBlock";
import {
  SparklesIcon,
  BriefcaseIcon,
  HeartIcon,
  CheckCircleIcon,
  BellIcon,
  DocumentIcon,
  CogIcon,
  RocketLaunchIcon,
} from "@heroicons/react/24/outline";

type DashboardStats = {
  recommendedJobs?: number;
  availableJobs?: number;
  savedJobs?: number;
  applications?: number;
  jobAlerts?: number;
  profileCompletion?: number;
  cvDocuments?: number;
  builtResumes?: number;
};

type Profile = {
  fullName?: string;
  completionScore?: number;
  hasCompletedOnboarding?: boolean;
};

const readTotal = (value: any): number => {
  if (!value || typeof value !== "object") return 0;
  if (typeof value.total === "number") return value.total;
  if (typeof value?.pagination?.total === "number") return value.pagination.total;
  return 0;
};

export default function CandidatoDashboard() {
  const { token, loading } = useAuth("candidate", { allowAdmin: false });
  const { dict } = useClientLocale();
  const [stats, setStats] = useState<DashboardStats>({});
  const [profile, setProfile] = useState<Profile>({});
  const [fetching, setFetching] = useState(true);
  const [pageError, setPageError] = useState(false);
  const [celebrate, setCelebrate] = useState(false);
  const [showProfileMilestone, setShowProfileMilestone] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("onboarded") === "1") {
      setCelebrate(true);
      // Clean the URL so the celebration doesn't replay on refresh.
      window.history.replaceState({}, "", "/Portal/Candidato/Dashboard");
    }
  }, []);

  useEffect(() => {
    if (!token) return;

    const fetchStats = async () => {
      try {
        setFetching(true);
        setPageError(false);
        const [profileRes, recommendedRes, availableRes, savedRes, applicationsRes, alertsRes, docsRes, resumesRes] = await Promise.allSettled([
          authFetch("/candidates/profile", token, { suppressGlobalErrors: true }),
          authFetch("/candidates/jobs/recommended?limit=1&page=1", token, { suppressGlobalErrors: true }),
          authFetch("/jobs?limit=1&page=1", token, { suppressGlobalErrors: true }),
          authFetch("/candidates/jobs/saved?limit=1&page=1", token, { suppressGlobalErrors: true }),
          authFetch("/candidates/applications?limit=1&page=1", token, { suppressGlobalErrors: true }),
          authFetch("/candidates/alerts?limit=1&page=1", token, { suppressGlobalErrors: true }),
          authFetch("/candidates/cv/documents", token, { suppressGlobalErrors: true }),
          authFetch("/resumes/", token, { suppressGlobalErrors: true }),
        ]);

        const failedCount = [profileRes, recommendedRes, availableRes, savedRes, applicationsRes, alertsRes, docsRes, resumesRes].filter((r) => r.status === "rejected").length;
        if (failedCount > 0) {
          setPageError(true);
        }

        if (profileRes.status === "fulfilled") {
          const data = profileRes.value as any;
          setProfile(data?.profile || {});
        }

        setStats({
          recommendedJobs: recommendedRes.status === "fulfilled" ? readTotal(recommendedRes.value) : 0,
          availableJobs: availableRes.status === "fulfilled" ? readTotal(availableRes.value) : 0,
          savedJobs: savedRes.status === "fulfilled" ? readTotal(savedRes.value) : 0,
          applications: applicationsRes.status === "fulfilled" ? readTotal(applicationsRes.value) : 0,
          jobAlerts: alertsRes.status === "fulfilled" ? readTotal(alertsRes.value) : 0,
          profileCompletion: profileRes.status === "fulfilled" ? (profileRes.value as any)?.profile?.completionScore || 0 : 0,
          cvDocuments:
            docsRes.status === "fulfilled"
              ? Array.isArray((docsRes.value as any)?.documents)
                ? (docsRes.value as any).documents.length
                : 0
              : 0,
          builtResumes: resumesRes.status === "fulfilled" && Array.isArray(resumesRes.value) ? resumesRes.value.length : 0,
        });
      } catch (error) {
        console.error("Failed to fetch dashboard stats", error);
      } finally {
        setFetching(false);
      }
    };

    fetchStats();
  }, [token]);

  // Fire the profile-completion milestone once — the very first time it
  // reaches 100%, not on every render/visit while it stays at 100%.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if ((stats.profileCompletion || 0) < 100) return;
    const key = "pv_profile_100_celebrated";
    if (window.localStorage.getItem(key) === "1") return;
    window.localStorage.setItem(key, "1");
    setShowProfileMilestone(true);
  }, [stats.profileCompletion]);

  // Safety net: auto-hide the milestone even if the animation asset fails to
  // load (onComplete would then never fire).
  useEffect(() => {
    if (!showProfileMilestone) return;
    const timer = setTimeout(() => setShowProfileMilestone(false), 5000);
    return () => clearTimeout(timer);
  }, [showProfileMilestone]);

  if (loading || fetching) {
    return (
      <div className="space-y-8">
        <div className="app-skeleton h-9 w-64" />
        <div className="app-card h-28 p-5" />
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="app-skeleton h-32 rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <MilestoneCelebration show={celebrate} onDone={() => setCelebrate(false)} />
      {showProfileMilestone && (
        <div className="fixed bottom-6 right-6 z-50 rounded-2xl border border-red-200 bg-white p-4 shadow-lg" role="status">
          <LottieBlock
            name="milestone-celebration"
            size={120}
            caption="Perfil 100% completo!"
            onComplete={() => setShowProfileMilestone(false)}
          />
        </div>
      )}
      <PageHeader
        title={dict.portal.candidate.welcome(profile.fullName ? profile.fullName.split(" ")[0] : undefined)}
        description={dict.portal.candidate.welcomeDescription}
        badge={dict.portal.candidate.dashboard}
      />

      {/* Profile Completion */}
      {pageError && <InlineErrorState className="mb-2" onAction={() => window.location.reload()} />}
      <ProfileCompletionCard completion={stats.profileCompletion || 0} />

      {/* Guided first steps — deep-links to the exact actions the tutorial
          described, not just a description of them. Disappears once done. */}
      <FirstStepsChecklist
        items={[
          { key: "profile", label: "Completar o perfil", href: "/Portal/Candidato/Onboarding", done: Boolean(profile.hasCompletedOnboarding) },
          { key: "cv", label: "Criar o seu CV", href: "/Portal/Candidato/Construtor-CV", done: (stats.builtResumes || 0) > 0 },
          { key: "alerts", label: "Definir um alerta de vagas", href: "/Portal/Candidato/Alertas", done: (stats.jobAlerts || 0) > 0 },
          { key: "apply", label: "Candidatar-se à primeira vaga", href: "/Portal/Candidato/Vagas-Disponiveis", done: (stats.applications || 0) > 0 },
        ]}
      />

      {/* Main Actions Grid */}
      <div className="grid gap-6 pv-stagger md:grid-cols-2 lg:grid-cols-3">
        <DashboardCard
          href="/Portal/Candidato/Vagas-Recomendadas"
          icon={<SparklesIcon className="h-6 w-6" />}
          title={dict.portal.candidate.recommended}
          description="Ofertas personalizadas para ti"
          badge={stats.recommendedJobs}
          badgeColor="blue"
        />

        <DashboardCard
          href="/Portal/Candidato/Vagas-Disponiveis"
          icon={<BriefcaseIcon className="h-6 w-6" />}
          title={dict.portal.candidate.jobs}
          description={`${stats.availableJobs || 0} oportunidade${stats.availableJobs !== 1 ? "s" : ""} aberta${stats.availableJobs !== 1 ? "s" : ""}`}
          badge={stats.availableJobs}
          badgeColor="blue"
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

      {/* Settings + auto-apply preferences */}
      <div className="grid gap-6 pt-4 sm:grid-cols-2">
        <DashboardCard
          href="/Portal/Candidato/Definicoes"
          icon={<CogIcon className="h-6 w-6" />}
          title={dict.portal.candidate.settings}
          description="Gerencie preferências de notificações e privacidade"
        />
        <DashboardCard
          href="/Portal/Candidato/CV-e-Documentos"
          icon={<RocketLaunchIcon className="h-6 w-6" />}
          title="Candidatura automática"
          description="Reveja sugestões de vagas compatíveis e aprove candidaturas com um clique"
        />
      </div>
    </div>
  );
}
