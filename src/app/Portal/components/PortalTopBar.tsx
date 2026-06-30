"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useAuth } from "@/hooks/useAuth";
import { logoutCurrentSession } from "@/lib/api";
import { ArrowRightOnRectangleIcon } from "@heroicons/react/24/outline";

const NotificationBell = dynamic(() => import("@/app/Portal/components/NotificationBell"), {
  ssr: false,
});

type Props = {
  role: "candidate" | "company";
};

const ROLE_CONFIG = {
  candidate: {
    label: "Portal Candidato",
    logoutRedirect: "/Login?role=candidate",
    authRole: "candidate" as const,
  },
  company: {
    label: "Portal Empresa",
    logoutRedirect: "/Login?role=company",
    authRole: "company" as const,
  },
};

export default function PortalTopBar({ role }: Props) {
  const config = ROLE_CONFIG[role];
  const { token } = useAuth(config.authRole);

  const handleLogout = () => {
    logoutCurrentSession(token, { redirectTo: config.logoutRedirect });
  };

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3">
        <Link
          href="/"
          className="text-sm font-semibold uppercase tracking-[0.18em] text-red-600 hover:text-red-700 transition-colors"
        >
          Parvagas
          <span className="ml-2 text-xs font-medium normal-case tracking-normal text-slate-400">
            {config.label}
          </span>
        </Link>
        <div className="flex items-center gap-2">
          {token && (
            <NotificationBell
              token={token}
              role={role}
              align="right"
            />
          )}
          <button
            type="button"
            onClick={handleLogout}
            className="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-1 text-sm font-semibold text-red-700 transition hover:bg-red-100"
          >
            <ArrowRightOnRectangleIcon className="h-4 w-4" />
            <span className="hidden sm:inline">Terminar sessão</span>
          </button>
        </div>
      </div>
    </header>
  );
}
