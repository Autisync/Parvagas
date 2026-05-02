import { getApiBaseUrl } from "@/lib/api";

type ServerGetOptions = {
  revalidateSeconds?: number;
};

export async function serverGetJson<T>(path: string, options: ServerGetOptions = {}): Promise<T | null> {
  const base = getApiBaseUrl();
  if (!base) return null;

  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  try {
    const res = await fetch(`${base}${normalizedPath}`, {
      next: { revalidate: options.revalidateSeconds ?? 60 },
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}
