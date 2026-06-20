import { createClient } from '@supabase/supabase-js';

/* ---------------------------------------------------------------------------
   Service-role Supabase client. BYPASSES Row Level Security.
   Server-only — never import this into client code or an Astro component that
   ships to the browser. Used by trusted API routes (booking creation, the
   Stripe webhook) that must write rows the public RLS policies intentionally
   forbid clients from inserting.
   --------------------------------------------------------------------------- */

export function createSupabaseAdmin() {
  const url = import.meta.env.PUBLIC_SUPABASE_URL;
  const serviceKey = import.meta.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error('PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not set');
  }
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
