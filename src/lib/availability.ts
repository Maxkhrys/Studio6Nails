/* ---------------------------------------------------------------------------
   Slot computation — pure functions, no database.

   Given a staff member's weekly availability rules, any one-off exceptions,
   the bookings already on their calendar, and the duration of the chosen
   service, produce the list of bookable start times for a given day.

   Kept DB-free so it's easy to reason about and test; the API route fetches
   the inputs from Supabase and calls computeDaySlots().
   --------------------------------------------------------------------------- */

export interface AvailabilityRule {
  weekday: number; // 0=Sun … 6=Sat
  start_time: string; // 'HH:MM' or 'HH:MM:SS'
  end_time: string;
}

export interface AvailabilityException {
  date: string; // 'YYYY-MM-DD'
  is_closed: boolean;
  start_time: string | null;
  end_time: string | null;
}

export interface BookingInterval {
  starts_at: string; // ISO
  ends_at: string; // ISO
}

export interface SlotOptions {
  /** Service length in minutes. */
  durationMin: number;
  /** Gap between candidate start times, default 15. */
  stepMin?: number;
  /** Don't offer slots starting before now + this many minutes. */
  leadMinutes?: number;
  /** Reference "now" (defaults to Date.now()) — injectable for tests. */
  now?: Date;
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

/** Local-time Date for a given 'YYYY-MM-DD' + minutes-since-midnight. */
function dateAtMinutes(dateStr: string, minutes: number): Date {
  const [y, mo, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, mo - 1, d, 0, 0, 0, 0);
  dt.setMinutes(minutes);
  return dt;
}

function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

/**
 * Returns ISO start times that are free for a service of `durationMin`
 * on the given local date.
 */
export function computeDaySlots(
  dateStr: string,
  rules: AvailabilityRule[],
  exceptions: AvailabilityException[],
  bookings: BookingInterval[],
  opts: SlotOptions,
): string[] {
  const { durationMin, stepMin = 15, leadMinutes = 120, now = new Date() } = opts;

  const [y, mo, d] = dateStr.split('-').map(Number);
  const weekday = new Date(y, mo - 1, d).getDay();

  // Resolve the working windows for the day (as [startMin, endMin] ranges).
  const dayException = exceptions.find((e) => e.date === dateStr);
  let windows: Array<[number, number]> = [];

  if (dayException) {
    if (dayException.is_closed) return [];
    if (dayException.start_time && dayException.end_time) {
      windows = [[toMinutes(dayException.start_time), toMinutes(dayException.end_time)]];
    }
  }
  if (windows.length === 0) {
    windows = rules
      .filter((r) => r.weekday === weekday)
      .map((r) => [toMinutes(r.start_time), toMinutes(r.end_time)] as [number, number]);
  }
  if (windows.length === 0) return [];

  // Existing bookings as minute ranges within this day.
  const busy = bookings.map((b) => {
    const s = new Date(b.starts_at);
    const e = new Date(b.ends_at);
    return [s.getHours() * 60 + s.getMinutes(), e.getHours() * 60 + e.getMinutes()] as [
      number,
      number,
    ];
  });

  const earliest = now.getTime() + leadMinutes * 60_000;
  const slots: string[] = [];

  for (const [winStart, winEnd] of windows) {
    for (let t = winStart; t + durationMin <= winEnd; t += stepMin) {
      const slotEnd = t + durationMin;
      if (busy.some(([bs, be]) => overlaps(t, slotEnd, bs, be))) continue;
      const startDate = dateAtMinutes(dateStr, t);
      if (startDate.getTime() < earliest) continue;
      slots.push(startDate.toISOString());
    }
  }

  return slots;
}
