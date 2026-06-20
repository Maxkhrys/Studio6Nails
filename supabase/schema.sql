-- ===========================================================================
-- Studio 6 Nails — database schema (Supabase / Postgres)
-- Run in the Supabase SQL editor (or via the CLI) on a fresh project.
--
-- Design notes:
--  * Per-staff booking: each staff member has their own services + availability.
--  * Roles: client | staff | owner (owner = full access; seed of future SaaS).
--  * Slots are COMPUTED at request time from availability_rules minus existing
--    bookings and exceptions — no pre-generated slot rows. Online-only (no
--    walk-in sync for v1).
--  * Per-service deposits live on `services.deposit_cents`.
--  * Money is always integer euro cents.
-- ===========================================================================

-- Extensions ---------------------------------------------------------------
create extension if not exists "pgcrypto";

-- Enums --------------------------------------------------------------------
do $$ begin
  create type user_role as enum ('client', 'staff', 'owner');
exception when duplicate_object then null; end $$;

do $$ begin
  create type booking_status as enum (
    'pending_payment', -- created, awaiting deposit
    'confirmed',       -- deposit paid
    'cancelled',
    'completed',
    'no_show'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type service_category as enum (
    'manicures', 'pedicures', 'brows', 'lashes', 'nail-art'
  );
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- profiles — one row per auth user, holds role + contact details
-- ---------------------------------------------------------------------------
create table if not exists profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  role        user_role not null default 'client',
  full_name   text,
  phone       text,
  created_at  timestamptz not null default now()
);

