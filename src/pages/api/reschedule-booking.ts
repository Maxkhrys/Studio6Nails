import type { APIRoute } from 'astro';
import { createSupabaseAdmin } from '../../lib/supabase/admin';
import { computeDaySlots } from '../../lib/availability';
import { buildBookingConfirmation, sendEmail } from '../../lib/email';

export const prerender = false;

/** Clients may move a booking up to this many hours before it starts. */
const RESCHEDULE_CUTOFF_HOURS = 24;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * POST /api/reschedule-booking  { bookingId, startsAt }
 * Moves an existing booking to a new time with the SAME stylist + service.
 * The already-paid deposit carries over (no new payment). Allowed only up to
 * RESCHEDULE_CUTOFF_HOURS before the current appointment.
 */
export const POST: APIRoute = async ({ request, locals }) => {
  if (!locals.user) return json({ ok: false, message: 'Please sign in.' }, 401);

  let payload: Record<string, unknown>;
  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ ok: false, message: 'Invalid request.' }, 400);
  }

  const bookingId = String(payload.bookingId ?? '').trim().slice(0, 40);
  const startsAtRaw = String(payload.startsAt ?? '').trim().slice(0, 40);
  const startsAt = new Date(startsAtRaw);
  if (!bookingId || Number.isNaN(startsAt.getTime())) {
    return json({ ok: false, message: 'Choose a new time.' }, 400);
  }
  if (startsAt.getTime() < Date.now()) {
    return json({ ok: false, message: 'That time has already passed.' }, 400);
  }

  let admin;
  try {
    admin = createSupabaseAdmin();
  } catch {
    return json({ ok: false, message: 'Booking is not configured yet.' }, 503);
  }

  const { data: booking } = await admin
    .from('bookings')
    .select(
      'id, client_id, staff_id, service_id, status, starts_at, deposit_cents, discount_cents, price_cents, rescheduled_count, client_email, client_name, service:services(name, duration_min, active), staff:staff(display_name)',
    )
    .eq('id', bookingId)
    .single();

  if (!booking) return json({ ok: false, message: 'Booking not found.' }, 404);

  // Ownership: the client who made it, or staff/owner.
  const role = locals.profile?.role;
  const owns = booking.client_id === locals.user.id || role === 'owner' || role === 'staff';
  if (!owns) return json({ ok: false, message: 'You can’t change this booking.' }, 403);

  if (!['pending_payment', 'confirmed'].includes(booking.status)) {
    return json({ ok: false, message: 'This booking can no longer be changed.' }, 400);
  }

  // Cutoff only applies to clients — staff/owners can reschedule any time.
  if (role !== 'owner' && role !== 'staff') {
    const cutoffMs = RESCHEDULE_CUTOFF_HOURS * 60 * 60 * 1000;
    if (new Date(booking.starts_at).getTime() - Date.now() < cutoffMs) {
      return json(
        {
          ok: false,
          message: `Appointments can only be moved more than ${RESCHEDULE_CUTOFF_HOURS} hours ahead. Please call us to change this one.`,
        },
        400,
      );
    }
  }

  const service = (booking as any).service as { name: string; duration_min: number; active: boolean };
  if (!service?.duration_min) {
    return json({ ok: false, message: 'That service is unavailable.' }, 400);
  }

  // Re-validate the new slot, excluding THIS booking from the busy set so its
  // own current time doesn't block it.
  const dateStr = startsAtRaw.slice(0, 10);
  const [{ data: rules }, { data: exceptions }, { data: dayBookings }] = await Promise.all([
    admin.from('availability_rules').select('weekday, start_time, end_time').eq('staff_id', booking.staff_id),
    admin
      .from('availability_exceptions')
      .select('date, is_closed, start_time, end_time')
      .eq('staff_id', booking.staff_id)
      .eq('date', dateStr),
    admin
      .from('bookings')
      .select('starts_at, ends_at')
      .eq('staff_id', booking.staff_id)
      .neq('id', bookingId)
      .in('status', ['pending_payment', 'confirmed'])
      .gte('starts_at', `${dateStr}T00:00:00`)
      .lte('starts_at', `${dateStr}T23:59:59`),
  ]);

  const offered = computeDaySlots(
    dateStr,
    (rules ?? []) as any,
    (exceptions ?? []) as any,
    (dayBookings ?? []) as any,
    { durationMin: service.duration_min },
  );
  if (!offered.includes(startsAt.toISOString())) {
    return json({ ok: false, message: 'That time isn’t available — please pick another.' }, 409);
  }

  const endsAt = new Date(startsAt.getTime() + service.duration_min * 60_000);
  const { error: updErr } = await admin
    .from('bookings')
    .update({
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
      rescheduled_count: (booking.rescheduled_count ?? 0) + 1,
    })
    .eq('id', booking.id);

  if (updErr) {
    if ((updErr as { code?: string }).code === '23P01') {
      return json({ ok: false, message: 'That time was just taken — please pick another.' }, 409);
    }
    console.error('Reschedule failed', updErr);
    return json({ ok: false, message: 'We couldn’t move that booking. Please try again.' }, 500);
  }

  // Re-send a confirmation showing the new time (failures logged, not thrown).
  if (booking.client_email) {
    const discount = (booking as any).discount_cents ?? 0;
    const paid = Math.max(0, (booking.deposit_cents ?? 0) - discount);
    const { subject, html } = buildBookingConfirmation({
      to: booking.client_email,
      clientName: booking.client_name ?? 'there',
      serviceName: service.name,
      staffName: (booking as any).staff?.display_name ?? 'Studio 6 Nails',
      startsAt,
      priceCents: booking.price_cents,
      depositCents: paid,
      discountCents: discount,
    });
    await sendEmail({
      to: booking.client_email,
      subject: subject.replace('appointment', 'appointment (updated)'),
      html,
      bcc: import.meta.env.BOOKING_NOTIFY_EMAIL,
    });
  }

  return json({ ok: true });
};
