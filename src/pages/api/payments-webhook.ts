import type { APIRoute } from 'astro';
import { paymentProvider } from '../../lib/payments';
import { createSupabaseAdmin } from '../../lib/supabase/admin';
import { buildBookingConfirmation, sendEmail } from '../../lib/email';

export const prerender = false;

/**
 * Payment provider webhook (Stripe today). On a confirmed deposit it marks
 * the booking paid + confirmed and emails the client. Provider-agnostic: the
 * concrete verification lives in the active payment adapter.
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

  // Fetch the booking (+ service/staff for the email). Idempotent: if it's
  // already confirmed, do nothing further.
  const { data: booking } = await admin
    .from('bookings')
    .select(
      'id, status, deposit_cents, price_cents, starts_at, client_email, client_name, service:services(name), staff:staff(display_name)',
    )
    .eq('id', confirmation.bookingId)
    .single();

  if (!booking) {
    console.error('Webhook: booking not found', confirmation.bookingId);
    return new Response('Booking not found', { status: 200 });
  }

  if (booking.status === 'confirmed') {
    return new Response('Already confirmed', { status: 200 });
  }

  const { error: updErr } = await admin
    .from('bookings')
    .update({
      status: 'confirmed',
      deposit_paid: true,
      payment_ref: confirmation.reference,
    })
    .eq('id', booking.id);

  if (updErr) {
    console.error('Webhook: failed to confirm booking', updErr);
    return new Response('Update failed', { status: 500 });
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
      depositCents: booking.deposit_cents,
    });
    await sendEmail({
      to: booking.client_email,
      subject,
      html,
      bcc: import.meta.env.BOOKING_NOTIFY_EMAIL,
    });
  }

  return new Response('Received', { status: 200 });
};
