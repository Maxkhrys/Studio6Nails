import type { APIRoute } from 'astro';
import { createSupabaseAdmin } from '../../lib/supabase/admin';
import { paymentProvider } from '../../lib/payments';
import { generateUniqueCode } from '../../lib/vouchers';
import { formatEuro } from '../../lib/site';

export const prerender = false;

const MIN_CENTS = 1000; // €10
const MAX_CENTS = 50000; // €500

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function clip(v: unknown, max = 200): string {
  return String(v ?? '').trim().slice(0, max);
}

/**
 * POST /api/buy-voucher
 * Creates a pending gift voucher and hands off to the payment provider. The
 * voucher is activated + emailed by the webhook once payment confirms.
 */
export const POST: APIRoute = async ({ request, url }) => {
  let payload: Record<string, unknown>;
  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ ok: false, message: 'Invalid request.' }, 400);
  }

  // Amount in whole euros, server-validated.
  const amountEuros = Math.floor(Number(payload.amountEuros));
  const amountCents = amountEuros * 100;
  if (!Number.isFinite(amountCents) || amountCents < MIN_CENTS || amountCents > MAX_CENTS) {
    return json(
      { ok: false, message: `Choose an amount between ${formatEuro(MIN_CENTS)} and ${formatEuro(MAX_CENTS)}.` },
      400,
    );
  }

  const purchaserEmail = clip(payload.purchaserEmail, 160);
  const recipientEmail = clip(payload.recipientEmail, 160);
  const recipientName = clip(payload.recipientName, 120);
  const giftMessage = clip(payload.message, 400);
  if (!purchaserEmail) {
    return json({ ok: false, message: 'Please provide your email.' }, 400);
  }

  let admin;
  try {
    admin = createSupabaseAdmin();
  } catch {
    return json({ ok: false, message: 'Vouchers are not configured yet.' }, 503);
  }

  const code = await generateUniqueCode(admin, 'gift');

  const { data: voucher, error: insErr } = await admin
    .from('vouchers')
    .insert({
      code,
      kind: 'gift',
      initial_cents: amountCents,
      balance_cents: amountCents,
      paid: false, // becomes usable when the webhook confirms payment
      active: true,
      recipient_email: recipientEmail || null,
      recipient_name: recipientName || null,
      purchaser_email: purchaserEmail,
      gift_message: giftMessage || null,
      payment_provider: paymentProvider.id,
    })
    .select('id')
    .single();

  if (insErr || !voucher) {
    console.error('Voucher insert failed', insErr);
    return json({ ok: false, message: 'We couldn’t start that. Please try again.' }, 500);
  }

  try {
    const checkout = await paymentProvider.createVoucherCheckout({
      voucherId: voucher.id,
      amountCents,
      description: `${formatEuro(amountCents)} gift voucher`,
      customerEmail: purchaserEmail,
      successUrl: `${url.origin}/vouchers/success`,
      cancelUrl: `${url.origin}/vouchers?cancelled=1`,
    });
    await admin.from('vouchers').update({ payment_ref: checkout.reference }).eq('id', voucher.id);
    return json({ ok: true, url: checkout.url });
  } catch (e) {
    console.error('Voucher checkout failed', e);
    // Drop the unpaid voucher so it can't be redeemed.
    await admin.from('vouchers').update({ active: false }).eq('id', voucher.id);
    return json({ ok: false, message: 'We couldn’t start payment. Please try again.' }, 502);
  }
};
