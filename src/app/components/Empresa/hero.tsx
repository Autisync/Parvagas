"use client";
import Image from "next/image";
import { useClientLocale } from "@/lib/i18n/client";

// Replace this URL with a photo that represents your team or workplace
const HERO_PHOTO =
  "https://images.unsplash.com/photo-1600880292203-757bb62b4baf?w=1200&q=80";

export default function EmpresaHero() {
  const { dict } = useClientLocale();

  return (
    <section className="overflow-hidden bg-white">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="grid min-h-[560px] grid-cols-1 items-center gap-12 py-16 lg:grid-cols-2 lg:py-24">
          {/* ── Left: copy ── */}
          <div className="order-2 lg:order-1">
            <p className="text-sm font-semibold uppercase tracking-widest text-red-600">
              {dict.companyPage.heroEyebrow}
            </p>
            <h1 className="mt-4 text-4xl font-extrabold tracking-tight text-gray-900 sm:text-5xl lg:text-6xl">
              {dict.companyPage.heroTitleLine1}{" "}
              <span className="text-red-600">{dict.companyPage.heroTitleLine2Lead}</span>{" "}
              <span className="text-gray-900">{dict.companyPage.heroTitleLine2Emphasis}</span>
            </h1>
            <p className="mt-6 text-lg leading-8 text-gray-600 max-w-xl">
              {dict.companyPage.heroSubtitle}
            </p>
            <div className="mt-10 flex flex-wrap items-center gap-4">
              <a
                href="/Signup?role=company"
                className="rounded-full bg-red-600 px-8 py-4 text-base font-bold text-white shadow-md transition hover:bg-red-700 hover:shadow-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600"
              >
                {dict.companyPage.heroCta}
              </a>
              <a
                href="#benefits"
                className="flex items-center gap-1.5 rounded-full border border-gray-200 px-6 py-3.5 text-sm font-semibold text-gray-700 transition hover:border-red-200 hover:text-red-700"
              >
                Saber mais <span aria-hidden="true">↓</span>
              </a>
            </div>

            {/* Trust badges */}
            <div className="mt-10 flex flex-wrap items-center gap-6">
              {[
                { value: "5 000+", label: "candidatos activos" },
                { value: "48 h", label: "para verificação" },
                { value: "100%", label: "gratuito para registar" },
              ].map((badge) => (
                <div key={badge.label} className="text-center">
                  <p className="text-2xl font-extrabold text-red-600">{badge.value}</p>
                  <p className="text-xs text-gray-500">{badge.label}</p>
                </div>
              ))}
            </div>
          </div>

          {/* ── Right: photo ── */}
          <div className="order-1 lg:order-2 relative">
            <div className="relative overflow-hidden rounded-3xl shadow-2xl aspect-[4/3]">
              <Image
                src={HERO_PHOTO}
                alt="Equipa em reunião de recrutamento"
                fill
                className="object-cover"
                priority
                sizes="(max-width: 1024px) 100vw, 50vw"
              />
              {/* Red accent overlay */}
              <div className="absolute inset-0 bg-gradient-to-tr from-red-900/20 to-transparent" />
            </div>
            {/* Floating badge */}
            <div className="absolute -bottom-4 -left-4 rounded-2xl border border-red-100 bg-white px-5 py-3 shadow-lg">
              <p className="text-xs font-semibold text-gray-500">Angola & Portugal</p>
              <p className="text-lg font-extrabold text-red-600">Recrute sem fronteiras</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
