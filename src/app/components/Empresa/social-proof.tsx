"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useClientLocale } from "@/lib/i18n/client";
import { AnimatedCounter } from "@/app/components/motion";

// Replace with a photo of your team, office, or a stock image that represents your brand
const PROOF_PHOTO =
  "https://images.unsplash.com/photo-1553877522-43269d4ea984?w=1200&q=80";

// Marketing uplift applied to the real backend figure, and the safe fallback
// shown if the stats endpoint is unavailable.
const MARKETING_UPLIFT = 1.15;
const CANDIDATES_FALLBACK = 5000;

type PublicStats = {
  candidates: number | null;
  companies: number | null;
  jobs: number | null;
  applications: number | null;
};

export default function EmpresaSocialProof() {
  const { dict } = useClientLocale();
  const cp = dict.companyPage;

  // Real active-candidate count from the backend, inflated 15% for marketing.
  // Falls back to a baseline so the section never shows an empty/zero figure.
  const [candidates, setCandidates] = useState<number>(CANDIDATES_FALLBACK);

  useEffect(() => {
    let cancelled = false;
    apiFetch<PublicStats>("/public/stats", { suppressGlobalErrors: true })
      .then((data) => {
        if (cancelled) return;
        if (typeof data.candidates === "number" && data.candidates > 0) {
          setCandidates(Math.round(data.candidates * MARKETING_UPLIFT));
        }
      })
      .catch(() => {
        /* keep the fallback baseline */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // value + suffix drive the count-up; label stays copy-driven from the dict.
  // Only the middle stat is a real backend metric; the others are marketing
  // claims that still animate for consistency.
  const stats = [
    { value: 90, suffix: "%", label: cp.proofStat1Label },
    { value: candidates, suffix: "+", label: cp.proofStat2Label },
    { value: 3, suffix: "×", label: cp.proofStat3Label },
  ];

  return (
    <section className="relative overflow-hidden py-20 sm:py-28" aria-labelledby="proof-heading">
      {/* Background photo with dark overlay */}
      <div className="absolute inset-0">
        <Image
          src={PROOF_PHOTO}
          alt=""
          fill
          className="object-cover"
          sizes="100vw"
        />
        {/* Strong dark overlay for legibility */}
        <div className="absolute inset-0 bg-black/70" />
      </div>

      <div className="relative z-10 mx-auto max-w-7xl px-6 lg:px-8">
        <p
          id="proof-heading"
          className="text-center text-sm font-semibold uppercase tracking-widest text-red-400"
        >
          {cp.proofEyebrow}
        </p>

        {/* Stats row */}
        <div className="mx-auto mt-10 grid max-w-4xl grid-cols-1 gap-8 sm:grid-cols-3">
          {stats.map((s) => (
            <div key={s.label} className="text-center">
              <p className="text-5xl font-extrabold text-white">
                <AnimatedCounter value={s.value} suffix={s.suffix} />
              </p>
              <p className="mt-2 text-sm leading-6 text-gray-300">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Testimonial card */}
        <figure className="mx-auto mt-16 max-w-2xl rounded-2xl border border-white/10 bg-white/5 p-8 shadow-sm backdrop-blur-sm">
          <blockquote>
            <p className="text-base leading-8 text-gray-200">
              &ldquo;{cp.proofTestimonialQuote}&rdquo;
            </p>
          </blockquote>
          <figcaption className="mt-6 flex items-center gap-4">
            <div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-red-600 text-sm font-bold text-white">
              {cp.proofTestimonialAuthor.slice(0, 2).toUpperCase()}
            </div>
            <div>
              <p className="text-sm font-semibold text-white">{cp.proofTestimonialAuthor}</p>
              <p className="text-xs text-gray-400">{cp.proofTestimonialRole}</p>
            </div>
          </figcaption>
        </figure>
      </div>
    </section>
  );
}
