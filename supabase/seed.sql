-- ===========================================================================
-- Studio 6 Nails — seed data (PLACEHOLDER)
-- Run AFTER schema.sql. Everything here is illustrative so the booking flow
-- works end-to-end before the client supplies real staff, prices and hours.
-- Replace via the admin UI once real data is confirmed.
-- ===========================================================================

-- Services (placeholder prices + per-service deposits, in euro cents) -------
insert into services (slug, category, name, description, duration_min, price_cents, deposit_cents, sort_order)
values
  ('gel-manicure',    'manicures', 'Gel Manicure',                 'Shape, cuticle care and a lasting gel colour.', 45, 3500, 1000, 1),
  ('classic-manicure','manicures', 'Classic Manicure',             'Shape, care and polish — clean and simple.',    30, 2500, 1000, 2),
  ('gel-pedicure',    'pedicures', 'Gel Pedicure',                 'Restorative foot care with a gel finish.',      50, 4000, 1000, 3),
  ('luxury-pedicure', 'pedicures', 'Luxury Pedicure',              'The full treatment — soak, scrub, massage.',    60, 5000, 1500, 4),
  ('brow-shape-tint', 'brows',     'Brow Shape & Tint',            'Shaping and tint tailored to your features.',   30, 2500, 1000, 5),
  ('lash-lift',       'lashes',    'Lash Lift',                    'A natural lift for soft, open definition.',     45, 4500, 1500, 6),
  ('nail-art-full',   'nail-art',  'Bespoke Nail Art (Full Set)',  'Hand-painted, fully custom designs.',           90, 6500, 2000, 7)
on conflict (slug) do nothing;

-- Placeholder staff member -------------------------------------------------
insert into staff (display_name, bio, sort_order)
values ('Sarah', 'Founder of Studio 6 Nails (placeholder profile).', 1)
on conflict do nothing;

-- Link the placeholder staff to every service
insert into staff_services (staff_id, service_id)
select s.id, sv.id from staff s cross join services sv
on conflict do nothing;

-- Placeholder weekly availability for the placeholder staff
-- (Tue–Sat 09:30–18:00 / 09:00–17:00 Sat). PLACEHOLDER hours.
insert into availability_rules (staff_id, weekday, start_time, end_time)
select s.id, d.weekday, d.start_time, d.end_time
from staff s
cross join (values
  (2, time '09:30', time '18:00'),
  (3, time '09:30', time '18:00'),
  (4, time '09:30', time '20:00'),
  (5, time '09:30', time '18:00'),
  (6, time '09:00', time '17:00')
) as d(weekday, start_time, end_time)
where s.display_name = 'Sarah';
