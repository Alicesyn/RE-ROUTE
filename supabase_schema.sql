-- ==============================================================================
-- RE-ROUTE: Multi-Device Cloud Sync Database Schema for Supabase
-- ==============================================================================
-- Run this script in your Supabase Dashboard -> SQL Editor
-- This sets up the 'trips' table with strict Row Level Security (RLS) so users
-- can only read, write, and delete their own itineraries.

-- 1. Create the Trips table
create table if not exists public.trips (
  id text primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  title text not null,
  data jsonb not null,
  version int default 1,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 2. Create index on user_id for fast lookups
create index if not exists idx_trips_user_id on public.trips(user_id);

-- 3. Enable Row Level Security (RLS)
alter table public.trips enable row level security;

-- 4. RLS Policies (Users only have access to rows where user_id matches their auth UID)
drop policy if exists "Users can select own trips" on public.trips;
create policy "Users can select own trips"
  on public.trips for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own trips" on public.trips;
create policy "Users can insert own trips"
  on public.trips for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update own trips" on public.trips;
create policy "Users can update own trips"
  on public.trips for update
  using (auth.uid() = user_id);

drop policy if exists "Users can delete own trips" on public.trips;
create policy "Users can delete own trips"
  on public.trips for delete
  using (auth.uid() = user_id);

-- 5. Optional: Enable realtime for multi-device sync
alter publication supabase_realtime add table public.trips;
