"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

export type CarouselIllustration = "hero" | "onboarding" | "hiring" | "jobs";

export type CarouselSlide = {
  eyebrow?: string;
  title: string;
  description: string;
  note?: string;
  ctaHref: string;
  ctaLabel: string;
  illustration: CarouselIllustration;
};

const AUTO_ADVANCE_MS = 6000;

function SlideIllustration({ kind }: { kind: CarouselIllustration }) {
  const common = "h-full w-full";
  switch (kind) {
    case "onboarding":
      return (
        <svg viewBox="0 0 240 240" className={common} xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <circle cx="120" cy="120" r="110" fill="var(--pv-illus-bg, #FEF2F2)" />
          <rect x="70" y="52" width="100" height="136" rx="14" fill="#FFFFFF" stroke="#FCA5A5" strokeWidth="3" />
          <rect x="88" y="76" width="64" height="10" rx="5" fill="#F87171" />
          <rect x="88" y="98" width="64" height="7" rx="3.5" fill="#FCA5A5" />
          <rect x="88" y="114" width="44" height="7" rx="3.5" fill="#FCA5A5" />
          <rect x="88" y="140" width="64" height="7" rx="3.5" fill="#FECACA" />
          <rect x="88" y="156" width="52" height="7" rx="3.5" fill="#FECACA" />
          <circle cx="168" cy="168" r="26" fill="#DC2626" />
          <path d="M158 168l7 7 15-15" stroke="#FFFFFF" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </svg>
      );
    case "hiring":
      return (
        <svg viewBox="0 0 240 240" className={common} xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <circle cx="120" cy="120" r="110" fill="var(--pv-illus-bg, #FEF2F2)" />
          <rect x="62" y="70" width="60" height="118" rx="6" fill="#FFFFFF" stroke="#FCA5A5" strokeWidth="3" />
          <rect x="118" y="46" width="66" height="142" rx="6" fill="#FFFFFF" stroke="#F87171" strokeWidth="3" />
          {[0, 1, 2, 3].map((row) => (
            <g key={`l-${row}`}>
              <rect x="74" y={86 + row * 20} width="12" height="12" fill="#FCA5A5" />
              <rect x="98" y={86 + row * 20} width="12" height="12" fill="#FECACA" />
            </g>
          ))}
          {[0, 1, 2, 3, 4].map((row) => (
            <g key={`r-${row}`}>
              <rect x="130" y={64 + row * 20} width="14" height="14" fill="#F87171" />
              <rect x="156" y={64 + row * 20} width="14" height="14" fill="#FCA5A5" />
            </g>
          ))}
          <rect x="86" y="150" width="24" height="38" rx="2" fill="#DC2626" />
        </svg>
      );
    case "jobs":
      return (
        <svg viewBox="0 0 240 240" className={common} xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <circle cx="120" cy="120" r="110" fill="var(--pv-illus-bg, #FEF2F2)" />
          <rect x="56" y="96" width="128" height="82" rx="12" fill="#FFFFFF" stroke="#FCA5A5" strokeWidth="3" />
          <path d="M92 96v-14a12 12 0 0112-12h32a12 12 0 0112 12v14" fill="none" stroke="#F87171" strokeWidth="6" strokeLinecap="round" />
          <rect x="56" y="122" width="128" height="14" fill="#FEE2E2" />
          <rect x="108" y="118" width="24" height="22" rx="4" fill="#DC2626" />
          <circle cx="184" cy="72" r="22" fill="#DC2626" />
          <path d="M177 72l5 5 10-11" stroke="#FFFFFF" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </svg>
      );
    case "hero":
    default:
      return (
        <svg viewBox="0 0 240 240" className={common} xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <circle cx="120" cy="120" r="110" fill="var(--pv-illus-bg, #FEF2F2)" />
          <circle cx="88" cy="96" r="30" fill="#FECACA" />
          <circle cx="88" cy="96" r="30" fill="none" stroke="#F87171" strokeWidth="3" />
          <circle cx="160" cy="120" r="24" fill="#FCA5A5" />
          <circle cx="160" cy="120" r="24" fill="none" stroke="#DC2626" strokeWidth="3" />
          <path d="M88 126v18M160 144v14" stroke="#F87171" strokeWidth="4" strokeLinecap="round" />
          <path d="M60 176c6-20 24-30 28-30s22 10 28 30" fill="none" stroke="#DC2626" strokeWidth="5" strokeLinecap="round" />
          <path d="M132 186c5-16 18-24 28-24s23 8 28 24" fill="none" stroke="#F87171" strokeWidth="5" strokeLinecap="round" />
          <path d="M112 92l14 14 24-24" stroke="#DC2626" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </svg>
      );
  }
}

