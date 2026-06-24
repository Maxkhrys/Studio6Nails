import type { APIRoute } from 'astro';
import { createSupabaseAdmin } from '../../lib/supabase/admin';
import { paymentProvider } from '../../lib/payments';
import { buildBookingConfirmation, sendEmail } from '../../lib/email';
import { computeDaySlots } from '../../lib/availability';
import { resolveVoucher, isVoucherError, recordRedemption } from '../../lib/vouchers';

export const prerender = false;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function clip(v: unknown, max = 200): string {
  return String(v ?? '').trim().slice(0, max);
}

export const POST: APIRoute = async ({ request, locals, url }) => {
  let payload: Record<string, unknown>;
  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ ok: false, message: 'Invalid request.' }, 400);
  }

  const serviceId = clip(payload.serviceId, 40);
  const staffId = clip(payload.staffId, 40);
  const startsAtRaw = clip(payload.startsAt, 40);
  const clientName = clip(payload.clientName, 120);
  const clientEmail = clip(payload.clientEmail, 160);
  const clientPhone = clip(payload.clientPhone, 40);
  const notes = clip(payload.notes, 480);
  const voucherCode = clip(payload.voucherCode, 32);

  const startsAt = new Date(startsAtRaw);
  if (!serviceId || !staffId || Number.isNaN(startsAt.getTime())) {
    return json({ ok: false, message: 'Please choose a service, stylist and time.' }, 400);
  }
  if (!clientName || !clientEmail) {
    return json({ ok: false, message: 'Please provide your name and email.' }, 400);
  }
  if (startsAt.getTime() < Date.now()) {
    return json({ ok: false, message: 'That time has already passed.' }, 400);
  }

  let admin;
  try {
    admin = createSupabaseAdmin();
  } catch (e) {
    console.error(e);
    return json({ ok: false, message: 'Booking is not configured yet.' }, 503);
  }

  // --- Price the service on the server. Never trust amounts from the client.
  const { data: service } = await admin
    .from('services')
    .select('id, name, duration_min, price_cents, deposit_cents, active')
    .eq('id', serviceId)
    .single();

  if (!service || !service.active) {
    return json({ ok: false, message: 'That service is unavailable.' }, 404);
  }

  const { data: staff } = await admin
    .from('staff')
    .select('id, display_name, active')
    .eq('id', staffId)
    .single();

  if (!staff || !staff.active) {
    return json({ ok: false, message: 'That stylist is unavailable.' }, 404);
  }

  const { data: link } = await admin
    .from('staff_services')
    .select('staff_id')
    .eq('staff_id', staffId)
    .eq('service_id', serviceId)
    .maybeSingle();
  if (!link) {
    return json({ ok: false, message: 'That stylist doesn’t offer this service.' }, 400);
  }

  // --- Re-validate the slot is still offered (defence-in-depth; the DB
  //     exclusion constraint is the hard guarantee against double-booking).
  const dateStr = startsAtRaw.slice(0, 10);
  const [{ data: rules }, { data: exceptions }, { data: dayBookings }] = await Promise.all([
    admin.from('availability_rules').select('weekday, start_time, end_time').eq('staff_id', staffId),
    admin
      .from('availability_exceptions')
      .select('date, is_closed, start_time, end_time')
      .eq('staff_id', staffId)
      .eq('date', dateStr),
    admin
      .from('bookings')
      .select('starts_at, ends_at')
      .eq('staff_id', staffId)
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
    return json({ ok: false, message: 'Sorry, that time was just taken. Please pick another.' }, 409);
  }

  // --- Resolve a voucher / promo code, if supplied. Priced server-side
  //     against the service total; the discount reduces what's owed overall,
  //     taken first off the online payment (deposit), then the studio balance.
  let discountCents = 0;
  let voucherId: string | null = null;
  if (voucherCode) {
    const priced = await resolveVoucher(
      admin,
      voucherCode,
      service.price_cents,
      service.deposit_cents,
    );
    if (isVoucherError(priced)) {
      return json({ ok: false, message: priced.error }, 400);
    }
    discountCents = priced.discountCents;
    voucherId = priced.voucher.id;
  }

  // What the client pays online now, never more than the remaining total.
  const totalDue = Math.max(0, service.price_cents - discountCents);
  const payNowCents = Math.max(0, Math.min(service.deposit_cents, totalDue));

  const endsAt = new Date(startsAt.getTime() + service.duration_min * 60_000);
  const userId = locals.user?.id ?? null;

  // --- Create the pending booking.
  const { data: booking, error: insErr } = await admin
    .from('bookings')
    .insert({
      client_id: userId,
      staff_id: staffId,
      service_id: serviceId,
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
      status: 'pending_payment',
      price_cents: service.price_cents,
      deposit_cents: service.deposit_cents,
      discount_cents: discountCents,
      voucher_id: voucherId,
      payment_provider: paymentProvider.id,
      client_name: clientName,
      client_email: clientEmail,
      client_phone: clientPhone,
      notes,
    })
    .select('id')
    .single();

  if (insErr || !booking) {
    // 23P01 = exclusion violation (overlapping booking won the race).
    if ((insErr as any)?.code === '23P01') {
      return json({ ok: false, message: 'Sorry, that time was just taken. Please pick another.' }, 409);
    }
    console.error('Booking insert failed', insErr);
    return json({ ok: false, message: 'We couldn’t create that booking. Please try again.' }, 500);
  }

  // --- Nothing to pay online (no deposit, or a voucher covers it): confirm
  //     immediately, bank any voucher redemption, and email.
  if (payNowCents <= 0) {
    await admin.from('bookings').update({ status: 'confirmed' }).eq('id', booking.id);
    if (voucherId && discountCents > 0) {
      try {
        await recordRedemption(admin, voucherId, booking.id, discountCents);
      } catch (e) {
        console.error('Voucher redemption failed', e);
      }
    }
    const { subject, html } = buildBookingConfirmation({
      to: clientEmail,
      clientName,
      serviceName: service.name,
      staffName: staff.display_name,
      startsAt,
      priceCents: service.price_cents,
      depositCents: 0,
      discountCents,
    });
    await sendEmail({ to: clientEmail, subject, html, bcc: import.meta.env.BOOKING_NOTIFY_EMAIL });
    return json({ ok: true, url: `/book/success?b=${booking.id}` });
  }

  // --- Payment required: hand off to the payment provider. The voucher
  //     redemption is banked by the webhook once payment confirms.
  try {
    const checkout = await paymentProvider.createDepositCheckout({
      bookingId: booking.id,
      amountCents: payNowCents,
      description: `Deposit — ${service.name}`,
      customerEmail: clientEmail,
      successUrl: `${url.origin}/book/success?b=${booking.id}`,
      cancelUrl: `${url.origin}/book?cancelled=1`,
    });
    await admin
      .from('bookings')
      .update({ payment_ref: checkout.reference })
      .eq('id', booking.id);
    return json({ ok: true, url: checkout.url });
  } catch (e) {
    console.error('Checkout creation failed', e);
    // Roll the held slot back so it doesn't linger as pending.
    await admin.from('bookings').update({ status: 'cancelled' }).eq('id', booking.id);
    return json({ ok: false, message: 'We couldn’t start payment. Please try again.' }, 502);
  }
};
