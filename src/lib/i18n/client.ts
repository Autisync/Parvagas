"use client";

import { useEffect, useMemo, useState } from "react";
import { dictionaries, normalizeLocale, type AppLocale } from "./dictionaries";

const COOKIE_KEY = "parvagas_lang";

const readCookieLocale = (): AppLocale => {
  if (typeof document === "undefined") return "pt";
  const match = document.cookie
    .split(";")
    .map((entry) => entry.trim())
    .find((entry) => entry.startsWith(`${COOKIE_KEY}=`));
  return normalizeLocale(match ? match.split("=")[1] : "pt");
};

export const setClientLocale = (locale: AppLocale) => {
  if (typeof document === "undefined") return;
  document.cookie = `${COOKIE_KEY}=${locale}; path=/; max-age=${60 * 60 * 24 * 365}`;
};

export const useClientLocale = () => {
  const [locale, setLocale] = useState<AppLocale>("pt");

  useEffect(() => {
    setLocale(readCookieLocale());
  }, []);

  const dict = useMemo(() => dictionaries[locale], [locale]);

  return {
    locale,
    dict,
    changeLocale: (next: AppLocale) => {
      setClientLocale(next);
      setLocale(next);
    },
  };
};
