-- Waypoint database schema

create table if not exists trips (
  id          uuid        default gen_random_uuid() primary key,
  name        text        not null,
  destination text,
  status      text        default 'draft'
                          check (status in ('draft', 'planned', 'shared', 'done')),
  raw_input   text,
  start_date  date,
  end_date    date,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

create table if not exists stops (
  id          uuid        default gen_random_uuid() primary key,
  trip_id     uuid        references trips(id) on delete cascade,
  name        text        not null,
  address     text,
  lat         numeric,
  lng         numeric,
  day         integer     default 1,
  position    integer     default 0,
  notes       text,
  category    text        default 'other',
  created_at  timestamptz default now()
);

-- Row Level Security (open for now — add auth later)
alter table trips enable row level security;
alter table stops enable row level security;

create policy "Allow all on trips" on trips for all using (true) with check (true);
create policy "Allow all on stops" on stops for all using (true) with check (true);

-- Index for fast trip lookups on stops
create index if not exists stops_trip_id_idx on stops (trip_id);
