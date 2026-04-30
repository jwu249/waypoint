-- Waypoint database schema

create table if not exists trips (
  id          uuid        default gen_random_uuid() primary key,
  name        text        not null,
  destination text,
  status      text        default 'draft'
                          check (status in ('draft', 'upcoming', 'current', 'past')),
  raw_input   text,
  start_date  date,
  end_date    date,
  user_id     uuid,
  travelers   text,
  budget      text,
  interests   text,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

create table if not exists stops (
  id               uuid        default gen_random_uuid() primary key,
  trip_id          uuid        references trips(id) on delete cascade,
  name             text        not null,
  address          text,
  lat              numeric,
  lng              numeric,
  day              integer     default 1,
  position         integer     default 0,
  notes            text,
  category         text        default 'other',
  stop_time        text,
  duration_minutes integer,
  created_at       timestamptz default now()
);

-- Profiles for display names / avatars
create table if not exists profiles (
  id           uuid        primary key,
  display_name text,
  created_at   timestamptz default now()
);

-- Collaborators: users invited to edit/view a trip
create table if not exists trip_collaborators (
  id         uuid        default gen_random_uuid() primary key,
  trip_id    uuid        references trips(id) on delete cascade not null,
  user_id    uuid        not null,
  role       text        default 'editor' check (role in ('viewer', 'editor')),
  created_at timestamptz default now(),
  unique(trip_id, user_id)
);

-- Row Level Security (open for development — tighten with auth.uid() once auth is enabled)
alter table trips             enable row level security;
alter table stops             enable row level security;
alter table profiles          enable row level security;
alter table trip_collaborators enable row level security;

create policy "Allow all on trips"              on trips              for all using (true) with check (true);
create policy "Allow all on stops"              on stops              for all using (true) with check (true);
create policy "Allow all on profiles"           on profiles           for all using (true) with check (true);
create policy "Allow all on trip_collaborators" on trip_collaborators for all using (true) with check (true);

-- Indexes
create index if not exists stops_trip_id_idx on stops (trip_id);
create index if not exists collab_trip_id_idx on trip_collaborators (trip_id);
create index if not exists collab_user_id_idx on trip_collaborators (user_id);
