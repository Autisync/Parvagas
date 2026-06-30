import { buildApiUrl, getApiBaseUrl } from "@/lib/api";

type ServerGetOptions = {
  revalidateSeconds?: number;
};

export async function serverGetJson<T>(path: string, options: ServerGetOptions = {}): Promise<T | null> {
  const base = getApiBaseUrl();
  if (!base) return null;

  // Use the same URL builder as the client so the /api/v1 prefix is applied
  // consistently. Without this, SSR fetches hit the un-prefixed path and 404,
  // which silently blanks server-rendered pages (homepage featured jobs, job
  // detail) while client-rendered pages keep working.
  try {
    const res = await fetch(buildApiUrl(base, path), {
      next: { revalidate: options.revalidateSeconds ?? 60 },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}
