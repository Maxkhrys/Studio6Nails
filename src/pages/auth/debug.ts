import type { APIRoute } from 'astro';
import { createSupabaseServer } from '../../lib/supabase/server';

/* ---------------------------------------------------------------------------
   TEMPORARY auth diagnostic. Visit /auth/debug in the browser (while "logged
   in") to see whether the Supabase session cookie is actually reaching the
   server and whether it validates. Reports only cookie NAMES + sizes and the
   user id/email — never raw token values. Remove once the login issue is fixed.
   --------------------------------------------------------------------------- */

export const prerender = false;

export const GET: APIRoute = async ({ request, cookies }) => {
  const cookieHeader = request.headers.get('cookie') ?? '';
  const present = cookieHeader
    .split(';')
    .map((c) => c.trim())
    .filter(Boolean)
    .map((c) => {
      const eq = c.indexOf('=');
      const name = eq === -1 ? c : c.slice(0, eq);
      const value = eq === -1 ? '' : c.slice(eq + 1);
      return { name, length: value.length };
    });

  const supabaseCookies = present.filter((c) => c.name.startsWith('sb-'));

  const configured =
    !!import.meta.env.PUBLIC_SUPABASE_URL && !!import.meta.env.PUBLIC_SUPABASE_ANON_KEY;

  let getUserResult: unknown = 'not-run';
  let getSessionResult: unknown = 'not-run';

  if (configured) {
    try {
      const supabase = createSupabaseServer(cookies, request);
      const { data: userData, error: userErr } = await supabase.auth.getUser();
      getUserResult = userErr
        ? { error: userErr.message, status: userErr.status }
        : { id: userData.user?.id ?? null, email: userData.user?.email ?? null };

      const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
      getSessionResult = sessionErr
        ? { error: sessionErr.message }
        : {
            hasSession: !!sessionData.session,
            expiresAt: sessionData.session?.expires_at ?? null,
          };
    } catch (err) {
      getUserResult = { thrown: err instanceof Error ? err.message : String(err) };
    }
  }

  const body = {
    configured,
    supabaseUrlHost: (() => {
      try {
        return new URL(import.meta.env.PUBLIC_SUPABASE_URL).host;
      } catch {
        return null;
      }
    })(),
    anonKeyPresent: !!import.meta.env.PUBLIC_SUPABASE_ANON_KEY,
    totalCookies: present.length,
    supabaseCookies,
    allCookieNames: present.map((c) => c.name),
    getUser: getUserResult,
    getSession: getSessionResult,
  };

  return new Response(JSON.stringify(body, null, 2), {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
};
