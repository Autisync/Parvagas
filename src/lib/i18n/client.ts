"use client";

import { useEffect, useMemo, useState } from "react";
import { dictionaries, normalizeLocale, type AppLocale } from "./dictionaries";
import { DEFAULT_LOCALE, ENABLE_I18N } from "@/config/appConfig";

const COOKIE_KEY = "parvagas_lang";

const readCookieLocale = (): AppLocale => {
  if (!ENABLE_I18N) return DEFAULT_LOCALE;
  if (typeof document === "undefined") return "pt";
  const match = document.cookie
    .split(";")
    .map((entry) => entry.trim())
    .find((entry) => entry.startsWith(`${COOKIE_KEY}=`));
  return normalizeLocale(match ? match.split("=")[1] : "pt");
};

export const setClientLocale = (locale: AppLocale) => {
  if (!ENABLE_I18N) return;
  if (typeof document === "undefined") return;
  document.cookie = `${COOKIE_KEY}=${locale}; path=/; max-age=${60 * 60 * 24 * 365}`;
};

export const useClientLocale = () => {
  const [locale, setLocale] = useState<AppLocale>(DEFAULT_LOCALE);

  useEffect(() => {
    if (!ENABLE_I18N) {
      setLocale(DEFAULT_LOCALE);
      return;
    }
    setLocale(readCookieLocale());
  }, []);

  const dict = useMemo(() => dictionaries[locale], [locale]);

  return {
    locale,
    dict,
    changeLocale: (next: AppLocale) => {
      if (!ENABLE_I18N) return;
      setClientLocale(next);
      setLocale(next);
    },
  };
};
