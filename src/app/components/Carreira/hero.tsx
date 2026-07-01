"use client";

import { useState } from "react";
import Image from "next/image";
import { PlayCircleIcon } from "@heroicons/react/24/solid";
import { useClientLocale } from "@/lib/i18n/client";

// ─── Replace these with your own assets ───────────────────────────────────────
// HERO_BG: full-width background for the top hero strip
const HERO_BG =
  "https://images.unsplash.com/photo-1522202176988-66273c2fd55f?w=1600&q=80";

// VIDEO_POSTER: thumbnail shown before the video plays
const VIDEO_POSTER =
  "https://images.unsplash.com/photo-1434030216411-0b793f4b4173?w=1200&q=80";

// VIDEO_EMBED_URL: featured tutorial embed (privacy-friendly youtube-nocookie).
// Current clip: "Como fazer O MELHOR CURRÍCULO" by Pedro Ferreira (TUDO É GESTÃO);
// verified embeddable (playableInEmbed: true). To swap, change VIDEO_ID plus the
// VIDEO_TITLE/VIDEO_AUTHOR credit strings below.
const VIDEO_ID = "y279jGn4jdQ";
const VIDEO_TITLE = "Como fazer O MELHOR CURRÍCULO";
const VIDEO_AUTHOR = "Pedro Ferreira (TUDO É GESTÃO)";
const VIDEO_EMBED_URL = `https://www.youtube-nocookie.com/embed/${VIDEO_ID}?autoplay=1&rel=0&modestbranding=1`;
const VIDEO_SOURCE_URL = `https://www.youtube.com/watch?v=${VIDEO_ID}`;
// ──────────────────────────────────────────────────────────────────────────────

export default function CarreiraHero() {
  const { dict } = useClientLocale();
  const cl = dict.careerList;
  const [playing, setPlaying] = useState(false);

  return (
    <>
      {/* ── Hero strip ─────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        {/* Background photo */}
        <div className="absolute inset-0">
          <Image
            src={HERO_BG}
            alt=""
            fill
            className="object-cover"
            priority
            sizes="100vw"
          />
          {/* Strong dark overlay so text is always legible */}
          <div className="absolute inset-0 bg-black/65" />
        </div>

        <div className="relative z-10 mx-auto max-w-4xl px-6 py-24 text-center lg:px-8 lg:py-32">
          <p className="text-sm font-semibold uppercase tracking-widest text-red-400">
            {cl.heroEyebrow}
          </p>
          <h1 className="mt-4 text-4xl font-extrabold tracking-tight text-white sm:text-5xl lg:text-6xl">
            {cl.heroTitle}
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-8 text-gray-300">
            {cl.heroSubtitle}
          </p>
          <div className="mt-10 flex items-center justify-center">
            <a
              href="#artigos"
              className="rounded-full bg-red-600 px-8 py-4 text-base font-bold text-white shadow-md transition hover:bg-red-700 hover:shadow-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600"
            >
              {cl.heroCta}
            </a>
          </div>
        </div>
      </section>

      {/* ── Featured video ─────────────────────────────────────────────── */}
      <section className="bg-white py-16 sm:py-20">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-2">
            {/* Video player / poster + credit */}
            <div>
              <div className="relative overflow-hidden rounded-3xl shadow-2xl aspect-video bg-gray-900">
                {playing ? (
                  <iframe
                    src={VIDEO_EMBED_URL}
                    allow="autoplay; fullscreen"
                    allowFullScreen
                    className="absolute inset-0 h-full w-full border-0"
                    title={cl.videoTitle}
                  />
                ) : (
                  <>
                    <Image
                      src={VIDEO_POSTER}
                      alt={cl.videoTitle}
                      fill
                      className="object-cover"
                      sizes="(max-width: 1024px) 100vw, 50vw"
                    />
                    {/* Dark overlay */}
                    <div className="absolute inset-0 bg-gray-900/40" />
                    {/* Play button */}
                    <button
                      type="button"
                      aria-label={cl.videoPlayLabel}
                      onClick={() => setPlaying(true)}
                      className="absolute inset-0 flex items-center justify-center group"
                    >
                      <PlayCircleIcon
                        className="h-20 w-20 text-white drop-shadow-lg transition group-hover:scale-110 group-hover:text-red-400"
                        aria-hidden="true"
                      />
                    </button>
                  </>
                )}
              </div>
              {/* Video credit — the featured clip is third-party content shown
                  under YouTube's terms; we credit and link back to the source. */}
              <p className="mt-3 text-xs text-gray-400">
                Vídeo:{" "}
                <a
                  href={VIDEO_SOURCE_URL}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="underline underline-offset-2 hover:text-red-600"
                >
                  &ldquo;{VIDEO_TITLE}&rdquo;
                </a>{" "}
                por {VIDEO_AUTHOR}, via YouTube.
              </p>
            </div>

            {/* Copy */}
            <div>
              <p className="text-sm font-semibold uppercase tracking-widest text-red-600">
                Vídeo em destaque
              </p>
              <h2 className="mt-3 text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">
                {cl.videoTitle}
              </h2>
              <p className="mt-4 text-base leading-8 text-gray-600">{cl.videoSubtitle}</p>
              <button
                type="button"
                onClick={() => setPlaying(true)}
                className="mt-8 inline-flex items-center gap-2 rounded-full border border-red-200 px-6 py-3 text-sm font-semibold text-red-700 transition hover:bg-red-50"
              >
                <PlayCircleIcon className="h-5 w-5" aria-hidden="true" />
                {cl.videoPlayLabel}
              </button>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
