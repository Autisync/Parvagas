"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { clearToken, authFetch } from "@/lib/api";
import { useClientLocale } from "@/lib/i18n/client";
import LocaleCompactControl from "@/app/components/ui/LocaleCompactControl";
import {
  HomeIcon,
  UserIcon,
  DocumentIcon,
  HeartIcon,
  SparklesIcon,
  BriefcaseIcon,
  CheckCircleIcon,
  BellIcon,
  CogIcon,
  RocketLaunchIcon,
} from "@heroicons/react/24/outline";
import { useEffect, useState } from "react";

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
}

export default function CandidateSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, token } = useAuth("candidate");
  const { dict } = useClientLocale();
  const candidateName = (user as { fullName?: string; name?: string } | null)?.fullName || user?.name || "Candidato";

  const [profileCompletion, setProfileCompletion] = useState<number | null>(null);

  useEffect(() => {
    if (!token) return;
    authFetch<{ profile?: { completionScore?: number } }>("/candidates/profile", token, { suppressGlobalErrors: true })
      .then((d) => setProfileCompletion(d.profile?.completionScore ?? null))
      .catch(() => {/* ignore */});
  }, [token]);

  const navItems: NavItem[] = [
    { href: "/Portal/Candidato/Dashboard", label: dict.portal.candidate.dashboard, icon: <HomeIcon className="h-5 w-5" /> },
    { href: "/Portal/Candidato/Onboarding", label: "Configurar Perfil", icon: <RocketLaunchIcon className="h-5 w-5" /> },
    { href: "/Portal/Candidato/Meu-Perfil", label: dict.portal.candidate.profile, icon: <UserIcon className="h-5 w-5" /> },
    { href: "/Portal/Candidato/CV-e-Documentos", label: dict.portal.candidate.cvDocs, icon: <DocumentIcon className="h-5 w-5" /> },
    { href: "/Portal/Candidato/Vagas-Recomendadas", label: dict.portal.candidate.recommended, icon: <SparklesIcon className="h-5 w-5" /> },
    { href: "/Portal/Candidato/Vagas-Disponiveis", label: dict.portal.candidate.jobs, icon: <BriefcaseIcon className="h-5 w-5" /> },
    { href: "/Portal/Candidato/Vagas-Guardadas", label: dict.portal.candidate.saved, icon: <HeartIcon className="h-5 w-5" /> },
    { href: "/Portal/Candidato/Candidaturas", label: dict.portal.candidate.applications, icon: <CheckCircleIcon className="h-5 w-5" /> },
    { href: "/Portal/Candidato/Alertas", label: dict.portal.candidate.alerts, icon: <BellIcon className="h-5 w-5" /> },
    { href: "/Portal/Candidato/Definicoes", label: dict.portal.candidate.settings, icon: <CogIcon className="h-5 w-5" /> },
  ];

  const handleSignout = () => {
    clearToken();
    router.push("/Login");
  };

  return (
    <aside className="h-fit rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:sticky lg:top-4">
      <div className="flex items-center gap-2 px-2 py-2">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-sm font-bold text-blue-700 ring-1 ring-blue-100">
          {candidateName[0]?.toUpperCase() || "C"}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-900 truncate">{candidateName}</p>
          <p className="text-xs text-slate-500 truncate">{user?.email}</p>
        </div>
      </div>

      <nav className="mt-6 space-y-1">
        {navItems.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={[
                "flex items-center gap-3 rounded-xl border px-3 py-2.5 text-sm font-medium transition",
                active
                  ? "border-blue-200 bg-blue-50 text-blue-800 shadow-sm"
                  : "border-transparent text-slate-700 hover:border-slate-200 hover:bg-slate-100 hover:text-slate-900",
              ].join(" ")}
            >
              <span className={active ? "text-blue-700" : "text-slate-500"}>{item.icon}</span>
              <span className="flex-1">{item.label}</span>
              {item.href === "/Portal/Candidato/Meu-Perfil" &&
               profileCompletion !== null &&
               profileCompletion < 100 ? (
                <span
                  className="relative flex h-2.5 w-2.5 shrink-0"
                  title={`Perfil ${profileCompletion}% completo`}
                >
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-amber-500" />
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>

      <div className="mt-8 border-t border-slate-200 pt-4">
        <LocaleCompactControl className="mb-3" />
        <button
          type="button"
          onClick={handleSignout}
          className="inline-flex w-full items-center justify-center rounded-xl border border-blue-200 bg-blue-50 px-3 py-2.5 text-sm font-semibold text-blue-700 transition hover:bg-blue-100"
        >
          {dict.portal.candidate.logout}
        </button>
      </div>
    </aside>
  );
}
