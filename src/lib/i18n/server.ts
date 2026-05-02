import { cookies } from "next/headers";
import { dictionaries, normalizeLocale, type AppLocale } from "./dictionaries";

export const getServerLocale = (): AppLocale => {
  const value = cookies().get("parvagas_lang")?.value;
  return normalizeLocale(value);
};

export const getServerDictionary = () => {
  return dictionaries[getServerLocale()];
};
