import { createBrowserClient } from '@supabase/ssr';

/* ---------------------------------------------------------------------------
   Browser Supabase client for client-side islands (login form, account
   actions). Uses the public anon key + cookie storage so the session is
   shared with the server client.
   --------------------------------------------------------------------------- */

let cached: ReturnType<typeof createBrowserClient> | null = null;

export function getSupabaseBrowser() {
  if (cached) return cached;
  const url = import.meta.env.PUBLIC_SUPABASE_URL;
  const anonKey = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error('PUBLIC_SUPABASE_URL / PUBLIC_SUPABASE_ANON_KEY are not set');
  }
  cached = createBrowserClient(url, anonKey);
  return cached;
}
