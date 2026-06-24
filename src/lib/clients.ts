/* ---------------------------------------------------------------------------
   Client list builder — merges registered accounts (profiles + auth emails)
   with guest bookers seen in the bookings table, keyed by email. Shared by the
   admin Clients page and the CSV export so they never drift.
   Service-role client required (reads auth users + all bookings).
   --------------------------------------------------------------------------- */

import type { SupabaseClient } from '@supabase/supabase-js';

export interface ClientRow {
  name: string;
  email: string;
  phone: string;
  role: string;
  bookings: number;
  lastVisit: string;
  signedUp: string;
}

export async function buildClientRows(admin: SupabaseClient): Promise<ClientRow[]> {
  // Registered users — email lives in auth, not profiles.
  const emailById = new Map<string, string>();
  try {
    const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    for (const u of data?.users ?? []) if (u.email) emailById.set(u.id, u.email);
  } catch (e) {
    console.error('listUsers failed', e);
  }

  const [{ data: profiles }, { data: bookings }] = await Promise.all([
    admin.from('profiles').select('id, full_name, phone, role, created_at'),
    admin.from('bookings').select('client_id, client_name, client_email, client_phone, starts_at, status'),
  ]);

  const rows = new Map<string, ClientRow>();
  const keyFor = (email: string, id?: string) =>
    (email || '').toLowerCase() || (id ? `id:${id}` : '');

  for (const p of profiles ?? []) {
    const email = emailById.get(p.id) ?? '';
    const k = keyFor(email, p.id);
    if (!k) continue;
    rows.set(k, {
      name: p.full_name ?? '',
      email,
      phone: p.phone ?? '',
      role: p.role ?? 'client',
      bookings: 0,
      lastVisit: '',
      signedUp: p.created_at ? p.created_at.slice(0, 10) : '',
    });
  }

  for (const b of bookings ?? []) {
    const email = (b.client_email ?? '').toLowerCase();
    const k = keyFor(email, b.client_id ?? undefined);
    if (!k) continue;
    let row = rows.get(k);
    if (!row) {
      row = {
        name: b.client_name ?? '',
        email: b.client_email ?? '',
        phone: b.client_phone ?? '',
        role: 'guest',
        bookings: 0,
        lastVisit: '',
        signedUp: '',
      };
      rows.set(k, row);
    }
    if (!row.name && b.client_name) row.name = b.client_name;
    if (!row.phone && b.client_phone) row.phone = b.client_phone;
    if (b.status !== 'cancelled') {
      row.bookings += 1;
      const d = (b.starts_at ?? '').slice(0, 10);
      if (d && d > row.lastVisit) row.lastVisit = d;
    }
  }

  return [...rows.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function clientsToCsv(rows: ClientRow[]): string {
  const headers = ['Name', 'Email', 'Phone', 'Role', 'Bookings', 'Last visit', 'Signed up'];
  const esc = (v: string | number) => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers.join(',')];
  for (const r of rows) {
    lines.push(
      [r.name, r.email, r.phone, r.role, r.bookings, r.lastVisit, r.signedUp].map(esc).join(','),
    );
  }
  return '﻿' + lines.join('\r\n'); // BOM so Excel reads UTF-8
}
