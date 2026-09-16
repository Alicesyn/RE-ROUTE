-- ==============================================================================
-- RE-ROUTE: Visitor Analytics & Telemetry Schema for Supabase (Optional)
-- ==============================================================================
-- Run this script in your Supabase Dashboard -> SQL Editor if you wish to retain
-- long-term relational telemetry records alongside Redis real-time counters.

-- 1. Create table for daily aggregated analytics snapshots
create table if not exists public.analytics_daily_stats (
  date date primary key,
  unique_visitors int default 0,
  total_pageviews int default 0,
  countries jsonb default '{}'::jsonb,
  cities jsonb default '{}'::jsonb,
  devices jsonb default '{}'::jsonb,
  events jsonb default '{}'::jsonb,
  api_stats jsonb default '{}'::jsonb,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 2. Create table for anonymous event telemetry stream
create table if not exists public.analytics_events (
  id uuid default gen_random_uuid() primary key,
  visitor_id text not null,
  event_name text not null,
  metadata jsonb default '{}'::jsonb,
  country text,
  city text,
  device text,
  browser text,
  referrer text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 3. Create indices for analytics queries
create index if not exists idx_analytics_events_name on public.analytics_events(event_name);
create index if not exists idx_analytics_events_created_at on public.analytics_events(created_at);
create index if not exists idx_analytics_events_country on public.analytics_events(country);

-- 4. Enable Row Level Security (RLS)
alter table public.analytics_daily_stats enable row level security;
alter table public.analytics_events enable row level security;

-- 5. Policies:
-- Anonymous clients can INSERT events safely
drop policy if exists "Allow anonymous event inserts" on public.analytics_events;
create policy "Allow anonymous event inserts"
  on public.analytics_events for insert
  with check (true);

-- Daily stats read-only for public/authenticated
drop policy if exists "Allow reading daily aggregated stats" on public.analytics_daily_stats;
create policy "Allow reading daily aggregated stats"
  on public.analytics_daily_stats for select
  using (true);
