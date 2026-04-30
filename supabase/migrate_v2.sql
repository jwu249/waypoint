-- Migration v2: add user auth, sharing, and new trip/stop fields
-- Run this in your Supabase SQL editor (Dashboard → SQL Editor → New query)

-- ── trips: new columns ────────────────────────────────────────────
alter table trips add column if not exists user_id    uuid;
alter table trips add column if not exists travelers  text;
alter table trips add column if not exists budget     text;
alter table trips add column if not exists interests  text;

-- Drop old constraint first, migrate data, then add new constraint
alter table trips drop constraint if exists trips_status_check;

-- Migrate old status values to new ones (must happen before new constraint is added)
update trips set status = 'upcoming' where status = 'planned';
update trips set status = 'past'     where status = 'done';
update trips set status = 'upcoming' where status = 'shared';
update trips set status = 'draft'    where status not in ('draft', 'upcoming', 'current', 'past');

-- Now safe to add the new constraint
alter table trips add constraint trips_status_check
  check (status in ('draft', 'upcoming', 'current', 'past'));

-- ── stops: new columns ───────────────────────────────────────────
alter table stops add column if not exists stop_time        text;
alter table stops add column if not exists duration_minutes integer;

-- ── profiles table ───────────────────────────────────────────────
create table if not exists profiles (
  id           uuid        primary key,
  display_name text,
  created_at   timestamptz default now()
);

alter table profiles enable row level security;
drop policy if exists "Allow all on profiles" on profiles;
create policy "Allow all on profiles" on profiles for all using (true) with check (true);

-- ── trip_collaborators table ─────────────────────────────────────
create table if not exists trip_collaborators (
  id         uuid        default gen_random_uuid() primary key,
  trip_id    uuid        references trips(id) on delete cascade not null,
  user_id    uuid        not null,
  role       text        default 'editor' check (role in ('viewer', 'editor')),
  created_at timestamptz default now(),
  unique(trip_id, user_id)
);

alter table trip_collaborators enable row level security;
drop policy if exists "Allow all on trip_collaborators" on trip_collaborators;
create policy "Allow all on trip_collaborators" on trip_collaborators
  for all using (true) with check (true);

-- ── indexes ──────────────────────────────────────────────────────
create index if not exists collab_trip_id_idx on trip_collaborators (trip_id);
create index if not exists collab_user_id_idx on trip_collaborators (user_id);
