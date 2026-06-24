import type { APIRoute } from 'astro';
import { createSupabaseAdmin } from '../../lib/supabase/admin';
import { resolveVoucher, isVoucherError } from '../../lib/vouchers';

export const prerender = false;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * POST /api/validate-voucher  { code, serviceId }
 * Prices a voucher/promo code against a service so the booking UI can show
 * the saving live. Authoritative pricing still happens in /api/create-booking;
 * this is purely informational.
 */
export const POST: APIRoute = async ({ request }) => {
  let payload: Record<string, unknown>;
  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ ok: false, message: 'Invalid request.' }, 400);
  }

  const code = String(payload.code ?? '').trim().slice(0, 32);
  const serviceId = String(payload.serviceId ?? '').trim().slice(0, 40);
  if (!code || !serviceId) {
    return json({ ok: false, message: 'Enter a code and choose a service first.' }, 400);
  }

  let admin;
  try {
    admin = createSupabaseAdmin();
  } catch {
    return json({ ok: false, message: 'Vouchers are not configured yet.' }, 503);
  }

  const { data: service } = await admin
    .from('services')
    .select('price_cents, deposit_cents, active')
    .eq('id', serviceId)
    .single();
  if (!service || !service.active) {
    return json({ ok: false, message: 'That service is unavailable.' }, 404);
  }

  const priced = await resolveVoucher(admin, code, service.price_cents, service.deposit_cents);
  if (isVoucherError(priced)) {
    return json({ ok: false, message: priced.error });
  }

  return json({
    ok: true,
    discountCents: priced.discountCents,
    payNowCents: priced.payNowCents,
    studioCents: priced.studioCents,
    label: priced.label,
  });
};
