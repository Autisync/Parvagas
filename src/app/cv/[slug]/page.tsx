"use client";

/**
 * Public CV share page (EXECUTION_PLAN_NATIVE_CV_BUILDER.md B3) —
 * /cv/[slug] renders a published resume for anyone with the link, no auth.
 * Backed by GET /public/resumes/{share_slug}, which only resolves
 * is_published rows; anything else lands in the not-found state.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { apiFetchRaw } from "@/lib/api";
import ResumePreview from "@/app/Portal/Candidato/Construtor-CV/preview/ResumePreview";
import type { PreviewData } from "@/app/Portal/Candidato/Construtor-CV/preview/AtsClassic";

type PublicResume = {
  title: string;
  data: PreviewData;
  template_slug: string | null;
};

export default function PublicResumePage() {
  const params = useParams<{ slug: string }>();
  const [resume, setResume] = useState<PublicResume | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "not-found">("loading");

  useEffect(() => {
    if (!params.slug) return;
    apiFetchRaw(`/public/resumes/${encodeURIComponent(params.slug)}`, { suppressGlobalErrors: true })
      .then(async (res) => {
        if (!res.ok) throw new Error("not found");
        setResume(await res.json());
        setState("ready");
      })
      .catch(() => setState("not-found"));
  }, [params.slug]);

  if (state === "loading") {
    return (
      <div className="flex min-h-[60vh] items-center justify-center bg-slate-100">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-red-600 border-t-transparent" />
      </div>
    );
  }

  if (state === "not-found" || !resume) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 bg-slate-100 px-4 text-center">
        <h1 className="text-2xl font-bold text-slate-900">CV não encontrado</h1>
        <p className="max-w-md text-sm text-slate-600">
          Esta ligação já não está disponível — o autor pode ter despublicado o CV.
        </p>
        <Link
          href="/"
          className="rounded-xl bg-red-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-red-700"
        >
          Ir para o Parvagas
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 pb-16">
      <div className="mx-auto max-w-[210mm] px-4 pt-8">
        <ResumePreview data={resume.data} templateSlug={resume.template_slug} />
        <p className="mt-6 text-center text-xs text-slate-500">
          CV criado com o{" "}
          <Link href="/Submission#criar-cv" className="font-semibold text-red-600 hover:underline">
            Construtor de CV do Parvagas
          </Link>{" "}
          — crie o seu gratuitamente.
        </p>
      </div>
    </div>
  );
}
