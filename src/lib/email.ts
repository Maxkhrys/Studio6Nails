import { SITE, formatEuro } from './site';

/* ---------------------------------------------------------------------------
   Transactional email via Resend. Mirrors the sauna's approach: a single
   fetch to the Resend API, all failures logged (never thrown) so a booking
   is never lost just because email delivery hiccuped.
   --------------------------------------------------------------------------- */

export interface BookingEmailInput {
  to: string;
  clientName: string;
  serviceName: string;
  staffName: string;
  startsAt: Date;
  priceCents: number;
  /** Amount actually paid online now (deposit, net of any voucher). */
  depositCents: number;
  /** Voucher/promo discount applied to the total, if any. */
  discountCents?: number;
}

function formatWhen(d: Date): string {
  return new Intl.DateTimeFormat('en-IE', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Dublin',
  }).format(d);
}

export function buildBookingConfirmation(input: BookingEmailInput): {
  subject: string;
  html: string;
} {
  const when = formatWhen(input.startsAt);
  const discount = input.discountCents ?? 0;
  const balance = Math.max(0, input.priceCents - discount - input.depositCents);
  const subject = `Your Studio 6 Nails appointment — ${when}`;
  const discountRow =
    discount > 0
      ? `<tr><td style="padding:6px 0;color:#8a7b80;">Voucher / promo</td><td style="padding:6px 0;text-align:right;color:#3d6b48;">− ${formatEuro(discount)}</td></tr>`
      : '';

  const html = `<!doctype html>
<html>
  <body style="margin:0;background:#fcf8f5;font-family:Helvetica,Arial,sans-serif;color:#2f2429;">
    <div style="max-width:560px;margin:0 auto;padding:40px 24px;">
      <p style="margin:0 0 4px;letter-spacing:0.28em;text-transform:uppercase;font-size:11px;color:#a06f6c;">Studio 6 Nails</p>
      <h1 style="margin:0 0 22px;font-family:Georgia,serif;font-size:28px;font-weight:600;">You’re booked in.</h1>

      <div style="background:#fff;border:1px solid rgba(47,36,41,0.12);border-radius:12px;padding:26px;">
        <p style="margin:0 0 18px;font-size:16px;">Hi ${escapeHtml(input.clientName)},</p>
        <p style="margin:0 0 18px;font-size:15px;color:#4a3b41;">Your appointment is confirmed. We look forward to seeing you.</p>

        <table style="width:100%;font-size:15px;border-collapse:collapse;">
          <tr><td style="padding:6px 0;color:#8a7b80;">Service</td><td style="padding:6px 0;text-align:right;font-weight:600;">${escapeHtml(input.serviceName)}</td></tr>
          <tr><td style="padding:6px 0;color:#8a7b80;">With</td><td style="padding:6px 0;text-align:right;">${escapeHtml(input.staffName)}</td></tr>
          <tr><td style="padding:6px 0;color:#8a7b80;">When</td><td style="padding:6px 0;text-align:right;">${escapeHtml(when)}</td></tr>
          ${discountRow}
          <tr><td style="padding:6px 0;color:#8a7b80;">Paid now</td><td style="padding:6px 0;text-align:right;">${formatEuro(input.depositCents)}</td></tr>
          <tr><td style="padding:6px 0;color:#8a7b80;">Balance in studio</td><td style="padding:6px 0;text-align:right;">${formatEuro(balance)}</td></tr>
        </table>
      </div>

      <div style="padding:22px 4px;color:#8a7b80;font-size:13px;line-height:1.7;">
        <p style="margin:0 0 8px;">${escapeHtml(SITE.address.street)}, ${escapeHtml(SITE.address.city)}, ${escapeHtml(SITE.address.postalCode)}</p>
        <p style="margin:0 0 8px;">Need to change or cancel? Manage your booking at <a href="${SITE.url}/account" style="color:#a06f6c;">your account</a>, or call ${escapeHtml(SITE.phone)}.</p>
      </div>
    </div>
  </body>
</html>`;

  return { subject, html };
}

export interface VoucherEmailInput {
  recipientName?: string | null;
  purchaserEmail?: string | null;
  amountCents: number;
  code: string;
  message?: string | null;
}