-- Auto-create a profile row whenever a new auth user signs up.
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, phone)
  values (
    new.id,
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'phone'
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ---------------------------------------------------------------------------
-- staff — bookable people (each links to a profile with role staff/owner)
-- ---------------------------------------------------------------------------
create table if not exists staff (
  id           uuid primary key default gen_random_uuid(),
  profile_id   uuid unique references profiles (id) on delete set null,
  display_name text not null,
  bio          text,
  active       boolean not null default true,
  sort_order   int not null default 0,
  created_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- services — catalogue with per-service price + deposit
-- ---------------------------------------------------------------------------
create table if not exists services (
  id            uuid primary key default gen_random_uuid(),
  slug          text unique not null,
  category      service_category not null,
  name          text not null,
  description   text,
  duration_min  int not null check (duration_min > 0),
  price_cents   int not null check (price_cents >= 0),
  deposit_cents int not null default 0 check (deposit_cents >= 0),
  active        boolean not null default true,
  sort_order    int not null default 0,
  created_at    timestamptz not null default now()
);

-- which staff perform which services
create table if not exists staff_services (
  staff_id   uuid not null references staff (id) on delete cascade,
  service_id uuid not null references services (id) on delete cascade,
  primary key (staff_id, service_id)
);

-- ---------------------------------------------------------------------------
-- availability_rules — recurring weekly working hours per staff member
-- weekday: 0=Sunday … 6=Saturday (matches JS Date.getDay)
-- ---------------------------------------------------------------------------
create table if not exists availability_rules (
  id         uuid primary key default gen_random_uuid(),
  staff_id   uuid not null references staff (id) on delete cascade,
  weekday    int not null check (weekday between 0 and 6),
  start_time time not null,
  end_time   time not null,
  check (end_time > start_time)
);

-- availability_exceptions — one-off closures / holidays / extra hours
-- is_closed true = the whole day off (start/end ignored)
create table if not exists availability_exceptions (
  id         uuid primary key default gen_random_uuid(),
  staff_id   uuid not null references staff (id) on delete cascade,
  date       date not null,
  is_closed  boolean not null default true,
  start_time time,
  end_time   time,
  note       text
);

-- ---------------------------------------------------------------------------
-- bookings
-- ---------------------------------------------------------------------------
create table if not exists bookings (
  id                 uuid primary key default gen_random_uuid(),
  client_id          uuid references profiles (id) on delete set null,
  staff_id           uuid not null references staff (id) on delete restrict,
  service_id         uuid not null references services (id) on delete restrict,
  starts_at          timestamptz not null,
  ends_at            timestamptz not null,
  status             booking_status not null default 'pending_payment',
  -- snapshot of price/deposit at booking time (services may change later)
  price_cents        int not null,
  deposit_cents      int not null,
  deposit_paid       boolean not null default false,
  -- payment provider isolation: provider + reference, so Dojo can join later
  payment_provider   text,             -- 'stripe' | 'dojo' | null
  payment_ref        text,             -- Stripe session/intent id, etc.
  client_name        text,
  client_email       text,
  client_phone       text,
  notes              text,
  created_at         timestamptz not null default now(),
  check (ends_at > starts_at)
);

create index if not exists bookings_staff_time_idx on bookings (staff_id, starts_at);
create index if not exists bookings_client_idx on bookings (client_id);

-- Prevent double-booking a staff member for overlapping ACTIVE bookings.
-- (pending_payment holds the slot briefly; cancelled/no_show free it.)
create extension if not exists btree_gist;
alter table bookings drop constraint if exists bookings_no_overlap;
alter table bookings add constraint bookings_no_overlap
  exclude using gist (
    staff_id with =,
    tstzrange(starts_at, ends_at) with &&
  ) where (status in ('pending_payment', 'confirmed'));

-- ===========================================================================
-- Row Level Security
-- ===========================================================================
alter table profiles               enable row level security;
alter table staff                  enable row level security;
alter table services               enable row level security;
alter table staff_services         enable row level security;
alter table availability_rules     enable row level security;
alter table availability_exceptions enable row level security;
alter table bookings               enable row level security;

-- helper: is the current user an owner?
create or replace function is_owner()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles where id = auth.uid() and role = 'owner'
  );
$$;

-- helper: staff row id for the current user (null if not staff)
create or replace function my_staff_id()
returns uuid language sql stable security definer set search_path = public as $$
  select s.id from staff s
  join profiles p on p.id = s.profile_id
  where p.id = auth.uid();
$$;

-- profiles: users read/update their own; owner reads all
drop policy if exists profiles_self on profiles;
create policy profiles_self on profiles
  for select using (id = auth.uid() or is_owner());
drop policy if exists profiles_update_self on profiles;
create policy profiles_update_self on profiles
  for update using (id = auth.uid());

-- services / staff: world-readable (the marketing + booking UI need them);
-- only owner writes.
drop policy if exists services_read on services;
create policy services_read on services for select using (true);
drop policy if exists services_write on services;
create policy services_write on services for all using (is_owner()) with check (is_owner());

drop policy if exists staff_read on staff;
create policy staff_read on staff for select using (true);
drop policy if exists staff_write on staff;
create policy staff_write on staff for all using (is_owner()) with check (is_owner());

drop policy if exists staff_services_read on staff_services;
create policy staff_services_read on staff_services for select using (true);
drop policy if exists staff_services_write on staff_services;
create policy staff_services_write on staff_services for all using (is_owner()) with check (is_owner());

-- availability: world-readable (needed to compute public slots); owner writes
-- any, staff write their own.
drop policy if exists avail_read on availability_rules;
create policy avail_read on availability_rules for select using (true);
drop policy if exists avail_write on availability_rules;
create policy avail_write on availability_rules for all
  using (is_owner() or staff_id = my_staff_id())
  with check (is_owner() or staff_id = my_staff_id());

drop policy if exists exc_read on availability_exceptions;
create policy exc_read on availability_exceptions for select using (true);
drop policy if exists exc_write on availability_exceptions;
create policy exc_write on availability_exceptions for all
  using (is_owner() or staff_id = my_staff_id())
  with check (is_owner() or staff_id = my_staff_id());

-- bookings:
--  * clients see/cancel their own
--  * staff see bookings assigned to them
--  * owner sees all
--  NOTE: creation + deposit confirmation happen via server routes using the
--  service-role key (which bypasses RLS), so we keep client-side INSERT closed.
drop policy if exists bookings_read on bookings;
create policy bookings_read on bookings for select
  using (client_id = auth.uid() or staff_id = my_staff_id() or is_owner());

drop policy if exists bookings_client_cancel on bookings;
create policy bookings_client_cancel on bookings for update
  using (client_id = auth.uid() or staff_id = my_staff_id() or is_owner())
  with check (client_id = auth.uid() or staff_id = my_staff_id() or is_owner());
