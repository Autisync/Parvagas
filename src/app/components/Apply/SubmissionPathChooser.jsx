"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { DocumentArrowUpIcon, PencilSquareIcon } from "@heroicons/react/24/outline";
import { getToken, getUser } from "@/lib/api";

/**
 * Entry point for /Submission: lets a visitor self-select between the two
 * very different flows on this page (build a CV from scratch vs. upload an
 * existing one) instead of landing directly on a 20-field form with no
 * framing.
 *
 * The "no CV yet" card is the complete CV-builder entry point itself (not
 * just a link to one) — there's no form to fill in anymore since building a
 * CV requires an account, so a separate hero section below repeating the
 * same choice would be redundant. #criar-cv stays on this card since it's
 * the direct link Header's "Construtor de CV" CTA sends anonymous visitors
 * to. The "already have a CV" card still anchors down to the upload form.
 */
export default function SubmissionPathChooser() {
  const router = useRouter();
  const [isCandidate, setIsCandidate] = useState(false);

  useEffect(() => {
    const user = getUser();
    setIsCandidate(Boolean(getToken() && user && user.role === "candidate"));
  }, []);

  return (
    <section id="criar-cv" className="bg-slate-50 px-4 pb-4 pt-10 text-slate-900 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-red-600">Criar CV</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">
          Como quer começar?
        </h1>
        <p className="mx-auto mt-3 max-w-2xl text-sm leading-6 text-slate-600">
          Escolha a opção que se aplica a si — leva menos de um minuto a decidir.
        </p>

        <div className="mx-auto mt-8 grid max-w-3xl grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col items-start rounded-2xl border border-slate-200 bg-white p-6 text-left shadow-sm">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-red-50 text-red-600">
              <PencilSquareIcon className="h-6 w-6" aria-hidden="true" />
            </span>
            <h2 className="mt-4 text-lg font-bold text-slate-950">Ainda não tenho CV</h2>
            <p className="mt-1.5 text-sm leading-6 text-slate-600">
              {isCandidate
                ? "Já tem sessão iniciada — abra o construtor e comece a editar."
                : "Crie uma conta gratuita e construa um currículo do zero, directamente na plataforma."}
            </p>

            {isCandidate ? (
              <button
                type="button"
                onClick={() => router.push("/Portal/Candidato/Construtor-CV")}
                className="mt-4 w-full rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-red-700"
              >
                Abrir o Construtor de CV
              </button>
            ) : (
              <div className="mt-4 flex w-full flex-col gap-2 sm:flex-row">
                <a
                  href="/Signup?role=candidate"
                  className="flex-1 whitespace-nowrap rounded-xl bg-red-600 px-4 py-2.5 text-center text-sm font-semibold text-white shadow-sm transition hover:bg-red-700"
                >
                  Criar conta
                </a>
                <a
                  href="/Login"
                  className="flex-1 whitespace-nowrap rounded-xl border border-slate-300 px-4 py-2.5 text-center text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
                >
                  Entrar
                </a>
              </div>
            )}
          </div>

          <a
            href="#submeter-cv"
            className="group flex flex-col items-start rounded-2xl border border-slate-200 bg-white p-6 text-left shadow-sm transition hover:border-red-300 hover:shadow-md"
          >
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-100 text-slate-700 transition group-hover:bg-slate-200">
              <DocumentArrowUpIcon className="h-6 w-6" aria-hidden="true" />
            </span>
            <h2 className="mt-4 text-lg font-bold text-slate-950">Já tenho um CV</h2>
            <p className="mt-1.5 text-sm leading-6 text-slate-600">
              Submeta o seu CV existente (PDF ou DOCX) junto com os seus dados profissionais.
            </p>
            <span className="mt-4 text-sm font-semibold text-slate-700 group-hover:text-slate-900">
              Submeter CV →
            </span>
          </a>
        </div>
      </div>
    </section>
  );
}
