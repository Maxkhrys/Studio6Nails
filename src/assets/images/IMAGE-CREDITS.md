# Image credits — PLACEHOLDERS

These are **tasteful stock placeholders** under the free
[Unsplash License](https://unsplash.com/license), used until Studio 6 Nails
supplies its own photography. They are clearly labelled "Stock photo" on the
live site. Replace each file in place (keep the same filename) with a real
photo and the site picks it up automatically.

| File | Source (Unsplash photo ID) |
|------|----------------------------|
| `hero-hands.jpg` | photo-1604654894610-df63bc536371 |
| `gallery-nail-art.jpg` | photo-1519014816548-bf5fe059798b |
| `gallery-in-progress.jpg` | photo-1632345031435-8727f6897d53 |
| `gallery-interior.jpg` | photo-1633681926022-84c23e8cb2d6 |
| `gallery-finished.jpg` | photo-1607779097040-26e80aa78e66 |

The About section now reuses `gallery-in-progress.jpg` (a manicure in
progress) until a real studio/portrait photo is supplied. The Visit section
shows a live, interactive OpenStreetMap embed centred on the studio's
coordinates (`SITE.geo`) instead of a placeholder panel — no API key
required. Update `SITE.geo` in `src/lib/site.ts` with the exact pin when
confirmed.