export default function HomeCarousel({
  slides,
  prevLabel,
  nextLabel,
  slideLabels,
}: {
  slides: CarouselSlide[];
  prevLabel: string;
  nextLabel: string;
  slideLabels: string[];
}) {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const count = slides.length;

  const goTo = useCallback((index: number) => {
    setActive(((index % count) + count) % count);
  }, [count]);

  useEffect(() => {
    if (paused || count <= 1) return;
    const timer = setInterval(() => {
      setActive((current) => (current + 1) % count);
    }, AUTO_ADVANCE_MS);
    return () => clearInterval(timer);
  }, [paused, count]);

  return (
    <div
      className="relative overflow-hidden rounded-3xl border border-red-100 bg-white/60 shadow-sm"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div
        className="flex transition-transform duration-500 ease-out"
        style={{ transform: `translateX(-${active * 100}%)` }}
      >
        {slides.map((slide, index) => (
          <div
            key={index}
            className="grid w-full flex-shrink-0 grid-cols-1 items-center gap-6 px-8 py-12 sm:px-12 md:grid-cols-2 md:gap-10 md:py-14"
            aria-hidden={index !== active}
          >
            <div className="text-center md:text-left">
              {slide.eyebrow && (
                <p className="text-sm uppercase tracking-[0.2em] text-red-600 font-semibold">{slide.eyebrow}</p>
              )}
              <h2 className="mt-4 text-balance text-3xl sm:text-4xl font-bold leading-tight">{slide.title}</h2>
              <p className="mt-4 text-pretty text-base sm:text-lg text-gray-700 max-w-xl mx-auto md:mx-0">{slide.description}</p>
              {slide.note && (
                <p className="mt-4 inline-block rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900">
                  {slide.note}
                </p>
              )}
              <div className="mt-8">
                <Link href={slide.ctaHref} className="app-btn-primary px-6 py-3">
                  {slide.ctaLabel}
                </Link>
              </div>
            </div>
            <div className="mx-auto h-40 w-40 shrink-0 sm:h-52 sm:w-52 md:mx-0 md:h-60 md:w-60">
              <SlideIllustration kind={slide.illustration} />
            </div>
          </div>
        ))}
      </div>

      {count > 1 && (
        <>
          <button
            type="button"
            onClick={() => goTo(active - 1)}
            aria-label={prevLabel}
            className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-white/90 p-2 text-red-700 shadow-sm ring-1 ring-red-100 hover:bg-white"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
              <path fillRule="evenodd" d="M12.79 5.23a.75.75 0 01-.02 1.06L8.832 10l3.938 3.71a.75.75 0 11-1.04 1.08l-4.5-4.25a.75.75 0 010-1.08l4.5-4.25a.75.75 0 011.06.02z" clipRule="evenodd" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => goTo(active + 1)}
            aria-label={nextLabel}
            className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-white/90 p-2 text-red-700 shadow-sm ring-1 ring-red-100 hover:bg-white"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
              <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
            </svg>
          </button>

          <div className="flex justify-center gap-2 pb-5">
            {slides.map((_, index) => (
              <button
                key={index}
                type="button"
                onClick={() => goTo(index)}
                aria-label={slideLabels[index] ?? `${index + 1}`}
                aria-current={index === active}
                className={`h-2.5 rounded-full transition-all ${
                  index === active ? "w-6 bg-red-600" : "w-2.5 bg-red-200 hover:bg-red-300"
                }`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
