import { getApiBaseUrl } from "@/lib/api";

export function resolveLogoUrl(value?: string): string {
  if (!value) return "";
  if (/^https?:\/\//i.test(value) || value.startsWith("data:") || value.startsWith("blob:")) return value;
  if (!value.startsWith("/")) return value;
  const base = getApiBaseUrl();
  return base ? `${base}${value}` : value;
}
