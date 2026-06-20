// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import vercel from '@astrojs/vercel';

// Static marketing site with on-demand server routes for the booking
// system, client accounts, admin, and Stripe API endpoints. Individual
// pages opt into server rendering with `export const prerender = false`.
export default defineConfig({
  site: 'https://studio6nails.ie',
  output: 'static',
  adapter: vercel(),
  integrations: [
    sitemap({
      filter: (page) =>
        // Keep private/transactional routes out of the sitemap.
        !/\/(account|admin|book|auth)\b/.test(page),
    }),
  ],
});
