"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetchRaw, setToken, setUser } from "@/lib/api";

const fieldClass =
  "mt-2 block w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-red-300 focus:ring-4 focus:ring-red-100";

const labelClass = "block text-sm font-semibold text-slate-800";

/**
 * "Criar CV do Zero" — sibling entry point to the guest CV-upload form
 * (CVForm.jsx), for visitors with no CV yet who want to build one from
 * scratch. No signup screen: a shadow account is created transparently
 * (same pattern as POST /public/cv-submissions), then the visitor lands
 * straight in the CV builder already authenticated as that account.
 */
export default function CVBuilderGuestForm() {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (submitting) return;
    setError("");
    setSubmitting(true);
    try {
      const res = await apiFetchRaw("/public/resume-sso/guest-start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullName, email }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body?.detail || "Não foi possível iniciar o construtor de CV.");
      }
      const token = String(body?.access_token || "").trim();
      if (!token) throw new Error("Resposta de autenticação inválida.");
      setToken(token);
      const u = body.user || {};
      setUser({
        id: String(u.id || ""),
        email: u.email,
        role: u.role,
        name: u.fullName || u.full_name,
        hasCompletedOnboarding: u.hasCompletedOnboarding ?? u.has_completed_onboarding ?? false,
        hasSeenTutorial: u.hasSeenTutorial ?? u.has_seen_tutorial ?? false,
        hasSeenEmpresaTutorial: u.hasSeenEmpresaTutorial ?? u.has_seen_empresa_tutorial ?? false,
        companyStatus: u.companyStatus ?? u.company_status,
        isGuestAccount: u.isGuestAccount ?? u.is_guest_account ?? true,
      });
      router.push("/Portal/Candidato/Construtor-CV");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível iniciar o construtor de CV.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section id="criar-cv" className="bg-white px-4 py-10 text-slate-900 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-2xl rounded-3xl border border-slate-200 bg-slate-50 p-6 shadow-sm sm:p-10">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-red-600">Sem CV ainda?</p>
        <h2 className="mt-2 text-2xl font-bold tracking-tight text-slate-950">Criar CV do Zero</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Indique o seu nome e email para abrir o construtor de CV — sem necessidade de criar conta primeiro.
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
          )}
          <div>
            <label htmlFor="guest-cv-fullname" className={labelClass}>Nome completo</label>
            <input
              id="guest-cv-fullname"
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              autoComplete="name"
              className={fieldClass}
              required
            />
          </div>
          <div>
            <label htmlFor="guest-cv-email" className={labelClass}>Email</label>
            <input
              id="guest-cv-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              className={fieldClass}
              required
            />
          </div>
          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-xl bg-red-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? "A abrir…" : "Criar CV do Zero"}
          </button>
        </form>
      </div>
    </section>
  );
}
