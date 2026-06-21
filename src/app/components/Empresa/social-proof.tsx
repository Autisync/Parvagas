"use client";

import Image from "next/image";
import { useClientLocale } from "@/lib/i18n/client";

// Replace with a photo of your team, office, or a stock image that represents your brand
const PROOF_PHOTO =
  "https://images.unsplash.com/photo-1553877522-43269d4ea984?w=1200&q=80";

export default function EmpresaSocialProof() {
  const { dict } = useClientLocale();
  const cp = dict.companyPage;

  const stats = [
    { value: cp.proofStat1Value, label: cp.proofStat1Label },
    { value: cp.proofStat2Value, label: cp.proofStat2Label },
    { value: cp.proofStat3Value, label: cp.proofStat3Label },
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
            <div key={s.value} className="text-center">
              <p className="text-5xl font-extrabold text-white">{s.value}</p>
              <p className="mt-2 text-sm leading-6 text-gray-500">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Testimonial card */}
        <figure className="mx-auto mt-16 max-w-2xl rounded-2xl border border-white/10 bg-white/5 p-8 shadow-sm backdrop-blur-sm">
          <blockquote>
            <p className="text-base leading-8 text-gray-200 before:content-['\u201c'] after:content-['\u201d']">
              {cp.proofTestimonialQuote}
            </p>
          </blockquote>
          <figcaption className="mt-6 flex items-center gap-4">
            <div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-red-600 text-sm font-bold text-white">
              {cp.proofTestimonialAuthor.slice(0, 2).toUpperCase()}
            </div>
            <div>
              <p className="text-sm font-semibold text-white">{cp.proofTestimonialAuthor}</p>
              <p className="text-xs text-gray-500">{cp.proofTestimonialRole}</p>
            </div>
          </figcaption>
        </figure>
      </div>
    </section>
  );
}
