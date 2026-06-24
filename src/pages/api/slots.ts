import type { APIRoute } from 'astro';
import { createSupabaseAdmin } from '../../lib/supabase/admin';
import {
  computeDaySlots,
  type AvailabilityRule,
  type AvailabilityException,
  type BookingInterval,
} from '../../lib/availability';

export const prerender = false;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * GET /api/slots?staff=<id>&service=<id>&date=YYYY-MM-DD
 * Returns the free start times for that staff member + service on that day.
 * Uses the service-role client so it can read existing bookings (to mark
 * times busy) without exposing any booking details to the public.
 *
 * NOTE: times are computed in the server's local timezone. When verifying
 * live, confirm the deploy region resolves to Europe/Dublin (or set TZ),
 * since Vercel functions default to UTC.
 */
export const GET: APIRoute = async ({ url }) => {
  const staffId = url.searchParams.get('staff');
  const serviceId = url.searchParams.get('service');
  const date = url.searchParams.get('date');
  // When rescheduling, exclude the booking being moved from the busy set.
  const excludeId = url.searchParams.get('exclude');

  if (!staffId || !serviceId || !date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return json({ ok: false, message: 'Missing or invalid parameters.' }, 400);
  }

  let admin;
  try {
    admin = createSupabaseAdmin();
  } catch (e) {
    console.error(e);
    return json({ ok: false, message: 'Booking is not configured yet.' }, 503);
  }

  // Service duration (and that this staff performs it).
  const { data: service } = await admin
    .from('services')
    .select('duration_min, active')
    .eq('id', serviceId)
    .single();

  if (!service || !service.active) {
    return json({ ok: false, message: 'Service unavailable.' }, 404);
  }

  const { data: link } = await admin
    .from('staff_services')
    .select('staff_id')
    .eq('staff_id', staffId)
    .eq('service_id', serviceId)
    .maybeSingle();

  if (!link) return json({ ok: true, slots: [] });

  const [{ data: rules }, { data: exceptions }] = await Promise.all([
    admin.from('availability_rules').select('weekday, start_time, end_time').eq('staff_id', staffId),
    admin
      .from('availability_exceptions')
      .select('date, is_closed, start_time, end_time')
      .eq('staff_id', staffId)
      .eq('date', date),
  ]);

  // Bookings that still hold a slot, on this day.
  const dayStart = new Date(`${date}T00:00:00`);
  const dayEnd = new Date(`${date}T23:59:59`);
  let bookingsQuery = admin
    .from('bookings')
    .select('starts_at, ends_at')
    .eq('staff_id', staffId)
    .in('status', ['pending_payment', 'confirmed'])
    .gte('starts_at', dayStart.toISOString())
    .lte('starts_at', dayEnd.toISOString());
  if (excludeId) bookingsQuery = bookingsQuery.neq('id', excludeId);
  const { data: bookings } = await bookingsQuery;

  const slots = computeDaySlots(
    date,
    (rules ?? []) as AvailabilityRule[],
    (exceptions ?? []) as AvailabilityException[],
    (bookings ?? []) as BookingInterval[],
    { durationMin: service.duration_min },
  );

  return json({ ok: true, slots });
};
