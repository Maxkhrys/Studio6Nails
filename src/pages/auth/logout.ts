import type { APIRoute } from 'astro';
import { createSupabaseServer } from '../../lib/supabase/server';

export const prerender = false;

/** Sign the user out and return to the homepage. POST only (CSRF-safer). */
export const POST: APIRoute = async ({ cookies, redirect }) => {
  const supabase = createSupabaseServer(cookies);
  await supabase.auth.signOut();
  return redirect('/');
};
