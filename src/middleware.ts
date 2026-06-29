import { defineMiddleware } from 'astro:middleware';
import { createSupabaseServer } from './lib/supabase/server';
import type { AppProfile } from './env';

/* ---------------------------------------------------------------------------
   Auth middleware.

   Attaches { supabase, user, profile } to Astro.locals and guards the
   private areas. Runs lazily — if Supabase env vars aren't set (e.g. a
   static build before credentials exist) it degrades to "logged out" rather
   than throwing, so the marketing site always builds and serves.
   --------------------------------------------------------------------------- */

const PROTECTED = [/^\/account/, /^\/admin/];
const ADMIN_ONLY = [/^\/admin/];
// Anything that reads or writes the auth session must never be cached. On
// Vercel a cacheable response has its Set-Cookie headers stripped, which would
// silently drop the session cookie set during sign-in/sign-up — the classic
// "log in, bounce straight back to the login page" symptom.
const NO_STORE = [/^\/account/, /^\/admin/, /^\/auth/, /^\/api/];

/** Mark a response uncacheable so Vercel keeps its Set-Cookie headers. */
function preserveCookies(response: Response): Response {
  response.headers.set('Cache-Control', 'private, no-cache, no-store, max-age=0, must-revalidate');
  return response;
}

export const onRequest = defineMiddleware(async (context, next) => {
  context.locals.supabase = null;
  context.locals.user = null;
  context.locals.profile = null;

  const configured =
    !!import.meta.env.PUBLIC_SUPABASE_URL && !!import.meta.env.PUBLIC_SUPABASE_ANON_KEY;

  const path = context.url.pathname;
  const isProtected = PROTECTED.some((re) => re.test(path));
  const isSensitive = NO_STORE.some((re) => re.test(path));

  if (configured) {
    try {
      const supabase = createSupabaseServer(context.cookies, context.request);
      context.locals.supabase = supabase;

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        context.locals.user = user;
        const { data: profile } = await supabase
          .from('profiles')
          .select('id, role, full_name, phone')
          .eq('id', user.id)
          .single();
        context.locals.profile = (profile as AppProfile) ?? null;
      }
    } catch {
      // Leave as logged-out; protected routes below will redirect.
    }
  }

  if (isProtected && !context.locals.user) {
    const redirectTo = encodeURIComponent(path + context.url.search);
    return preserveCookies(context.redirect(`/auth/login?redirect=${redirectTo}`));
  }

  if (ADMIN_ONLY.some((re) => re.test(path))) {
    const role = context.locals.profile?.role;
    if (role !== 'owner' && role !== 'staff') {
      return preserveCookies(context.redirect('/account'));
    }
  }

  const response = await next();
  return isSensitive ? preserveCookies(response) : response;
});
