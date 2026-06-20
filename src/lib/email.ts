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
  depositCents: number;
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
  const balance = input.priceCents - input.depositCents;
  const subject = `Your Studio 6 Nails appointment — ${when}`;

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
          <tr><td style="padding:6px 0;color:#8a7b80;">Deposit paid</td><td style="padding:6px 0;text-align:right;">${formatEuro(input.depositCents)}</td></tr>
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
