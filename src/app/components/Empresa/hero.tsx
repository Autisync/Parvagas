"use client";
import { useClientLocale } from "@/lib/i18n/client";

export default function EmpresaHero() {
  const { dict } = useClientLocale();

  return (
    <div className="bg-white">
      <div className="relative isolate px-6 pt-14 lg:px-8">
        <div className="mx-auto max-w-4xl py-32 sm:py-48 lg:py-56">
          <div className="text-center">
            <h1 className="text-xl font-normal tracking-tight text-gray-800 sm:text-xl">
              {dict.companyPage.heroEyebrow}
            </h1>
            <h1 className="text-5xl font-bold tracking-tight text-red-500 sm:text-7xl">
              {dict.companyPage.heroTitleLine1}{" "}
              <span className="text-gray-900">{dict.companyPage.heroTitleLine2Lead} </span>
              <span className="text-red-500"> {dict.companyPage.heroTitleLine2Emphasis}</span>
            </h1>
            <p className="mt-6 text-lg leading-6 text-gray-700 font-light">
              {dict.companyPage.heroSubtitle}
            </p>
            <div className="mt-10 flex items-center justify-center gap-x-6">
              <a
                href="#"
                className="text-sm font-semibold leading-6 text-gray-900 hover:text-red-500 hover:scale-105 duration-500 ease-in-out transform"
              >
                {dict.companyPage.heroCta} <span aria-hidden="true">→</span>
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
