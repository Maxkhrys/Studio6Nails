import { createServerClient, parseCookieHeader } from '@supabase/ssr';
import type { AstroCookies } from 'astro';

/* ---------------------------------------------------------------------------
   Request-scoped Supabase client for server rendering + API routes.
   Reads/writes the auth session via Astro cookies, so RLS runs as the
   logged-in user. Use this for anything that should respect row-level policies.

   Reads come from the raw `Cookie` request header (Astro's cookie object has
   no `getAll()`), and writes go through Astro's cookie API. `parseCookieHeader`
   URI-decodes values, matching the encoding Astro applies on `set`, so the
   session round-trips intact.
   --------------------------------------------------------------------------- */

export function createSupabaseServer(cookies: AstroCookies, request?: Request) {
  const url = import.meta.env.PUBLIC_SUPABASE_URL;
  const anonKey = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error('PUBLIC_SUPABASE_URL / PUBLIC_SUPABASE_ANON_KEY are not set');
  }

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        const header = request?.headers.get('Cookie') ?? '';
        if (!header) return [];
        return parseCookieHeader(header).map(({ name, value }) => ({
          name,
          value: value ?? '',
        }));
      },
      setAll(cookiesToSet) {
        // During static prerendering Astro's cookie API isn't writable.
        if (typeof cookies.set !== 'function') return;
        cookiesToSet.forEach(({ name, value, options }) => {
          cookies.set(name, value, { ...options, path: '/' });
        });
      },
    },
  });
}

/** Convenience: the current authenticated user (or null). */
export async function getSessionUser(cookies: AstroCookies, request?: Request) {
  const supabase = createSupabaseServer(cookies, request);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}
