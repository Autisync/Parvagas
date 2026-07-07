"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
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

const SLIDE_IMAGES: Record<CarouselIllustration, string> = {
  hero: "https://images.pexels.com/photos/35340757/pexels-photo-35340757.jpeg",
  onboarding: "https://images.pexels.com/photos/8152735/pexels-photo-8152735.jpeg",
  hiring: "https://images.pexels.com/photos/7792757/pexels-photo-7792757.jpeg",
  jobs: "https://images.pexels.com/photos/9841328/pexels-photo-9841328.jpeg",
};

function SlideImage({ kind, alt }: { kind: CarouselIllustration; alt: string }) {
  return (
    <Image
      src={SLIDE_IMAGES[kind]}
      alt={alt}
      fill
      sizes="(min-width: 768px) 320px, 220px"
      className="object-cover"
      priority={kind === "hero"}
    />
  );
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
            <div className="relative mx-auto h-48 w-full max-w-xs shrink-0 overflow-hidden rounded-2xl shadow-md sm:h-64 md:mx-0 md:h-72">
              <SlideImage kind={slide.illustration} alt={slide.title} />
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
