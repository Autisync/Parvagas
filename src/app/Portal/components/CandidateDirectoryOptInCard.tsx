"use client";

import { useEffect, useState } from "react";
import { EyeIcon } from "@heroicons/react/24/outline";
import { authFetch, getErrorMessage, getToken } from "@/lib/api";

const CONSENT_SLUG = "consentimento-diretorio-candidatos";

type ProfileResponse = { profile: { discoverableOptIn?: boolean } };

// W5.2 — first channel that exposes a candidate's profile (incl. contact
// info) to companies before any application exists, so turning it on
// requires accepting a dedicated consent document first (see legal_service
// has_accepted_current_version gate on the backend).
export default function CandidateDirectoryOptInCard() {
  const [optIn, setOptIn] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const token = getToken();
    if (!token) {
      setFetching(false);
      return;
    }
    authFetch<ProfileResponse>("/candidates/profile", token, { suppressGlobalErrors: true })
      .then((d) => setOptIn(Boolean(d.profile?.discoverableOptIn)))
      .catch(() => {})
      .finally(() => setFetching(false));
  }, []);

  const handleToggle = async () => {
    const token = getToken();
    if (!token) return;
    const next = !optIn;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      if (next) {
        await authFetch("/legal/acceptances", token, {
          method: "POST",
          body: JSON.stringify({ slug: CONSENT_SLUG, context: "candidate_directory_opt_in" }),
        });
      }
      const res = await authFetch<ProfileResponse>("/candidates/profile", token, {
        method: "PATCH",
        body: JSON.stringify({ discoverableOptIn: next }),
      });
      setOptIn(Boolean(res.profile?.discoverableOptIn));
      setMessage(next ? "O seu perfil está agora visível para empresas." : "O seu perfil deixou de ser visível para empresas.");
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Não foi possível atualizar esta preferência."));
    } finally {
      setSaving(false);
    }
  };

  if (fetching) return null;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start gap-4">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
          <EyeIcon className="h-6 w-6" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-bold text-slate-900">Diretório de candidatos</h2>
          <p className="mt-1 text-sm text-slate-600">
            Permita que empresas com acesso ao diretório encontrem o seu perfil e o contactem diretamente,
            mesmo antes de se candidatar a uma vaga. Inclui o seu nome, experiência, competências e contactos
            (telefone e email). Pode desativar a qualquer momento. Ao ativar, aceita o{" "}
            <a
              href={`/${CONSENT_SLUG}`}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-red-600 hover:text-red-700"
            >
              Consentimento do Diretório de Candidatos
            </a>.
          </p>
        </div>
        <button
          type="button"
          onClick={handleToggle}
          disabled={saving}
          aria-pressed={optIn}
          className={`relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${optIn ? "bg-red-600" : "bg-slate-200"}`}
        >
          <span className={`m-0.5 inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${optIn ? "translate-x-5" : "translate-x-0"}`} />
        </button>
      </div>

      {message && <p className="mt-3 text-sm text-emerald-700">{message}</p>}
      {error && <p className="mt-3 text-sm text-rose-600">{error}</p>}
    </section>
  );
}
