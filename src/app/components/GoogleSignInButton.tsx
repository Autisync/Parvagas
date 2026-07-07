"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetchRaw, setToken, setUser } from "@/lib/api";
import { track } from "@/lib/analytics";

const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || "";
const GIS_SRC = "https://accounts.google.com/gsi/client";

type GoogleCredentialResponse = { credential?: string };

type GoogleAccountsId = {
  initialize: (cfg: {
    client_id: string;
    callback: (res: GoogleCredentialResponse) => void;
    ux_mode?: "popup" | "redirect";
  }) => void;
  renderButton: (parent: HTMLElement, opts: Record<string, unknown>) => void;
};

declare global {
  interface Window {
    google?: { accounts: { id: GoogleAccountsId } };
  }
}

function portalRoute(role: string): string {
  if (role === "company") return "/Portal/Empresa/Perfil";
  return "/Portal/Candidato";
}

function loadGis(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined") return reject(new Error("no window"));
    if (window.google?.accounts?.id) return resolve();
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${GIS_SRC}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("gis load error")));
      // Already loaded but window.google not ready yet — poll briefly.
      const start = Date.now();
      const tick = () => {
        if (window.google?.accounts?.id) return resolve();
        if (Date.now() - start > 5000) return reject(new Error("gis timeout"));
        setTimeout(tick, 100);
      };
      tick();
      return;
    }
    const s = document.createElement("script");
    s.src = GIS_SRC;
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("gis load error"));
    document.head.appendChild(s);
  });
}

export default function GoogleSignInButton({
  text = "signin_with",
  onError,
}: {
  /** Google button label: signin_with | signup_with | continue_with */
  text?: "signin_with" | "signup_with" | "continue_with";
  onError?: (message: string) => void;
}) {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [signingIn, setSigningIn] = useState(false);

  const handleCredential = useCallback(
    async (res: GoogleCredentialResponse) => {
      const idToken = res.credential;
      if (!idToken) {
        onError?.("Não foi possível obter o token do Google.");
        return;
      }
      setSigningIn(true);
      try {
        const r = await apiFetchRaw("/auth/google", {
          method: "POST",
          suppressGlobalErrors: true,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ idToken }),
        });
        const body = await r.json().catch(() => ({}));
        if (!r.ok) {
          throw new Error(
            (body as { detail?: string; error?: string; message?: string }).detail ||
              (body as { error?: string }).error ||
              (body as { message?: string }).message ||
              "Falha ao iniciar sessão com Google.",
          );
        }
        const data = body as {
          access_token?: string;
          token?: string;
          isNewUser?: boolean;
          user: Record<string, unknown> & { role: string };
        };
        const token = String(data.access_token || data.token || "").trim();
        if (!token) throw new Error("Resposta de autenticação inválida.");
        if (data.isNewUser) track("register_success", { method: "google" });
        setToken(token);
        const u = data.user;
        setUser({
          id: String(u.id || u._id || ""),
          email: u.email,
          role: u.role,
          name: u.fullName || u.full_name,
          hasCompletedOnboarding: u.hasCompletedOnboarding ?? u.has_completed_onboarding ?? false,
          hasSeenTutorial: u.hasSeenTutorial ?? u.has_seen_tutorial ?? false,
          hasSeenEmpresaTutorial: u.hasSeenEmpresaTutorial ?? u.has_seen_empresa_tutorial ?? false,
          companyStatus: u.companyStatus ?? u.company_status,
        });
        router.replace(portalRoute(u.role));
      } catch (err) {
        setSigningIn(false);
        onError?.(err instanceof Error ? err.message : "Falha ao iniciar sessão com Google.");
      }
    },
    [router, onError],
  );

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) return;
    let cancelled = false;
    loadGis()
      .then(() => {
        if (cancelled || !containerRef.current || !window.google?.accounts?.id) return;
        window.google.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          callback: handleCredential,
          ux_mode: "popup",
        });
        window.google.accounts.id.renderButton(containerRef.current, {
          type: "standard",
          theme: "outline",
          size: "large",
          text,
          shape: "rectangular",
          logo_alignment: "left",
          width: 320,
        });
        setReady(true);
      })
      .catch(() => onError?.("Não foi possível carregar o Google Sign-In."));
    return () => {
      cancelled = true;
    };
  }, [handleCredential, text, onError]);

  if (!GOOGLE_CLIENT_ID) return null;

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative">
        <div ref={containerRef} className="min-h-[44px]" />
        {signingIn && (
          <div className="absolute inset-0 flex items-center justify-center gap-2 rounded-md bg-white/90">
            <svg className="h-5 w-5 animate-spin text-red-600" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <span className="text-sm font-medium text-slate-700">A entrar…</span>
          </div>
        )}
      </div>
      {!ready && !signingIn && (
        <span className="text-xs text-[var(--text-subtle)]">A carregar Google…</span>
      )}
    </div>
  );
}
