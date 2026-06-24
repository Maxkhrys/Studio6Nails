/* ---------------------------------------------------------------------------
   Voucher logic — pure helpers + a single resolver used by every path that
   prices a voucher (the live validator, the booking API, the webhook).

   Two kinds share one table:
     * 'gift'  — stored credit purchased online; balance redeemable at booking
     * 'promo' — owner-created discount ('fixed' € or 'percent' %), with an
                 optional expiry and redemption cap

   Money is always integer euro cents. Discounts apply to the service TOTAL
   (price), realised partly online (the deposit) and partly in studio — so a
   voucher is a genuine saving, never a sleight of hand on the deposit.
   --------------------------------------------------------------------------- */

import type { SupabaseClient } from '@supabase/supabase-js';

export interface VoucherRow {
  id: string;
  code: string;
  kind: 'gift' | 'promo';
  discount_type: 'fixed' | 'percent' | null;
  discount_value: number | null;
  max_redemptions: number | null;
  times_redeemed: number;
  initial_cents: number | null;
  balance_cents: number | null;
  paid: boolean;
  active: boolean;
  expires_at: string | null;
}

export interface PricedVoucher {
  voucher: VoucherRow;
  /** Amount taken off the service total, in cents (never exceeds price). */
  discountCents: number;
  /** What the client pays online now (capped at the remaining total). */
  payNowCents: number;
  /** What remains to settle in studio. */
  studioCents: number;
  /** Friendly label, e.g. "Gift voucher — €15.00 of credit applied". */
  label: string;
}

export interface VoucherError {
  error: string;
}

/** Tolerant normaliser: upper-case, strip spaces/punctuation noise. */
export function normalizeCode(input: string): string {
  return String(input || '')
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, '')
    .trim()
    .slice(0, 32);
}

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no ambiguous 0/O/1/I

/** Human-friendly code like "S6-GIFT-7K4Q-9XMP" / "S6-PROMO-...". */
export function generateCode(kind: 'gift' | 'promo'): string {
  const block = () =>
    Array.from({ length: 4 }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join('');
  return `S6-${kind === 'gift' ? 'GIFT' : 'PROMO'}-${block()}-${block()}`;
}

function isExpired(v: VoucherRow, now: Date): boolean {
  return !!v.expires_at && new Date(v.expires_at).getTime() < now.getTime();
}

/** Raw discount a voucher would grant against a given price (pre-cap). */
function rawDiscount(v: VoucherRow, priceCents: number): number {
  if (v.kind === 'gift') return Math.max(0, v.balance_cents ?? 0);
  if (v.discount_type === 'fixed') return Math.max(0, v.discount_value ?? 0);
  if (v.discount_type === 'percent') {
    const pct = Math.min(100, Math.max(0, v.discount_value ?? 0));
    return Math.round((priceCents * pct) / 100);
  }
  return 0;
}

/**
 * Price a single voucher row against a service. Pure — no I/O — so the
 * validator, the booking API and the webhook all agree to the cent.
 */
export function priceVoucher(
  v: VoucherRow,
  priceCents: number,
  depositCents: number,
  now: Date = new Date(),
): PricedVoucher | VoucherError {
  if (!v.active) return { error: 'This code is no longer active.' };
  if (isExpired(v, now)) return { error: 'This code has expired.' };
  if (v.kind === 'gift' && !v.paid) return { error: 'This gift voucher is not active yet.' };
  if (v.kind === 'gift' && (v.balance_cents ?? 0) <= 0)
    return { error: 'This gift voucher has no balance left.' };
  if (
    v.kind === 'promo' &&
    v.max_redemptions != null &&
    v.times_redeemed >= v.max_redemptions
  )
    return { error: 'This code has already been fully redeemed.' };

  const discountCents = Math.min(rawDiscount(v, priceCents), priceCents);
  if (discountCents <= 0) return { error: 'This code has no value to apply here.' };

  const totalDue = priceCents - discountCents;
  const payNowCents = Math.max(0, Math.min(depositCents, totalDue));
  const studioCents = totalDue - payNowCents;

  const euros = (c: number) =>
    Number.isInteger(c / 100) ? `€${c / 100}` : `€${(c / 100).toFixed(2)}`;
  const label =
    v.kind === 'gift'
      ? `Gift voucher — ${euros(discountCents)} of credit applied`
      : v.discount_type === 'percent'
        ? `Promo ${v.discount_value}% off — ${euros(discountCents)} off`
        : `Promo — ${euros(discountCents)} off`;

  return { voucher: v, discountCents, payNowCents, studioCents, label };
}

export function isVoucherError(x: PricedVoucher | VoucherError): x is VoucherError {
  return (x as VoucherError).error !== undefined;
}

const VOUCHER_COLS =
  'id, code, kind, discount_type, discount_value, max_redemptions, times_redeemed, initial_cents, balance_cents, paid, active, expires_at';

/**
 * Look a code up (service-role client) and price it against a service.
 * Returns a priced result or a friendly { error }.
 */
export async function resolveVoucher(
  admin: SupabaseClient,
  code: string,
  priceCents: number,
  depositCents: number,
): Promise<PricedVoucher | VoucherError> {
  const norm = normalizeCode(code);
  if (!norm) return { error: 'Enter a voucher or promo code.' };

  const { data } = await admin.from('vouchers').select(VOUCHER_COLS).eq('code', norm).maybeSingle();
  if (!data) return { error: 'We couldn’t find that code.' };

  return priceVoucher(data as VoucherRow, priceCents, depositCents);
}

/**
 * Record a redemption against a confirmed booking and move the voucher's
 * counters. Idempotent via the unique(booking_id) constraint on
 * voucher_redemptions — a duplicate insert is treated as "already done".
 * Service-role client required.
 */
export async function recordRedemption(
  admin: SupabaseClient,
  voucherId: string,
  bookingId: string,
  amountCents: number,
): Promise<void> {
  const { error } = await admin
    .from('voucher_redemptions')
    .insert({ voucher_id: voucherId, booking_id: bookingId, amount_cents: amountCents });

  // 23505 = unique violation → this booking's redemption is already recorded.
  if (error) {
    if ((error as { code?: string }).code === '23505') return;
    throw error;
  }

  const { data: v } = await admin
    .from('vouchers')
    .select('kind, balance_cents, times_redeemed')
    .eq('id', voucherId)
    .single();
  if (!v) return;

  if (v.kind === 'gift') {
    await admin
      .from('vouchers')
      .update({ balance_cents: Math.max(0, (v.balance_cents ?? 0) - amountCents) })
      .eq('id', voucherId);
  } else {
    await admin
      .from('vouchers')
      .update({ times_redeemed: (v.times_redeemed ?? 0) + 1 })
      .eq('id', voucherId);
  }
}

/** Generate a code that isn't already taken (a few attempts is plenty). */
export async function generateUniqueCode(
  admin: SupabaseClient,
  kind: 'gift' | 'promo',
): Promise<string> {
  for (let i = 0; i < 6; i++) {
    const code = generateCode(kind);
    const { data } = await admin.from('vouchers').select('id').eq('code', code).maybeSingle();
    if (!data) return code;
  }
  // Astronomically unlikely; fall back to a timestamp suffix.
  return `${generateCode(kind)}-${Date.now().toString(36).toUpperCase()}`;
}
