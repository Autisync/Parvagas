"use client";

import { Cog6ToothIcon } from "@heroicons/react/24/outline";
import { openCookiePreferences } from "@/lib/cookieConsent";

// cookies.md Section 3 promises cookie preferences can be revisited "Nas
// Definições de Conta ... a qualquer momento" — this is that surface.
export default function CookiePreferencesCard() {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-4">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
          <Cog6ToothIcon className="h-6 w-6" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-bold text-slate-900">Preferências de cookies</h2>
          <p className="mt-1 text-sm text-slate-600">
            Reveja ou altere a qualquer momento a sua escolha sobre cookies de desempenho e análise.
          </p>
        </div>
        <button
          type="button"
          onClick={openCookiePreferences}
          className="shrink-0 rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
        >
          Gerir cookies
        </button>
      </div>
    </section>
  );
}
