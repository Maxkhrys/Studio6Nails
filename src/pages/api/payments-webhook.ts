import type { APIRoute } from 'astro';
import { paymentProvider } from '../../lib/payments';
import { createSupabaseAdmin } from '../../lib/supabase/admin';
import { buildBookingConfirmation, buildVoucherEmail, sendEmail } from '../../lib/email';
import { recordRedemption, generateUniqueCode } from '../../lib/vouchers';

export const prerender = false;

/**
 * Payment provider webhook (Stripe today). Handles two confirmed flows:
 *   * booking deposit → confirm the booking, bank any voucher redemption, email
 *   * gift voucher purchase → activate the voucher, email the recipient
 * Provider-agnostic: the concrete verification lives in the active adapter.
 */
export const POST: APIRoute = async ({ request }) => {
  const rawBody = await request.text();
  const signature = request.headers.get('stripe-signature');

  let confirmation;
  try {
    confirmation = await paymentProvider.parseWebhook(rawBody, signature);
  } catch (e) {
    console.error('Webhook verification failed', e);
    return new Response('Invalid signature', { status: 400 });
  }

  if (!confirmation || !confirmation.paid) {
    return new Response('Ignored', { status: 200 });
  }

  const admin = createSupabaseAdmin();

  if (confirmation.kind === 'voucher') {
    return handleVoucherPurchase(admin, confirmation.refId, confirmation.reference);
  }
  return handleBookingDeposit(admin, confirmation.refId, confirmation.reference);
};

async function handleBookingDeposit(
  admin: ReturnType<typeof createSupabaseAdmin>,
  bookingId: string,
  reference: string,
): Promise<Response> {
  // Fetch the booking (+ service/staff for the email). Idempotent: if it's
  // already confirmed, do nothing further.
  const { data: booking } = await admin
    .from('bookings')
    .select(
      'id, status, deposit_cents, price_cents, discount_cents, voucher_id, starts_at, client_email, client_name, service:services(name), staff:staff(display_name)',
    )
    .eq('id', bookingId)
    .single();

  if (!booking) {
    console.error('Webhook: booking not found', bookingId);
    return new Response('Booking not found', { status: 200 });
  }

  if (booking.status === 'confirmed') {
    return new Response('Already confirmed', { status: 200 });
  }

  const { error: updErr } = await admin
    .from('bookings')
    .update({ status: 'confirmed', deposit_paid: true, payment_ref: reference })
    .eq('id', booking.id);

  if (updErr) {
    console.error('Webhook: failed to confirm booking', updErr);
    return new Response('Update failed', { status: 500 });
  }

  // Bank a voucher redemption now that the booking is paid (idempotent).
  const discountCents = (booking as any).discount_cents ?? 0;
  const voucherId = (booking as any).voucher_id ?? null;
  if (voucherId && discountCents > 0) {
    try {
      await recordRedemption(admin, voucherId, booking.id, discountCents);
    } catch (e) {
      console.error('Webhook: voucher redemption failed', e);
    }
  }

  // Send confirmation email (failures are logged, not thrown).
  const serviceName = (booking as any).service?.name ?? 'Your appointment';
  const staffName = (booking as any).staff?.display_name ?? 'Studio 6 Nails';
  if (booking.client_email) {
    const { subject, html } = buildBookingConfirmation({
      to: booking.client_email,
      clientName: booking.client_name ?? 'there',
      serviceName,
      staffName,
      startsAt: new Date(booking.starts_at),
      priceCents: booking.price_cents,
      depositCents: booking.deposit_cents - discountCents > 0 ? booking.deposit_cents - discountCents : 0,
      discountCents,
    });
    await sendEmail({
      to: booking.client_email,
      subject,
      html,
      bcc: import.meta.env.BOOKING_NOTIFY_EMAIL,
    });
  }

  return new Response('Received', { status: 200 });
}

async function handleVoucherPurchase(
  admin: ReturnType<typeof createSupabaseAdmin>,
  voucherId: string,
  reference: string,
): Promise<Response> {
  const { data: voucher } = await admin
    .from('vouchers')
    .select('id, kind, paid, code, initial_cents, balance_cents, recipient_email, recipient_name, purchaser_email, gift_message')
    .eq('id', voucherId)
    .single();

  if (!voucher) {
    console.error('Webhook: voucher not found', voucherId);
    return new Response('Voucher not found', { status: 200 });
  }
  if (voucher.paid) {
    return new Response('Already active', { status: 200 });
  }

  // Activate: assign a redeemable code (if not already) and mark paid.
  const code = voucher.code || (await generateUniqueCode(admin, 'gift'));
  const { error: updErr } = await admin
    .from('vouchers')
    .update({ paid: true, active: true, code, payment_ref: reference })
    .eq('id', voucher.id);

  if (updErr) {
    console.error('Webhook: failed to activate voucher', updErr);
    return new Response('Update failed', { status: 500 });
  }

  // Email the recipient their code (and bcc the studio).
  const to = voucher.recipient_email || voucher.purchaser_email;
  if (to) {
    const { subject, html } = buildVoucherEmail({
      recipientName: voucher.recipient_name,
      purchaserEmail: voucher.purchaser_email,
      amountCents: voucher.initial_cents ?? voucher.balance_cents ?? 0,
      code,
      message: voucher.gift_message,
    });
    await sendEmail({ to, subject, html, bcc: import.meta.env.BOOKING_NOTIFY_EMAIL });
  }

  return new Response('Received', { status: 200 });
}
