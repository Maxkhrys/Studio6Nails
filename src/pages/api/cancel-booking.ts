import type { APIRoute } from 'astro';
import { createSupabaseServer } from '../../lib/supabase/server';

export const prerender = false;

/**
 * Cancel a booking. Runs as the logged-in user via the request-scoped client,
 * so RLS guarantees a client can only cancel their own booking (and staff/owner
 * the ones they're allowed to touch). Accepts a form POST and redirects back.
 */
export const POST: APIRoute = async ({ request, cookies, redirect, locals }) => {
  if (!locals.user) return redirect('/auth/login?redirect=/account');

  const form = await request.formData();
  const bookingId = String(form.get('booking_id') || '');
  const back = String(form.get('redirect') || '/account');
  const safeBack = back.startsWith('/') ? back : '/account';

  if (!bookingId) return redirect(safeBack);

  const supabase = createSupabaseServer(cookies);
  await supabase
    .from('bookings')
    .update({ status: 'cancelled' })
    .eq('id', bookingId)
    .in('status', ['pending_payment', 'confirmed']);

  return redirect(safeBack);
};
