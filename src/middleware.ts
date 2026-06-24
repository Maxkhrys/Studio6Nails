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

export const onRequest = defineMiddleware(async (context, next) => {
  context.locals.supabase = null;
  context.locals.user = null;
  context.locals.profile = null;

  const configured =
    !!import.meta.env.PUBLIC_SUPABASE_URL && !!import.meta.env.PUBLIC_SUPABASE_ANON_KEY;

  const path = context.url.pathname;
  const isProtected = PROTECTED.some((re) => re.test(path));

  if (configured) {
    try {
      const supabase = createSupabaseServer(context.cookies);
      context.locals.supabase = supabase;

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (session?.user) {
        context.locals.user = session.user;
        const { data: profile } = await supabase
          .from('profiles')
          .select('id, role, full_name, phone')
          .eq('id', session.user.id)
          .single();
        context.locals.profile = (profile as AppProfile) ?? null;
      }
    } catch {
      // Leave as logged-out; protected routes below will redirect.
    }
  }

  if (isProtected && !context.locals.user) {
    const redirectTo = encodeURIComponent(path + context.url.search);
    return context.redirect(`/auth/login?redirect=${redirectTo}`);
  }

  if (ADMIN_ONLY.some((re) => re.test(path))) {
    const role = context.locals.profile?.role;
    if (role !== 'owner' && role !== 'staff') {
      return context.redirect('/account');
    }
  }

  return next();
});
