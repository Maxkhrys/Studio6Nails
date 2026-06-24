import type { APIRoute } from 'astro';
import { createSupabaseServer } from '../../lib/supabase/server';

/* ---------------------------------------------------------------------------
   Auth callback. Supabase redirects here after a user clicks an email link
   (sign-up confirmation, magic link, or password recovery). It completes the
   login by turning the link's credential into a real session cookie, then
   forwards the user on.

   Two link formats are handled, depending on the project's auth settings:
     * PKCE flow  → ?code=...            → exchangeCodeForSession
     * OTP links  → ?token_hash=&type=   → verifyOtp
   --------------------------------------------------------------------------- */

export const prerender = false;

export const GET: APIRoute = async ({ url, cookies, redirect }) => {
  const nextParam = url.searchParams.get('next') || '/account';
  const next = nextParam.startsWith('/') ? nextParam : '/account';

  const code = url.searchParams.get('code');
  const tokenHash = url.searchParams.get('token_hash');
  const type = url.searchParams.get('type');

  const supabase = createSupabaseServer(cookies);

  try {
    if (code) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) throw error;
    } else if (tokenHash && type) {
      const { error } = await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type: type as
          | 'signup'
          | 'invite'
          | 'magiclink'
          | 'recovery'
          | 'email_change'
          | 'email',
      });
      if (error) throw error;
    } else {
      // Nothing usable in the URL — send them to sign in.
      return redirect('/auth/login?error=link');
    }
  } catch {
    return redirect('/auth/login?error=link');
  }

  return redirect(next);
};
