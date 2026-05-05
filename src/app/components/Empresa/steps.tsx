"use client";

import Link from "next/link";
import { useClientLocale } from "@/lib/i18n/client";

export default function EmpresaSteps() {
  const { dict } = useClientLocale();
  const cp = dict.companyPage;

  const steps = [
    { number: "01", title: cp.step1Title, desc: cp.step1Desc },
    { number: "02", title: cp.step2Title, desc: cp.step2Desc },
    { number: "03", title: cp.step3Title, desc: cp.step3Desc },
  ];

  return (
    <section className="bg-red-600 py-20 sm:py-28" aria-labelledby="steps-heading">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        {/* Header */}
        <div className="mx-auto max-w-2xl text-center text-white">
          <p className="text-sm font-semibold uppercase tracking-widest text-red-200">
            {cp.stepsEyebrow}
          </p>
          <h2
            id="steps-heading"
            className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl"
          >
            {cp.stepsTitle}
          </h2>
          <p className="mt-4 text-lg leading-8 text-red-100">{cp.stepsSubtitle}</p>
        </div>

        {/* Steps */}
        <div className="mx-auto mt-16 grid max-w-2xl grid-cols-1 gap-8 sm:grid-cols-3 lg:max-w-none">
          {steps.map((s) => (
            <div key={s.number} className="relative flex flex-col gap-4">
              {/* Step number */}
              <span className="text-5xl font-extrabold tabular-nums text-red-400/60 select-none">
                {s.number}
              </span>
              <h3 className="text-lg font-semibold text-white">{s.title}</h3>
              <p className="text-sm leading-7 text-red-100">{s.desc}</p>
            </div>
          ))}
        </div>

        {/* CTA button */}
        <div className="mt-14 flex justify-center">
          <Link
            href="/Signup?role=company"
            className="rounded-full bg-white px-8 py-4 text-base font-bold text-red-700 shadow-md transition hover:bg-red-50 hover:shadow-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            {cp.stepsCta}
          </Link>
        </div>
      </div>
    </section>
  );
}
