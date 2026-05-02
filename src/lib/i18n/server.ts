import { cookies } from "next/headers";
import { dictionaries, normalizeLocale, type AppLocale } from "./dictionaries";
import { DEFAULT_LOCALE, ENABLE_I18N } from "@/config/appConfig";

export const getServerLocale = (): AppLocale => {
  if (!ENABLE_I18N) return DEFAULT_LOCALE;
  const value = cookies().get("parvagas_lang")?.value;
  return normalizeLocale(value);
};

export const getServerDictionary = () => {
  return dictionaries[getServerLocale()];
};