/** Email sent to the recipient of a purchased gift voucher. */
export function buildVoucherEmail(input: VoucherEmailInput): { subject: string; html: string } {
  const subject = `You’ve received a Studio 6 Nails gift voucher`;
  const greeting = input.recipientName ? `Hi ${escapeHtml(input.recipientName)},` : 'Hello,';
  const note = input.message
    ? `<p style="margin:0 0 18px;font-size:15px;color:#4a3b41;font-style:italic;">“${escapeHtml(input.message)}”</p>`
    : '';
  const from = input.purchaserEmail
    ? `<p style="margin:0 0 18px;font-size:14px;color:#8a7b80;">A gift from ${escapeHtml(input.purchaserEmail)}.</p>`
    : '';

  const html = `<!doctype html>
<html>
  <body style="margin:0;background:#fcf8f5;font-family:Helvetica,Arial,sans-serif;color:#2f2429;">
    <div style="max-width:560px;margin:0 auto;padding:40px 24px;">
      <p style="margin:0 0 4px;letter-spacing:0.28em;text-transform:uppercase;font-size:11px;color:#a06f6c;">Studio 6 Nails</p>
      <h1 style="margin:0 0 22px;font-family:Georgia,serif;font-size:28px;font-weight:600;">A little treat, just for you.</h1>
      <div style="background:#fff;border:1px solid rgba(47,36,41,0.12);border-radius:12px;padding:26px;text-align:center;">
        <p style="margin:0 0 14px;font-size:16px;text-align:left;">${greeting}</p>
        ${note}
        ${from}
        <p style="margin:0 0 6px;color:#8a7b80;font-size:13px;letter-spacing:0.12em;text-transform:uppercase;">Gift voucher</p>
        <p style="margin:0 0 14px;font-family:Georgia,serif;font-size:40px;font-weight:600;color:#a06f6c;">${formatEuro(input.amountCents)}</p>
        <div style="display:inline-block;padding:12px 20px;border:1px dashed #bda06c;border-radius:8px;font-size:20px;letter-spacing:0.12em;font-weight:600;">${escapeHtml(input.code)}</div>
        <p style="margin:18px 0 0;font-size:14px;color:#4a3b41;">Enter this code when you book at <a href="${SITE.url}/book" style="color:#a06f6c;">${SITE.url.replace(/^https?:\/\//, '')}/book</a>. The credit applies to your treatment, and any balance stays on the code for next time.</p>
      </div>
      <div style="padding:22px 4px;color:#8a7b80;font-size:13px;line-height:1.7;">
        <p style="margin:0 0 8px;">${escapeHtml(SITE.address.street)}, ${escapeHtml(SITE.address.city)}, ${escapeHtml(SITE.address.postalCode)} · ${escapeHtml(SITE.phone)}</p>
      </div>
    </div>
  </body>
</html>`;

  return { subject, html };
}

export interface WelcomeEmailInput {
  to: string;
  name?: string | null;
}

/** Sent when a new client account is created (no email confirmation needed). */
export function buildWelcomeEmail(input: WelcomeEmailInput): { subject: string; html: string } {
  const subject = `Welcome to Studio 6 Nails`;
  const greeting = input.name ? `Hi ${escapeHtml(input.name)},` : 'Hello,';

  const html = `<!doctype html>
<html>
  <body style="margin:0;background:#fcf8f5;font-family:Helvetica,Arial,sans-serif;color:#2f2429;">
    <div style="max-width:560px;margin:0 auto;padding:40px 24px;">
      <p style="margin:0 0 4px;letter-spacing:0.28em;text-transform:uppercase;font-size:11px;color:#a06f6c;">Studio 6 Nails</p>
      <h1 style="margin:0 0 22px;font-family:Georgia,serif;font-size:28px;font-weight:600;">Your account is ready.</h1>
      <div style="background:#fff;border:1px solid rgba(47,36,41,0.12);border-radius:12px;padding:26px;">
        <p style="margin:0 0 18px;font-size:16px;">${greeting}</p>
        <p style="margin:0 0 18px;font-size:15px;color:#4a3b41;">Thanks for creating an account with Studio 6 Nails. You can now book appointments online, manage or reschedule them, and check out faster next time.</p>
        <p style="margin:0 0 6px;">
          <a href="${SITE.url}/book" style="display:inline-block;background:#2f2429;color:#fcf8f5;text-decoration:none;padding:12px 22px;border-radius:8px;font-size:14px;letter-spacing:0.04em;">Book an appointment</a>
        </p>
        <p style="margin:18px 0 0;font-size:14px;color:#8a7b80;">If you didn’t create this account, you can safely ignore this email or call ${escapeHtml(SITE.phone)}.</p>
      </div>
      <div style="padding:22px 4px;color:#8a7b80;font-size:13px;line-height:1.7;">
        <p style="margin:0 0 8px;">${escapeHtml(SITE.address.street)}, ${escapeHtml(SITE.address.city)}, ${escapeHtml(SITE.address.postalCode)} · ${escapeHtml(SITE.phone)}</p>
      </div>
    </div>
  </body>
</html>`;

  return { subject, html };
}

export async function sendEmail(opts: {
  to: string;
  subject: string;
  html: string;
  bcc?: string;
}): Promise<boolean> {
  const resendKey = import.meta.env.RESEND_API_KEY;
  const from = import.meta.env.BOOKING_FROM_EMAIL ?? 'Studio 6 Nails <onboarding@resend.dev>';
  if (!resendKey) {
    console.error('RESEND_API_KEY is not set — email not sent:', opts.subject);
    return false;
  }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from,
        to: [opts.to],
        ...(opts.bcc && { bcc: [opts.bcc] }),
        subject: opts.subject,
        html: opts.html,
      }),
    });
    if (!res.ok) {
      console.error(`Resend responded ${res.status}: ${await res.text()}`);
      return false;
    }
    return true;
  } catch (err) {
    console.error('Email request failed', err);
    return false;
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
