/**
 * Public CV share page (EXECUTION_PLAN_NATIVE_CV_BUILDER.md B3) —
 * /cv/[slug] renders a published resume for anyone with the link, no auth.
 * Backed by GET /public/resumes/{share_slug}, which only resolves
 * is_published rows; anything else lands in the not-found state.
 *
 * Server component (not "use client") so generateMetadata can run: the
 * previous client-only version had zero metadata, so every shared link
 * fell back to the sitewide generic title/description/image regardless
 * of whose CV it was — and link-preview crawlers, which don't execute
 * the client fetch, saw an empty shell. ResumePreview itself stays a
 * client component; only the data-fetch + metadata moved server-side.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { serverGetJson } from "@/lib/dataClient";
import ResumePreview from "@/app/Portal/Candidato/Construtor-CV/preview/ResumePreview";
import type { PreviewData } from "@/app/Portal/Candidato/Construtor-CV/preview/AtsClassic";

type PublicResume = {
  title: string;
  data: PreviewData;
  template_slug: string | null;
};

async function getPublicResume(slug: string): Promise<PublicResume | null> {
  return serverGetJson<PublicResume>(`/public/resumes/${encodeURIComponent(slug)}`, {
    revalidateSeconds: 60,
  });
}

function summarize(text: string | undefined, max: number): string | null {
  const trimmed = text?.replace(/\s+/g, " ").trim();
  if (!trimmed) return null;
  return trimmed.length > max ? `${trimmed.slice(0, max - 1)}…` : trimmed;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const resume = await getPublicResume(slug);
  if (!resume) return { title: "CV não encontrado" };

  const fullName = resume.data.fullName?.trim() || "Candidato";
  const role = (resume.data.professionalTitle || resume.data.jobTitle || "").trim();
  const title = role ? `${fullName} — ${role}` : `${fullName} — CV`;
  const description =
    summarize(resume.data.professionalSummary, 155) ||
    `Currículo de ${fullName}${role ? `, ${role}` : ""}. Veja o CV completo na Parvagas.`;
  const ogImage = `/cv/${slug}/opengraph-image`;

  return {
    title,
    description,
    alternates: { canonical: `/cv/${slug}` },
    openGraph: {
      title: `${title} | Parvagas`,
      description,
      url: `/cv/${slug}`,
      type: "profile",
      siteName: "Parvagas",
      images: [ogImage],
    },
    twitter: {
      card: "summary_large_image",
      title: `${title} | Parvagas`,
      description,
      images: [ogImage],
    },
  };
}

export default async function PublicResumePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const resume = await getPublicResume(slug);

  if (!resume) {
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
