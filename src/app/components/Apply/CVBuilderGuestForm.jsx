"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetchRaw, setToken, setUser } from "@/lib/api";

const fieldClass =
  "mt-2 block w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-red-300 focus:ring-4 focus:ring-red-100";

const labelClass = "block text-sm font-semibold text-slate-800";

/**
 * "Criar CV do Zero" — the low-friction sibling of the spontaneous CV
 * upload (CVForm.jsx), for visitors with no CV yet who want to build one
 * from scratch. No signup screen: a shadow account is created transparently
 * (same pattern as POST /public/cv-submissions), then the visitor lands
 * straight in the CV builder already authenticated as that account.
 *
 * Mirrors CVForm's two-column hero/form layout so both entry points on
 * /Submission carry equal visual weight — this is the primary destination
 * for Header's "Construtor de CV" CTA (/Submission#criar-cv) for anonymous
 * visitors, so it shouldn't read as an afterthought under the form.
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
      <div className="mx-auto max-w-6xl overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="grid lg:grid-cols-[0.8fr,1.2fr]">
          <aside className="bg-slate-950 p-8 text-white sm:p-10">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-red-300">Sem CV ainda?</p>
            <h1 className="mt-4 text-4xl font-bold leading-tight">Crie o seu CV do zero.</h1>
            <p className="mt-4 text-sm leading-6 text-slate-300">
              Sem ficheiro para anexar? Sem problema. Construa um currículo profissional directamente na
              plataforma, em poucos minutos.
            </p>
            <div className="mt-10 grid gap-3 text-sm text-slate-300">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">Só precisa do seu nome e email para começar.</div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">Editor guiado, secção a secção, com pré-visualização.</div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">Sem necessidade de criar conta primeiro.</div>
            </div>
          </aside>

          <form onSubmit={handleSubmit} className="space-y-8 p-6 sm:p-10">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-red-600">Construtor de CV</p>
              <h2 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">Criar CV do Zero</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Indique o seu nome e email para abrir o construtor — o resto acontece lá dentro.
              </p>
            </div>

            {error && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
            )}

            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <div className="sm:col-span-1">
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
              <div className="sm:col-span-1">
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
            </div>

            <div className="flex flex-col-reverse gap-3 border-t border-slate-200 pt-6 sm:flex-row sm:items-center sm:justify-end">
              <button
                type="submit"
                disabled={submitting}
                className="w-full rounded-xl bg-red-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
              >
                {submitting ? "A abrir…" : "Criar CV do Zero"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </section>
  );
}
