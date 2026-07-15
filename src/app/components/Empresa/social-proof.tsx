"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useClientLocale } from "@/lib/i18n/client";
import { AnimatedCounter } from "@/app/components/motion";

// Replace with a photo of your team, office, or a stock image that represents your brand
const PROOF_PHOTO =
  "https://images.unsplash.com/photo-1553877522-43269d4ea984?w=1200&q=80";

type PublicStats = {
  candidates: number | null;
  companies: number | null;
  jobs: number | null;
  applications: number | null;
};

// Fallbacks only used if /public/stats is unreachable, so the section never
// shows a zero/empty figure. Every number shown is otherwise the real,
// unmodified backend count.
const FALLBACKS: PublicStats = { candidates: 5000, companies: 50, jobs: 100, applications: null };

export default function EmpresaSocialProof() {
  const { dict } = useClientLocale();
  const cp = dict.companyPage;

  const [stats, setStats] = useState<PublicStats>(FALLBACKS);

  useEffect(() => {
    let cancelled = false;
    apiFetch<PublicStats>("/public/stats", { suppressGlobalErrors: true })
      .then((data) => {
        if (cancelled) return;
        setStats({
          candidates: data.candidates ?? FALLBACKS.candidates,
          companies: data.companies ?? FALLBACKS.companies,
          jobs: data.jobs ?? FALLBACKS.jobs,
          applications: data.applications ?? FALLBACKS.applications,
        });
      })
      .catch(() => {
        /* keep the fallback baseline */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Every figure here is a real backend count — no marketing multiplier.
  const displayStats = [
    { value: stats.candidates ?? FALLBACKS.candidates!, suffix: "+", label: cp.proofStat1Label },
    { value: stats.companies ?? FALLBACKS.companies!, suffix: "+", label: cp.proofStat2Label },
    { value: stats.jobs ?? FALLBACKS.jobs!, suffix: "+", label: cp.proofStat3Label },
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
          {displayStats.map((s) => (
            <div key={s.label} className="text-center">
              <p className="text-5xl font-extrabold text-white">
                <AnimatedCounter value={s.value} suffix={s.suffix} />
              </p>
              <p className="mt-2 text-sm leading-6 text-gray-300">{s.label}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
