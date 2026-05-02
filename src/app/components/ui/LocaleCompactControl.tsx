"use client";

import { useRouter } from "next/navigation";
import { useClientLocale } from "@/lib/i18n/client";

export default function LocaleCompactControl({
  className = "",
}: {
  className?: string;
}) {
  const router = useRouter();
  const { locale, changeLocale } = useClientLocale();

  return (
    <div className={`inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white p-1 ${className}`}>
      <button
        type="button"
        onClick={() => {
          changeLocale("pt");
          router.refresh();
        }}
        className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${locale === "pt" ? "bg-red-600 text-white" : "text-slate-600 hover:bg-slate-100"}`}
        aria-label="Mudar para português"
      >
        PT
      </button>
      <button
        type="button"
        onClick={() => {
          changeLocale("en");
          router.refresh();
        }}
        className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${locale === "en" ? "bg-red-600 text-white" : "text-slate-600 hover:bg-slate-100"}`}
        aria-label="Switch to English"
      >
        EN
      </button>
    </div>
  );
}
