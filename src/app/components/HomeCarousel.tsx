"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ChevronLeftIcon, ChevronRightIcon } from "@heroicons/react/24/solid";
import CvBuilderCta from "@/app/components/CvBuilderCta";

export type CarouselIllustration = "hero" | "onboarding" | "hiring" | "jobs" | "cvBuilder";

export type CarouselSlide = {
  eyebrow?: string;
  title: string;
  description: string;
  note?: string;
  ctaHref: string;
  ctaLabel: string;
  illustration: CarouselIllustration;
};

const AUTO_ADVANCE_MS = 6500;

const SLIDE_IMAGES: Record<CarouselIllustration, string> = {
  hero: "https://images.pexels.com/photos/35340757/pexels-photo-35340757.jpeg",
  onboarding: "https://images.pexels.com/photos/8152735/pexels-photo-8152735.jpeg",
  hiring: "https://images.pexels.com/photos/7792757/pexels-photo-7792757.jpeg",
  jobs: "https://images.pexels.com/photos/9841328/pexels-photo-9841328.jpeg",
  cvBuilder: "https://images.pexels.com/photos/5989925/pexels-photo-5989925.jpeg",
};

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const handler = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return reduced;
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
  const reducedMotion = useReducedMotion();
  const count = slides.length;
  const slide = slides[active];

  const goTo = useCallback((index: number) => {
    setActive(((index % count) + count) % count);
  }, [count]);

  useEffect(() => {
    if (paused || reducedMotion || count <= 1) return;
    const timer = setInterval(() => {
      setActive((current) => (current + 1) % count);
    }, AUTO_ADVANCE_MS);
    return () => clearInterval(timer);
  }, [paused, reducedMotion, count]);

  return (
    <div
      className="relative min-h-dvh w-full overflow-hidden bg-slate-950"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onTouchStart={() => setPaused(true)}
    >
      {/* Background images — crossfaded, all mounted so priority/preload works cleanly */}
      {slides.map((s, index) => (
        <div
          key={s.illustration}
          className={`absolute inset-0 transition-opacity duration-[1200ms] ease-out ${
            index === active ? "opacity-100" : "opacity-0"
          }`}
          aria-hidden={index !== active}
        >
          <Image
            src={SLIDE_IMAGES[s.illustration]}
            alt=""
            fill
            sizes="100vw"
            priority={index === 0}
            className="object-cover"
          />
        </div>
      ))}

      {/* Scrim — localized to the lower-left text region so bright daytime
          photos still read as photos, not a near-black backdrop. */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/85 from-0% via-black/35 via-45% to-transparent to-75%" />
      <div className="absolute inset-0 bg-gradient-to-r from-black/55 from-0% via-transparent via-60%" />

      {/* Content */}
      <div className="relative z-10 mx-auto flex min-h-dvh w-full max-w-7xl flex-col justify-end px-6 pb-28 pt-28 sm:px-10 sm:pb-32 lg:px-16">
        <div key={active} className="max-w-2xl">
          {slide.eyebrow ? (
            <p className="pv-animate-in text-sm font-semibold uppercase tracking-[0.22em] text-red-300">
              {slide.eyebrow}
            </p>
          ) : null}
          <h1 className="pv-animate-in mt-4 text-balance text-4xl font-bold leading-[1.05] text-white sm:text-5xl lg:text-6xl">
            {slide.title}
          </h1>
          <p className="pv-animate-in mt-5 max-w-xl text-pretty text-lg leading-relaxed text-slate-200 sm:text-xl">
            {slide.description}
          </p>
          {slide.note ? (
            <p className="pv-animate-in mt-5 inline-block rounded-xl border border-white/20 bg-white/10 px-3.5 py-2 text-sm font-medium text-white backdrop-blur-sm">
              {slide.note}
            </p>
          ) : null}
          <div className="pv-animate-in mt-9 flex flex-wrap items-center gap-4">
            {slide.illustration === "cvBuilder" ? (
              // Auth-aware: logged-in candidates jump straight to the editor,
              // anonymous visitors land on the guest "build from scratch" form
              // (see CvBuilderCta) — a bare href can't branch on auth state.
              <CvBuilderCta label={slide.ctaLabel} className="app-btn-primary px-7 py-3.5 text-base" />
            ) : (
              <Link href={slide.ctaHref} className="app-btn-primary px-7 py-3.5 text-base">
                {slide.ctaLabel}
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* Controls */}
      {count > 1 ? (
        <>
          {/* top-24 on mobile keeps these clear of the bottom-anchored text
              block, which runs full-width on small screens; from sm: up the
              text is capped at max-w-2xl so vertical-centering is safe. */}
          <button
            type="button"
            onClick={() => goTo(active - 1)}
            aria-label={prevLabel}
            className="absolute left-3 top-24 z-10 rounded-full border border-white/15 bg-white/10 p-2.5 text-white backdrop-blur-sm transition hover:bg-white/20 sm:left-6 sm:top-1/2 sm:-translate-y-1/2"
          >
            <ChevronLeftIcon className="h-5 w-5" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => goTo(active + 1)}
            aria-label={nextLabel}
            className="absolute right-3 top-24 z-10 rounded-full border border-white/15 bg-white/10 p-2.5 text-white backdrop-blur-sm transition hover:bg-white/20 sm:right-6 sm:top-1/2 sm:-translate-y-1/2"
          >
            <ChevronRightIcon className="h-5 w-5" aria-hidden="true" />
          </button>

          <div className="absolute inset-x-0 bottom-8 z-10 flex justify-center gap-2 px-6 sm:justify-start sm:px-16">
            {slides.map((_, index) => (
              <button
                key={index}
                type="button"
                onClick={() => goTo(index)}
                aria-label={slideLabels[index] ?? `${index + 1}`}
                aria-current={index === active}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  index === active ? "w-8 bg-white" : "w-4 bg-white/35 hover:bg-white/55"
                }`}
              />
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
