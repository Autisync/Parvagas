import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let browserClient: SupabaseClient | null = null;
let hasWarnedMissingEnv = false;

export function getSupabaseBrowserEnv() {
  const url = String(process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
  const anonKey = String(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "").trim();
  return { url, anonKey };
}

export function warnMissingSupabaseEnv() {
  if (typeof window === "undefined") return;
  if (hasWarnedMissingEnv) return;

  const { url, anonKey } = getSupabaseBrowserEnv();
  if (url && anonKey) return;

  hasWarnedMissingEnv = true;
  console.warn(
    "[supabase] Variaveis em falta para desenvolvimento local. Defina NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY no .env.local.",
  );
}

export function getSupabaseBrowserClient() {
  const { url, anonKey } = getSupabaseBrowserEnv();
  if (!url || !anonKey) {
    warnMissingSupabaseEnv();
    return null;
  }

  if (!browserClient) {
    browserClient = createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
      },
    });
  }

  return browserClient;
}
