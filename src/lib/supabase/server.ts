import { createServerClient } from '@supabase/ssr';
import type { AstroCookies } from 'astro';

/* ---------------------------------------------------------------------------
   Request-scoped Supabase client for server rendering + API routes.
   Reads/writes the auth session via Astro cookies, so RLS runs as the
   logged-in user. Use this for anything that should respect row-level policies.
   --------------------------------------------------------------------------- */

export function createSupabaseServer(cookies: AstroCookies) {
  const url = import.meta.env.PUBLIC_SUPABASE_URL;
  const anonKey = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error('PUBLIC_SUPABASE_URL / PUBLIC_SUPABASE_ANON_KEY are not set');
  }

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookies.getAll().map(({ name, value }) => ({ name, value }));
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          cookies.set(name, value, { ...options, path: '/' });
        });
      },
    },
  });
}

/** Convenience: the current authenticated user (or null). */
export async function getSessionUser(cookies: AstroCookies) {
  const supabase = createSupabaseServer(cookies);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}
