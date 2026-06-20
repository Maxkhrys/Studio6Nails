# Studio 6 Nails

Marketing site + online booking system for **Studio 6 Nails**, Kilkenny, Ireland
([studio6nails.ie](https://studio6nails.ie)).

## Stack

- **Astro 6** (static output) + **@astrojs/vercel** adapter
- **@astrojs/sitemap**, JSON-LD `NailSalon` schema, OG/Twitter, canonical URLs (SEO built in)
- **GSAP + ScrollTrigger + Lenis** — attribute-driven animation (`data-reveal`, `data-media`, `data-parallax`), reduced-motion aware
- **Supabase** (Postgres + Auth, email/password) — bookings, client accounts, per-staff availability, admin
- **Stripe Checkout** for deposits, isolated behind `src/lib/payments/` so a Dojo
  "Pay at Counter" adapter can be added later without touching booking logic

## Local development

```bash
npm install
cp .env.example .env   # then fill in Supabase / Stripe / Resend keys
npm run dev            # http://localhost:4321
npm run build          # production build (run before pushing)
```

## Database

Run `supabase/schema.sql` then `supabase/seed.sql` in the Supabase SQL editor.
Schema covers profiles/roles, staff, services (per-service deposits),
weekly availability + exceptions, and bookings (with a no-double-booking
constraint and full row-level security).

## Status

Foundation, marketing site, SEO, database schema, payments abstraction and
slot-computation engine are in place. Auth pages, the booking UI/API routes,
client account area and admin UI are in progress.

## Placeholders pending real assets

Logo, photography, confirmed prices/per-service deposits and opening hours are
clearly-labelled placeholders until supplied by the studio. Services, prices and
hours are admin-editable.
