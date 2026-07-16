"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getToken, getUser } from "@/lib/api";

/**
 * "Criar CV do Zero" — account-holders-only entry to the native CV builder.
 *
 * This replaced the guest shadow-account flow (CVBuilderGuestForm.jsx +
 * POST /public/resume-sso/guest-start, both removed): building a CV now
 * requires a real authenticated account, by product decision. Anonymous
 * visitors get signup/login CTAs; an already-signed-in candidate goes
 * straight to the builder.
 */
export default function CVBuilderAuthCTA() {
  const router = useRouter();
  const [isCandidate, setIsCandidate] = useState(false);

  useEffect(() => {
    const user = getUser();
    setIsCandidate(Boolean(getToken() && user && user.role === "candidate"));
  }, []);

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
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">Editor guiado, secção a secção, com pré-visualização.</div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">Exporte em PDF profissional e candidate-se com um clique.</div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">O seu CV fica guardado na sua conta — edite quando quiser.</div>
            </div>
          </aside>

          <div className="flex flex-col justify-center space-y-8 p-6 sm:p-10">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-red-600">Construtor de CV</p>
              <h2 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">Criar CV do Zero</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                {isCandidate
                  ? "Já tem sessão iniciada — abra o construtor e comece a editar."
                  : "Crie uma conta gratuita de candidato para aceder ao construtor. Assim o seu CV fica sempre guardado e acessível."}
              </p>
            </div>

            {isCandidate ? (
              <div>
                <button
                  type="button"
                  onClick={() => router.push("/Portal/Candidato/Construtor-CV")}
                  className="w-full rounded-xl bg-red-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-red-700 sm:w-auto"
                >
                  Abrir o Construtor de CV
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <a
                  href="/Signup?role=candidate"
                  className="rounded-xl bg-red-600 px-5 py-3 text-center text-sm font-semibold text-white shadow-sm transition hover:bg-red-700"
                >
                  Criar conta gratuita
                </a>
                <a
                  href="/Login"
                  className="rounded-xl border border-slate-300 px-5 py-3 text-center text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
                >
                  Já tenho conta — Entrar
                </a>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
