/* ---------------------------------------------------------------------------
   Studio 6 Nails — central business config.
   Single source of truth for confirmed business data (used across the
   marketing pages, SEO/JSON-LD, footer, and contact links).

   CONFIRMED data only. Anything marked PLACEHOLDER is awaiting the client
   and must not be presented to visitors as final.
   --------------------------------------------------------------------------- */

export const SITE = {
  name: 'Studio 6 Nails',
  legalName: 'Studio 6 Nails',
  tagline: 'Nail artistry in the heart of Kilkenny',
  url: 'https://studio6nails.ie',
  description:
    'Studio 6 Nails — a Kilkenny nail studio for manicures, pedicures, brows, lashes and bespoke nail art. Book your appointment online.',

  // --- Confirmed contact details --------------------------------------------
  phone: '083 155 3105',
  phoneE164: '+353831553105',
  email: 'sarah@studio6nails.ie',

  address: {
    street: "6 John's Bridge",
    city: 'Kilkenny',
    region: 'County Kilkenny',
    postalCode: 'R95 D1KF',
    country: 'IE',
  },
  // Approx. Kilkenny city-centre coords for map/JSON-LD. PLACEHOLDER:
  // replace with the studio's exact pin when confirmed.
  geo: { lat: 52.6541, lng: -7.2448 },

  instagram: {
    handle: '@studio6nailskilkenny',
    url: 'https://www.instagram.com/studio6nailskilkenny/',
  },

  // --- PLACEHOLDER: opening hours awaiting client ---------------------------
  // These will be managed via the admin once availability is configured.
  // Marked placeholder until Sarah confirms real trading hours.
  hoursArePlaceholder: true,
  hours: [
    { day: 'Monday', open: '09:30', close: '18:00' },
    { day: 'Tuesday', open: '09:30', close: '18:00' },
    { day: 'Wednesday', open: '09:30', close: '18:00' },
    { day: 'Thursday', open: '09:30', close: '20:00' },
    { day: 'Friday', open: '09:30', close: '18:00' },
    { day: 'Saturday', open: '09:00', close: '17:00' },
    { day: 'Sunday', open: null, close: null }, // closed
  ],
} as const;

export type ServiceCategory =
  | 'manicures'
  | 'pedicures'
  | 'brows'
  | 'lashes'
  | 'nail-art';

export const SERVICE_CATEGORIES: {
  id: ServiceCategory;
  label: string;
  blurb: string;
}[] = [
  {
    id: 'manicures',
    label: 'Manicures',
    blurb: 'Shape, care and colour — from classic gel to a clean, lasting finish.',
  },
  {
    id: 'pedicures',
    label: 'Pedicures',
    blurb: 'Restorative care for tired feet, finished beautifully.',
  },
  {
    id: 'brows',
    label: 'Brows',
    blurb: 'Shaping, tinting and definition tailored to your features.',
  },
  {
    id: 'lashes',
    label: 'Lashes',
    blurb: 'Lifts and extensions for soft, effortless definition.',
  },
  {
    id: 'nail-art',
    label: 'Bespoke Nail Art',
    blurb: 'Hand-painted detail and custom designs, made just for you.',
  },
];

/**
 * PLACEHOLDER service catalogue + prices.
 * These are illustrative ONLY so the site is functional end-to-end. Real
 * prices, durations and per-service deposits are confirmed by the client and
 * will live in Supabase (admin-editable). DO NOT treat these as final.
 * Amounts in euro cents.
 */
export interface PlaceholderService {
  id: string;
  category: ServiceCategory;
  name: string;
  durationMin: number;
  priceCents: number;
  depositCents: number;
  placeholder: true;
}

export const PLACEHOLDER_SERVICES: PlaceholderService[] = [
  { id: 'gel-manicure', category: 'manicures', name: 'Gel Manicure', durationMin: 45, priceCents: 3500, depositCents: 1000, placeholder: true },
  { id: 'classic-manicure', category: 'manicures', name: 'Classic Manicure', durationMin: 30, priceCents: 2500, depositCents: 1000, placeholder: true },
  { id: 'gel-pedicure', category: 'pedicures', name: 'Gel Pedicure', durationMin: 50, priceCents: 4000, depositCents: 1000, placeholder: true },
  { id: 'luxury-pedicure', category: 'pedicures', name: 'Luxury Pedicure', durationMin: 60, priceCents: 5000, depositCents: 1500, placeholder: true },
  { id: 'brow-shape-tint', category: 'brows', name: 'Brow Shape & Tint', durationMin: 30, priceCents: 2500, depositCents: 1000, placeholder: true },
  { id: 'lash-lift', category: 'lashes', name: 'Lash Lift', durationMin: 45, priceCents: 4500, depositCents: 1500, placeholder: true },
  { id: 'nail-art-full', category: 'nail-art', name: 'Bespoke Nail Art (Full Set)', durationMin: 90, priceCents: 6500, depositCents: 2000, placeholder: true },
];

export function formatEuro(cents: number): string {
  const euros = cents / 100;
  return Number.isInteger(euros) ? `€${euros}` : `€${euros.toFixed(2)}`;
}

export function fullAddress(): string {
  const a = SITE.address;
  return `${a.street}, ${a.city}, ${a.postalCode}`;
}
