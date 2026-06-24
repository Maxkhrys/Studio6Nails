-- ===========================================================================
-- Studio 6 Nails — feature migration: vouchers + reschedule
-- Run this in the Supabase SQL editor AFTER schema.sql, on the same project.
-- Safe to re-run (idempotent).
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- bookings: extra columns for vouchers + reschedule tracking
-- ---------------------------------------------------------------------------
alter table bookings add column if not exists discount_cents   int not null default 0;
alter table bookings add column if not exists voucher_id        uuid;
alter table bookings add column if not exists rescheduled_count int not null default 0;

-- ---------------------------------------------------------------------------
-- vouchers — one table covering two kinds:
--   * 'gift'  — purchased online; a stored-credit balance redeemable at booking
--   * 'promo' — owner-created discount code (fixed € or % off), with optional
--               expiry and a redemption cap
-- All money is integer euro cents.
-- ---------------------------------------------------------------------------
do $$ begin
  create type voucher_kind as enum ('gift', 'promo');
exception when duplicate_object then null; end $$;

do $$ begin
  create type discount_type as enum ('fixed', 'percent');
exception when duplicate_object then null; end $$;

create table if not exists vouchers (
  id               uuid primary key default gen_random_uuid(),
  code             text unique not null,
  kind             voucher_kind not null,

  -- promo only:
  discount_type    discount_type,          -- 'fixed' (cents) | 'percent' (whole %)
  discount_value   int,                     -- cents if fixed, 1..100 if percent
  max_redemptions  int,                     -- null = unlimited
  times_redeemed   int not null default 0,

  -- gift only:
  initial_cents    int,                     -- value purchased
  balance_cents    int,                     -- remaining credit (decrements on use)
  recipient_email  text,
  recipient_name   text,
  purchaser_email  text,
  gift_message     text,

  -- payment (gift purchases go through the payment provider):
  paid             boolean not null default true,  -- promos are usable at once
  payment_provider text,
  payment_ref      text,

  -- shared lifecycle:
  active           boolean not null default true,
  expires_at       timestamptz,
  note             text,
  created_at       timestamptz not null default now(),

  -- integrity: each kind carries the right fields
  check (
    (kind = 'promo' and discount_type is not null and discount_value is not null)
    or
    (kind = 'gift'  and initial_cents is not null and balance_cents is not null)
  )
);

create index if not exists vouchers_code_idx on vouchers (code);

-- foreign key from bookings now that vouchers exists
do $$ begin
  alter table bookings
    add constraint bookings_voucher_fk
    foreign key (voucher_id) references vouchers (id) on delete set null;
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- voucher_redemptions — audit trail; one row per booking that used a voucher.
-- unique(booking_id) makes confirmation idempotent (webhook may fire twice).
-- ---------------------------------------------------------------------------
create table if not exists voucher_redemptions (
  id           uuid primary key default gen_random_uuid(),
  voucher_id   uuid not null references vouchers (id) on delete cascade,
  booking_id   uuid unique references bookings (id) on delete set null,
  amount_cents int not null,
  created_at   timestamptz not null default now()
);

create index if not exists voucher_redemptions_voucher_idx
  on voucher_redemptions (voucher_id);

-- ===========================================================================
-- Row Level Security
-- The public booking/redemption paths run through the service-role client
-- (which bypasses RLS). These policies only grant the OWNER read/write from
-- the request-scoped client used by the admin pages.
-- ===========================================================================
alter table vouchers            enable row level security;
alter table voucher_redemptions enable row level security;

drop policy if exists vouchers_owner_all on vouchers;
create policy vouchers_owner_all on vouchers
  for all using (is_owner()) with check (is_owner());

drop policy if exists redemptions_owner_read on voucher_redemptions;
create policy redemptions_owner_read on voucher_redemptions
  for select using (is_owner());
