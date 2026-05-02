import { createClient } from "@supabase/supabase-js";

let _client = null;

export const isSupabaseConfigured = () =>
  Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);

export function requireSupabase() {
  if (!_client) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      throw new Error("Supabase is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
    }
    _client = createClient(url, key, { auth: { persistSession: false } });
  }
  return _client;
}

/** Reset cached client (used in tests to reinitialise after env is set). */
export function resetSupabaseClient() {
  _client = null;
}
