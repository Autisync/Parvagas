"use client";

import { useState } from "react";
import Link from "next/link";
import { useClientLocale } from "@/lib/i18n/client";
import { ChevronDownIcon } from "@heroicons/react/24/outline";

export default function EmpresaFaq() {
  const { dict } = useClientLocale();
  const cp = dict.companyPage;

  const faqs = [
    { q: cp.faq1Q, a: cp.faq1A },
    { q: cp.faq2Q, a: cp.faq2A },
    { q: cp.faq3Q, a: cp.faq3A },
    { q: cp.faq4Q, a: cp.faq4A },
  ];

  const [open, setOpen] = useState<number | null>(null);

  const toggle = (i: number) => setOpen(open === i ? null : i);

  return (
    <section className="bg-white py-20 sm:py-28" aria-labelledby="faq-heading">
      <div className="mx-auto max-w-3xl px-6 lg:px-8">
        {/* Header */}
        <div className="text-center">
          <p className="text-sm font-semibold uppercase tracking-widest text-red-600">
            {cp.faqEyebrow}
          </p>
          <h2
            id="faq-heading"
            className="mt-3 text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl"
          >
            {cp.faqTitle}
          </h2>
          <p className="mt-4 text-lg text-gray-600">{cp.faqSubtitle}</p>
        </div>

        {/* Accordion */}
        <dl className="mt-12 divide-y divide-gray-100">
          {faqs.map((faq, i) => (
            <div key={faq.q} className="py-5">
              <dt>
                <button
                  type="button"
                  className="flex w-full items-start justify-between gap-4 text-left"
                  aria-expanded={open === i}
                  aria-controls={`faq-answer-${i}`}
                  onClick={() => toggle(i)}
                >
                  <span className="text-base font-semibold text-gray-900">{faq.q}</span>
                  <ChevronDownIcon
                    className={`mt-0.5 h-5 w-5 shrink-0 text-red-500 transition-transform duration-200 ${
                      open === i ? "rotate-180" : ""
                    }`}
                    aria-hidden="true"
                  />
                </button>
              </dt>
              <dd
                id={`faq-answer-${i}`}
                className={`overflow-hidden transition-all duration-200 ${
                  open === i ? "mt-4 max-h-96" : "max-h-0"
                }`}
              >
                <p className="text-sm leading-7 text-gray-600">{faq.a}</p>
              </dd>
            </div>
          ))}
        </dl>

        {/* Support link */}
        <div className="mt-12 text-center">
          <Link
            href="mailto:suporte@parvagas.co.ao"
            className="inline-flex items-center gap-2 rounded-full border border-red-200 px-6 py-3 text-sm font-semibold text-red-700 transition hover:bg-red-50"
          >
            {cp.faqSupportLink}
          </Link>
        </div>
      </div>
    </section>
  );
}
