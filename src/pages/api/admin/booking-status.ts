import type { APIRoute } from 'astro';
import { createSupabaseServer } from '../../../lib/supabase/server';

export const prerender = false;

const ALLOWED = ['confirmed', 'completed', 'no_show', 'cancelled'];

/**
 * Staff/owner change a booking's status. Runs as the logged-in user, so RLS
 * limits staff to bookings assigned to them and owner to all.
 */
export const POST: APIRoute = async ({ request, cookies, redirect, locals }) => {
  if (!locals.user || (locals.profile?.role !== 'owner' && locals.profile?.role !== 'staff')) {
    return redirect('/account');
  }

  const form = await request.formData();
  const bookingId = String(form.get('booking_id') || '');
  const status = String(form.get('status') || '');
  const back = String(form.get('redirect') || '/admin');
  const safeBack = back.startsWith('/') ? back : '/admin';

  if (!bookingId || !ALLOWED.includes(status)) return redirect(safeBack);

  const supabase = createSupabaseServer(cookies, request);
  await supabase.from('bookings').update({ status }).eq('id', bookingId);

  return redirect(safeBack);
};
