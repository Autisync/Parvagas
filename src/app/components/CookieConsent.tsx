"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import {
  COOKIE_CONSENT_REOPEN_EVENT,
  getCookieConsent,
  setCookieConsent,
} from "@/lib/cookieConsent";

export default function CookieConsent() {
  const [visible, setVisible] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [analyticsChoice, setAnalyticsChoice] = useState(false);
  const [policyVersion, setPolicyVersion] = useState<string | null>(null);

  useEffect(() => {
    const existing = getCookieConsent();
    setVisible(!existing);
    setAnalyticsChoice(existing?.analytics ?? false);

    // Best-effort — the banner still works with policyVersion left null if
    // this fails; it's just the audit trail that's slightly less precise.
    apiFetch<{ versionLabel?: string }>("/legal/documents/cookies")
      .then((doc) => setPolicyVersion(doc?.versionLabel ?? null))
      .catch(() => {});

    const reopen = () => {
      const current = getCookieConsent();
      setAnalyticsChoice(current?.analytics ?? false);
      setExpanded(false);
      setVisible(true);
    };
    window.addEventListener(COOKIE_CONSENT_REOPEN_EVENT, reopen);
    return () => window.removeEventListener(COOKIE_CONSENT_REOPEN_EVENT, reopen);
  }, []);

  if (!visible) return null;

  const acceptAll = () => {
    setCookieConsent(true, policyVersion);
    setVisible(false);
  };

  const rejectOptional = () => {
    setCookieConsent(false, policyVersion);
    setVisible(false);
  };

  const savePreferences = () => {
    setCookieConsent(analyticsChoice, policyVersion);
    setVisible(false);
  };

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-label="Preferências de cookies"
      className="fixed bottom-4 left-4 right-4 z-[60] rounded-2xl border border-red-200 bg-white p-4 shadow-lg md:left-auto md:max-w-xl"
    >
      <p className="text-sm text-gray-700">
        Usamos cookies estritamente necessários para o funcionamento da plataforma. Com o seu consentimento, usamos
        também cookies de desempenho e análise, anonimizados. Ver{" "}
        <Link href="/cookies" className="font-medium text-red-600 underline hover:text-red-700">
          Política de Cookies
        </Link>.
      </p>

      {expanded && (
        <label className="mt-3 flex items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={analyticsChoice}
            onChange={(e) => setAnalyticsChoice(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-slate-300 text-red-600 focus:ring-red-500"
          />
          <span>
            <span className="font-medium">Cookies de desempenho e análise</span> — ajudam-nos a perceber como a
            plataforma é usada (IP anonimizado, sem perfis individuais).
          </span>
        </label>
      )}

      <div className="mt-3 flex flex-wrap gap-3">
        <button
          onClick={acceptAll}
          className="rounded-full bg-red-600 text-white px-4 py-2 text-sm font-semibold"
        >
          Aceitar todos
        </button>
        {expanded ? (
          <button
            onClick={savePreferences}
            className="rounded-full border border-red-200 px-4 py-2 text-sm font-semibold text-red-700"
          >
            Guardar preferências
          </button>
        ) : (
          <button
            onClick={() => setExpanded(true)}
            className="rounded-full border border-gray-300 px-4 py-2 text-sm font-semibold"
          >
            Personalizar
          </button>
        )}
        <button
          onClick={rejectOptional}
          className="rounded-full border border-gray-300 px-4 py-2 text-sm font-semibold"
        >
          Recusar opcionais
        </button>
      </div>
    </div>
  );
}
