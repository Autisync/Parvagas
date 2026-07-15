"use client";

import { useClientLocale } from "@/lib/i18n/client";
import {
  UsersIcon,
  FunnelIcon,
  BuildingOffice2Icon,
  ChartBarIcon,
  GlobeAltIcon,
} from "@heroicons/react/24/outline";

const iconMap = [UsersIcon, FunnelIcon, BuildingOffice2Icon, ChartBarIcon, GlobeAltIcon];

export default function EmpresaBenefits() {
  const { dict } = useClientLocale();
  const cp = dict.companyPage;

  const benefits = [
    { title: cp.benefit1Title, desc: cp.benefit1Desc },
    { title: cp.benefit2Title, desc: cp.benefit2Desc },
    { title: cp.benefit3Title, desc: cp.benefit3Desc },
    { title: cp.benefit4Title, desc: cp.benefit4Desc },
    { title: cp.benefit5Title, desc: cp.benefit5Desc },
  ];

  return (
    <section id="benefits" className="bg-white py-20 sm:py-28" aria-labelledby="benefits-heading">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        {/* Header */}
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-widest text-red-600">
            {cp.benefitsEyebrow}
          </p>
          <h2
            id="benefits-heading"
            className="mt-3 text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl"
          >
            {cp.benefitsTitle}
          </h2>
          <p className="mt-4 text-lg leading-8 text-gray-600">{cp.benefitsSubtitle}</p>
        </div>

        {/* Cards grid — the first benefit is the flagship one, so it gets a
            distinct dark treatment rather than repeating the same tinted
            icon chip on every card regardless of what it represents. */}
        <div className="mx-auto mt-16 grid max-w-2xl grid-cols-1 gap-6 sm:grid-cols-2 lg:max-w-none lg:grid-cols-3">
          {benefits.map((b, i) => {
            const Icon = iconMap[i];
            const flagship = i === 0;
            return (
              <article
                key={b.title}
                className={
                  flagship
                    ? "flex flex-col gap-4 rounded-2xl bg-slate-900 p-7 shadow-sm sm:col-span-2 lg:col-span-1"
                    : "flex flex-col gap-4 rounded-2xl border border-red-100 bg-white p-7 shadow-sm transition hover:shadow-md"
                }
              >
                <div
                  className={
                    flagship
                      ? "inline-flex h-12 w-12 items-center justify-center rounded-xl bg-red-600 text-white"
                      : "inline-flex h-12 w-12 items-center justify-center rounded-xl bg-red-50 text-red-600"
                  }
                >
                  <Icon className="h-6 w-6" aria-hidden="true" />
                </div>
                <h3 className={flagship ? "text-base font-semibold text-white" : "text-base font-semibold text-gray-900"}>
                  {b.title}
                </h3>
                <p className={flagship ? "text-sm leading-7 text-slate-300" : "text-sm leading-7 text-gray-600"}>
                  {b.desc}
                </p>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
