import type { APIRoute } from 'astro';
import { createSupabaseAdmin } from '../../../lib/supabase/admin';
import { buildClientRows, clientsToCsv } from '../../../lib/clients';

export const prerender = false;

/**
 * GET /api/admin/clients-export → clients.csv
 * Owner-only. Exports the merged client list (accounts + guest bookers).
 */
export const GET: APIRoute = async ({ locals }) => {
  if (locals.profile?.role !== 'owner') {
    return new Response('Forbidden', { status: 403 });
  }

  let admin;
  try {
    admin = createSupabaseAdmin();
  } catch {
    return new Response('Not configured', { status: 503 });
  }

  const csv = clientsToCsv(await buildClientRows(admin));
  const today = new Date().toISOString().slice(0, 10);
  return new Response(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="studio6-clients-${today}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
};
