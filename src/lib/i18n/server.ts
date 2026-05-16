import { cookies } from "next/headers";
import { dictionaries, normalizeLocale, type AppLocale } from "./dictionaries";
import { DEFAULT_LOCALE, ENABLE_I18N } from "@/config/appConfig";

export const getServerLocale = async (): Promise<AppLocale> => {
  if (!ENABLE_I18N) return DEFAULT_LOCALE;
  const cookieStore = await cookies();
  const value = cookieStore.get("parvagas_lang")?.value;
  return normalizeLocale(value);
};

export const getServerDictionary = async () => {
  const locale = await getServerLocale();
  return dictionaries[locale];
};
